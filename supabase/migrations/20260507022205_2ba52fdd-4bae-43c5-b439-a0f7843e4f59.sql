
-- Add consignment flag to purchases
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS is_consignment boolean NOT NULL DEFAULT false;

-- Consignment lots
CREATE TABLE IF NOT EXISTS public.consignment_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  product_id uuid NOT NULL,
  purchase_id uuid,
  location_type text NOT NULL,
  location_id uuid NOT NULL,
  unit_cost numeric NOT NULL DEFAULT 0,
  quantity_received numeric NOT NULL DEFAULT 0,
  quantity_sold numeric NOT NULL DEFAULT 0,
  quantity_returned numeric NOT NULL DEFAULT 0,
  quantity_remaining numeric GENERATED ALWAYS AS (quantity_received - quantity_sold - quantity_returned) STORED,
  status text NOT NULL DEFAULT 'active',
  notes text,
  expires_at date,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consignment_lots_tenant ON public.consignment_lots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_consignment_lots_supplier ON public.consignment_lots(supplier_id);
CREATE INDEX IF NOT EXISTS idx_consignment_lots_product ON public.consignment_lots(product_id);
CREATE INDEX IF NOT EXISTS idx_consignment_lots_status ON public.consignment_lots(status);

ALTER TABLE public.consignment_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant manage consignment_lots" ON public.consignment_lots FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()) OR is_superadmin(auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()) OR is_superadmin(auth.uid()));

CREATE TRIGGER trg_consignment_lots_updated BEFORE UPDATE ON public.consignment_lots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Settlements
CREATE TABLE IF NOT EXISTS public.consignment_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  lot_id uuid NOT NULL REFERENCES public.consignment_lots(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL,
  sale_id uuid,
  quantity numeric NOT NULL,
  unit_cost numeric NOT NULL,
  total numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payment_id uuid,
  settled_at timestamptz,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consignment_settlements_tenant ON public.consignment_settlements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_consignment_settlements_supplier ON public.consignment_settlements(supplier_id);
CREATE INDEX IF NOT EXISTS idx_consignment_settlements_status ON public.consignment_settlements(status);
CREATE INDEX IF NOT EXISTS idx_consignment_settlements_lot ON public.consignment_settlements(lot_id);

ALTER TABLE public.consignment_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant view consignment_settlements" ON public.consignment_settlements FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()) OR is_superadmin(auth.uid()));

CREATE POLICY "tenant insert consignment_settlements" ON public.consignment_settlements FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()) OR is_superadmin(auth.uid()));

CREATE POLICY "tenant update consignment_settlements" ON public.consignment_settlements FOR UPDATE
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()) OR is_superadmin(auth.uid()));

-- Receive a consignment purchase: creates lots + adds stock, no debt
CREATE OR REPLACE FUNCTION public.receive_purchase_consignment(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p record;
  r record;
  v_prev numeric;
  v_new numeric;
BEGIN
  SELECT * INTO v_p FROM purchases WHERE id = p_purchase_id FOR UPDATE;
  IF v_p IS NULL THEN RAISE EXCEPTION 'Compra no encontrada'; END IF;
  IF v_p.status = 'received' THEN RAISE EXCEPTION 'La compra ya fue recibida'; END IF;
  IF NOT v_p.is_consignment THEN RAISE EXCEPTION 'La compra no está marcada como consignación'; END IF;

  FOR r IN SELECT * FROM purchase_items WHERE purchase_id = p_purchase_id LOOP
    IF r.product_id IS NULL THEN CONTINUE; END IF;

    -- stock
    INSERT INTO product_stock (tenant_id, product_id, location_type, location_id, stock)
      VALUES (v_p.tenant_id, r.product_id, v_p.destination_type, v_p.destination_id, 0)
    ON CONFLICT (product_id, location_type, location_id) DO NOTHING;

    SELECT stock INTO v_prev FROM product_stock
      WHERE product_id = r.product_id AND location_type = v_p.destination_type AND location_id = v_p.destination_id
      FOR UPDATE;

    v_new := COALESCE(v_prev,0) + r.qty;
    UPDATE product_stock SET stock = v_new, updated_at = now()
      WHERE product_id = r.product_id AND location_type = v_p.destination_type AND location_id = v_p.destination_id;

    UPDATE purchase_items SET qty_received = r.qty WHERE id = r.id;

    INSERT INTO inventory_movements (tenant_id, product_id, movement_type, quantity, previous_stock, new_stock,
      reference_type, reference_id, performed_by, location_type, location_id, reason)
    VALUES (v_p.tenant_id, r.product_id, 'consignment_in', r.qty, COALESCE(v_prev,0), v_new,
      'purchase', p_purchase_id, auth.uid(), v_p.destination_type, v_p.destination_id, 'Recepción en consignación');

    -- create lot
    INSERT INTO consignment_lots (tenant_id, supplier_id, product_id, purchase_id, location_type, location_id, unit_cost, quantity_received)
    VALUES (v_p.tenant_id, v_p.supplier_id, r.product_id, p_purchase_id, v_p.destination_type, v_p.destination_id, r.cost, r.qty);
  END LOOP;

  -- mark received but no debt: set amount_paid = total to avoid CxP entry
  UPDATE purchases SET status = 'received', received_at = now(), received_by = auth.uid(),
    amount_paid = total, updated_at = now()
    WHERE id = p_purchase_id;
END;
$$;

-- Allocate sold quantities to consignment lots (FIFO)
CREATE OR REPLACE FUNCTION public.allocate_consignment_for_sale(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
  it record;
  lot record;
  remaining numeric;
  take numeric;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF v_sale IS NULL THEN RETURN; END IF;

  FOR it IN SELECT product_id, qty FROM sale_items WHERE sale_id = p_sale_id AND product_id IS NOT NULL LOOP
    remaining := it.qty;
    FOR lot IN
      SELECT * FROM consignment_lots
      WHERE tenant_id = v_sale.tenant_id AND product_id = it.product_id
        AND status = 'active' AND quantity_remaining > 0
      ORDER BY received_at ASC, id ASC
      FOR UPDATE
    LOOP
      EXIT WHEN remaining <= 0;
      take := LEAST(remaining, lot.quantity_remaining);
      UPDATE consignment_lots SET quantity_sold = quantity_sold + take, updated_at = now() WHERE id = lot.id;
      INSERT INTO consignment_settlements (tenant_id, lot_id, supplier_id, sale_id, quantity, unit_cost, total)
      VALUES (v_sale.tenant_id, lot.id, lot.supplier_id, p_sale_id, take, lot.unit_cost, take * lot.unit_cost);
      remaining := remaining - take;
    END LOOP;
  END LOOP;
END;
$$;

-- Trigger: when sale becomes paid, allocate consignment
CREATE OR REPLACE FUNCTION public.trg_consignment_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status <> 'paid') THEN
    PERFORM public.allocate_consignment_for_sale(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_consignment_alloc ON public.sales;
CREATE TRIGGER sales_consignment_alloc
AFTER INSERT OR UPDATE OF status ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.trg_consignment_on_paid();

-- Settle pending settlements: register supplier payment
CREATE OR REPLACE FUNCTION public.settle_consignment_lots(p_settlement_ids uuid[], p_method text DEFAULT 'cash', p_notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supplier uuid;
  v_tenant uuid;
  v_total numeric := 0;
  s record;
  v_payment_id uuid;
BEGIN
  -- Validate: same supplier and tenant, all pending
  SELECT DISTINCT supplier_id, tenant_id INTO v_supplier, v_tenant
  FROM consignment_settlements WHERE id = ANY(p_settlement_ids);

  IF v_supplier IS NULL THEN RAISE EXCEPTION 'No hay liquidaciones seleccionadas'; END IF;

  IF (SELECT COUNT(DISTINCT supplier_id) FROM consignment_settlements WHERE id = ANY(p_settlement_ids)) > 1 THEN
    RAISE EXCEPTION 'Las liquidaciones deben ser del mismo proveedor';
  END IF;

  SELECT COALESCE(SUM(total),0) INTO v_total FROM consignment_settlements
    WHERE id = ANY(p_settlement_ids) AND status = 'pending';

  IF v_total <= 0 THEN RAISE EXCEPTION 'Nada por liquidar'; END IF;

  -- Create supplier debt first (we owe), then pay
  UPDATE suppliers SET balance = balance + v_total, updated_at = now() WHERE id = v_supplier;

  v_payment_id := public.register_account_payment(
    'supplier', v_supplier, v_total, p_method, 'CUP', 1, 'consignment', NULL,
    COALESCE(p_notes, 'Liquidación de consignación')
  );

  UPDATE consignment_settlements
    SET status = 'settled', settled_at = now(), payment_id = v_payment_id, performed_by = auth.uid()
    WHERE id = ANY(p_settlement_ids) AND status = 'pending';

  RETURN v_payment_id;
END;
$$;
