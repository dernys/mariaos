-- ============ FASE 3: Compras, Devoluciones, Arqueo de turnos ============

-- 1) Proveedores
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  address text,
  rfc text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  balance numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant view suppliers" ON public.suppliers FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant insert suppliers" ON public.suppliers FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant update suppliers" ON public.suppliers FOR UPDATE
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Admin delete suppliers" ON public.suppliers FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Superadmin all suppliers" ON public.suppliers FOR ALL TO authenticated
  USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));

CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Compras (cabecera)
CREATE TABLE IF NOT EXISTS public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  purchase_number text,
  invoice_number text,
  destination_type text NOT NULL DEFAULT 'warehouse',
  destination_id uuid,
  status text NOT NULL DEFAULT 'pending', -- pending, received, cancelled
  subtotal numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  received_at timestamptz,
  received_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant view purchases" ON public.purchases FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant insert purchases" ON public.purchases FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant update purchases" ON public.purchases FOR UPDATE
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Superadmin all purchases" ON public.purchases FOR ALL TO authenticated
  USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));
CREATE TRIGGER trg_purchases_updated BEFORE UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Items de compra
CREATE TABLE IF NOT EXISTS public.purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id uuid,
  product_name text NOT NULL,
  sku text,
  qty numeric NOT NULL DEFAULT 1,
  qty_received numeric NOT NULL DEFAULT 0,
  cost numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant view purchase_items" ON public.purchase_items FOR SELECT
  USING (purchase_id IN (SELECT id FROM purchases WHERE tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())));
CREATE POLICY "Tenant insert purchase_items" ON public.purchase_items FOR INSERT
  WITH CHECK (purchase_id IN (SELECT id FROM purchases WHERE tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())));
CREATE POLICY "Tenant update purchase_items" ON public.purchase_items FOR UPDATE
  USING (purchase_id IN (SELECT id FROM purchases WHERE tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())));
CREATE POLICY "Superadmin all purchase_items" ON public.purchase_items FOR ALL TO authenticated
  USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));

-- 4) Devoluciones de venta
CREATE TABLE IF NOT EXISTS public.sale_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  return_number text,
  reason text,
  total numeric NOT NULL DEFAULT 0,
  refund_method text NOT NULL DEFAULT 'cash',
  restock boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'completed',
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant view sale_returns" ON public.sale_returns FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant insert sale_returns" ON public.sale_returns FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Superadmin all sale_returns" ON public.sale_returns FOR ALL TO authenticated
  USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.sale_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.sale_returns(id) ON DELETE CASCADE,
  sale_item_id uuid,
  product_id uuid,
  product_name text NOT NULL,
  qty numeric NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sale_return_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant view sale_return_items" ON public.sale_return_items FOR SELECT
  USING (return_id IN (SELECT id FROM sale_returns WHERE tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())));
CREATE POLICY "Tenant insert sale_return_items" ON public.sale_return_items FOR INSERT
  WITH CHECK (return_id IN (SELECT id FROM sale_returns WHERE tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())));
CREATE POLICY "Superadmin all sale_return_items" ON public.sale_return_items FOR ALL TO authenticated
  USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));

-- 5) Movimientos de caja del turno
CREATE TABLE IF NOT EXISTS public.shift_cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.sales_shifts(id) ON DELETE CASCADE,
  tenant_id uuid,
  movement_type text NOT NULL, -- 'in' | 'out'
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'CUP',
  reason text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shift_cash_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant view shift_cash_movements" ON public.shift_cash_movements FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant insert shift_cash_movements" ON public.shift_cash_movements FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Superadmin all shift_cash_movements" ON public.shift_cash_movements FOR ALL TO authenticated
  USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));

-- columnas extra en sales_shifts para arqueo
ALTER TABLE public.sales_shifts
  ADD COLUMN IF NOT EXISTS expected_cash numeric,
  ADD COLUMN IF NOT EXISTS declared_cash numeric,
  ADD COLUMN IF NOT EXISTS cash_difference numeric,
  ADD COLUMN IF NOT EXISTS cash_in_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_out_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS returns_total numeric DEFAULT 0;

-- ============ RPCs ============

-- Recibir compra: incrementa stock en destino y registra movimientos
CREATE OR REPLACE FUNCTION public.receive_purchase(p_purchase_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_p record;
  r record;
  v_prev numeric;
  v_new numeric;
BEGIN
  SELECT * INTO v_p FROM purchases WHERE id = p_purchase_id FOR UPDATE;
  IF v_p IS NULL THEN RAISE EXCEPTION 'Compra no encontrada'; END IF;
  IF v_p.status = 'received' THEN RAISE EXCEPTION 'La compra ya fue recibida'; END IF;

  FOR r IN SELECT * FROM purchase_items WHERE purchase_id = p_purchase_id LOOP
    IF r.product_id IS NULL THEN CONTINUE; END IF;

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
    VALUES (v_p.tenant_id, r.product_id, 'purchase', r.qty, COALESCE(v_prev,0), v_new,
      'purchase', p_purchase_id, auth.uid(), v_p.destination_type, v_p.destination_id, 'Recepción de compra');
  END LOOP;

  UPDATE purchases SET status = 'received', received_at = now(), received_by = auth.uid(), updated_at = now()
    WHERE id = p_purchase_id;
END; $$;

-- Procesar devolución: opcionalmente reingresa stock
CREATE OR REPLACE FUNCTION public.process_sale_return(p_return_id uuid, p_location_type text, p_location_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_r record;
  it record;
  v_prev numeric;
  v_new numeric;
BEGIN
  SELECT * INTO v_r FROM sale_returns WHERE id = p_return_id FOR UPDATE;
  IF v_r IS NULL THEN RAISE EXCEPTION 'Devolución no encontrada'; END IF;
  IF NOT v_r.restock THEN RETURN; END IF;

  FOR it IN SELECT * FROM sale_return_items WHERE return_id = p_return_id LOOP
    IF it.product_id IS NULL THEN CONTINUE; END IF;
    INSERT INTO product_stock (tenant_id, product_id, location_type, location_id, stock)
      VALUES (v_r.tenant_id, it.product_id, p_location_type, p_location_id, 0)
    ON CONFLICT (product_id, location_type, location_id) DO NOTHING;
    SELECT stock INTO v_prev FROM product_stock
      WHERE product_id = it.product_id AND location_type = p_location_type AND location_id = p_location_id
      FOR UPDATE;
    v_new := COALESCE(v_prev,0) + it.qty;
    UPDATE product_stock SET stock = v_new, updated_at = now()
      WHERE product_id = it.product_id AND location_type = p_location_type AND location_id = p_location_id;
    INSERT INTO inventory_movements (tenant_id, product_id, movement_type, quantity, previous_stock, new_stock,
      reference_type, reference_id, performed_by, location_type, location_id, reason)
    VALUES (v_r.tenant_id, it.product_id, 'return', it.qty, COALESCE(v_prev,0), v_new,
      'sale_return', p_return_id, auth.uid(), p_location_type, p_location_id, 'Devolución de venta');
  END LOOP;
END; $$;

-- Resumen de turno (para arqueo)
CREATE OR REPLACE FUNCTION public.calculate_shift_summary(p_shift_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shift record;
  v_cash_sales numeric := 0;
  v_total_sales numeric := 0;
  v_tx int := 0;
  v_in numeric := 0;
  v_out numeric := 0;
  v_returns numeric := 0;
  v_expected numeric := 0;
BEGIN
  SELECT * INTO v_shift FROM sales_shifts WHERE id = p_shift_id;
  IF v_shift IS NULL THEN RAISE EXCEPTION 'Turno no encontrado'; END IF;

  SELECT COALESCE(SUM(sp.amount_in_base),0) INTO v_cash_sales
    FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
    WHERE s.shift_id = p_shift_id AND sp.method = 'cash';

  SELECT COALESCE(SUM(total),0), COUNT(*) INTO v_total_sales, v_tx
    FROM sales WHERE shift_id = p_shift_id AND status IN ('paid','partial');

  SELECT COALESCE(SUM(amount),0) INTO v_in FROM shift_cash_movements
    WHERE shift_id = p_shift_id AND movement_type = 'in';
  SELECT COALESCE(SUM(amount),0) INTO v_out FROM shift_cash_movements
    WHERE shift_id = p_shift_id AND movement_type = 'out';

  SELECT COALESCE(SUM(sr.total),0) INTO v_returns
    FROM sale_returns sr JOIN sales s ON s.id = sr.sale_id
    WHERE s.shift_id = p_shift_id AND sr.refund_method = 'cash';

  v_expected := COALESCE(v_shift.opening_cash,0) + v_cash_sales + v_in - v_out - v_returns;

  RETURN jsonb_build_object(
    'opening_cash', COALESCE(v_shift.opening_cash,0),
    'cash_sales', v_cash_sales,
    'total_sales', v_total_sales,
    'transactions', v_tx,
    'cash_in', v_in,
    'cash_out', v_out,
    'returns_cash', v_returns,
    'expected_cash', v_expected
  );
END; $$;

-- Cerrar turno con arqueo
CREATE OR REPLACE FUNCTION public.close_shift_with_summary(p_shift_id uuid, p_declared_cash numeric, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_summary jsonb;
  v_expected numeric;
  v_diff numeric;
BEGIN
  v_summary := public.calculate_shift_summary(p_shift_id);
  v_expected := (v_summary->>'expected_cash')::numeric;
  v_diff := p_declared_cash - v_expected;

  UPDATE sales_shifts SET
    status = 'closed',
    closed_at = now(),
    closing_cash = p_declared_cash,
    declared_cash = p_declared_cash,
    expected_cash = v_expected,
    cash_difference = v_diff,
    cash_in_total = (v_summary->>'cash_in')::numeric,
    cash_out_total = (v_summary->>'cash_out')::numeric,
    returns_total = (v_summary->>'returns_cash')::numeric,
    total_sales = (v_summary->>'total_sales')::numeric,
    total_transactions = (v_summary->>'transactions')::int,
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE id = p_shift_id;

  RETURN v_summary || jsonb_build_object('declared_cash', p_declared_cash, 'difference', v_diff);
END; $$;
