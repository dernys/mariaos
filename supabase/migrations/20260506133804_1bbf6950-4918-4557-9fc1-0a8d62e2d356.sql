-- ============================================
-- FASE 1: Integridad POS + Inventario por ubicación
-- ============================================

-- 1) PRODUCT_STOCK: stock por ubicación (almacén o tienda)
CREATE TABLE IF NOT EXISTS public.product_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  product_id uuid NOT NULL,
  location_type text NOT NULL CHECK (location_type IN ('warehouse','store')),
  location_id uuid NOT NULL,
  stock numeric NOT NULL DEFAULT 0,
  min_stock numeric NOT NULL DEFAULT 0,
  reserved numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, location_type, location_id)
);

CREATE INDEX IF NOT EXISTS idx_product_stock_tenant ON public.product_stock(tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_stock_product ON public.product_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_product_stock_location ON public.product_stock(location_type, location_id);

ALTER TABLE public.product_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant view product_stock" ON public.product_stock FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant insert product_stock" ON public.product_stock FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant update product_stock" ON public.product_stock FOR UPDATE
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Admin delete product_stock" ON public.product_stock FOR DELETE
  USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Superadmin all product_stock" ON public.product_stock FOR ALL TO authenticated
  USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));

CREATE TRIGGER product_stock_updated_at BEFORE UPDATE ON public.product_stock
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) STOCK_TRANSFERS: transferencias profesionales con estados
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  transfer_number text NOT NULL,
  origin_type text NOT NULL CHECK (origin_type IN ('warehouse','store')),
  origin_id uuid NOT NULL,
  destination_type text NOT NULL CHECK (destination_type IN ('warehouse','store')),
  destination_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','in_transit','received','cancelled')),
  notes text,
  requested_by uuid,
  approved_by uuid,
  shipped_by uuid,
  received_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  shipped_at timestamptz,
  received_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_tenant ON public.stock_transfers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_status ON public.stock_transfers(status);

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant view stock_transfers" ON public.stock_transfers FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant insert stock_transfers" ON public.stock_transfers FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant update stock_transfers" ON public.stock_transfers FOR UPDATE
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Superadmin all stock_transfers" ON public.stock_transfers FOR ALL TO authenticated
  USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));

CREATE TRIGGER stock_transfers_updated_at BEFORE UPDATE ON public.stock_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) STOCK_TRANSFER_ITEMS
CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  product_name text NOT NULL,
  sku text,
  quantity_requested numeric NOT NULL DEFAULT 0,
  quantity_shipped numeric NOT NULL DEFAULT 0,
  quantity_received numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transfer_items_transfer ON public.stock_transfer_items(transfer_id);

ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant view transfer_items" ON public.stock_transfer_items FOR SELECT
  USING (transfer_id IN (SELECT id FROM stock_transfers WHERE tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())));
CREATE POLICY "Tenant insert transfer_items" ON public.stock_transfer_items FOR INSERT
  WITH CHECK (transfer_id IN (SELECT id FROM stock_transfers WHERE tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())));
CREATE POLICY "Tenant update transfer_items" ON public.stock_transfer_items FOR UPDATE
  USING (transfer_id IN (SELECT id FROM stock_transfers WHERE tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())));
CREATE POLICY "Superadmin all transfer_items" ON public.stock_transfer_items FOR ALL TO authenticated
  USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));

-- 4) AÑADIR columnas a SALES e INVENTORY_MOVEMENTS para integridad
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS ticket_number text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS ticket_series text DEFAULT 'T';
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS store_id uuid;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS product_id uuid;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS location_type text;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS location_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_ticket_unique
  ON public.sales(tenant_id, ticket_series, ticket_number)
  WHERE ticket_number IS NOT NULL;

-- 5) TICKET_COUNTERS: contador correlativo por tenant+serie
CREATE TABLE IF NOT EXISTS public.ticket_counters (
  tenant_id uuid NOT NULL,
  series text NOT NULL DEFAULT 'T',
  last_number bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, series)
);

ALTER TABLE public.ticket_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant view ticket_counters" ON public.ticket_counters FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Superadmin all ticket_counters" ON public.ticket_counters FOR ALL TO authenticated
  USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));

-- 6) TRIGGER: asignar ticket correlativo al insertar sale
CREATE OR REPLACE FUNCTION public.assign_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series text;
  v_next bigint;
BEGIN
  IF NEW.ticket_number IS NOT NULL THEN
    RETURN NEW;
  END IF;
  v_series := COALESCE(NEW.ticket_series, 'T');

  INSERT INTO public.ticket_counters (tenant_id, series, last_number)
    VALUES (NEW.tenant_id, v_series, 1)
  ON CONFLICT (tenant_id, series) DO UPDATE
    SET last_number = ticket_counters.last_number + 1,
        updated_at = now()
  RETURNING last_number INTO v_next;

  NEW.ticket_number := v_series || '-' || lpad(v_next::text, 6, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_ticket_number ON public.sales;
CREATE TRIGGER trg_assign_ticket_number
  BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.assign_ticket_number();

-- 7) RPC: process_sale_stock — descuenta stock de una ubicación al confirmar venta
CREATE OR REPLACE FUNCTION public.process_sale_stock(
  p_sale_id uuid,
  p_location_type text,
  p_location_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  r record;
  v_prev numeric;
  v_new numeric;
BEGIN
  SELECT tenant_id INTO v_tenant FROM sales WHERE id = p_sale_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Venta no encontrada'; END IF;

  FOR r IN
    SELECT si.product_id, si.qty, si.product_name
    FROM sale_items si
    WHERE si.sale_id = p_sale_id AND si.product_id IS NOT NULL
  LOOP
    INSERT INTO product_stock (tenant_id, product_id, location_type, location_id, stock)
      VALUES (v_tenant, r.product_id, p_location_type, p_location_id, 0)
    ON CONFLICT (product_id, location_type, location_id) DO NOTHING;

    SELECT stock INTO v_prev FROM product_stock
      WHERE product_id = r.product_id AND location_type = p_location_type AND location_id = p_location_id
      FOR UPDATE;

    v_new := COALESCE(v_prev,0) - r.qty;

    UPDATE product_stock SET stock = v_new, updated_at = now()
      WHERE product_id = r.product_id AND location_type = p_location_type AND location_id = p_location_id;

    INSERT INTO inventory_movements (
      tenant_id, product_id, movement_type, quantity, previous_stock, new_stock,
      reference_type, reference_id, performed_by, location_type, location_id, reason
    ) VALUES (
      v_tenant, r.product_id, 'sale', r.qty, COALESCE(v_prev,0), v_new,
      'sale', p_sale_id, auth.uid(), p_location_type, p_location_id, 'Venta POS'
    );
  END LOOP;
END;
$$;

-- 8) RPC: revert_sale_stock — devuelve stock al anular venta
CREATE OR REPLACE FUNCTION public.revert_sale_stock(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  r record;
  v_prev numeric;
  v_new numeric;
BEGIN
  SELECT tenant_id INTO v_tenant FROM sales WHERE id = p_sale_id;

  FOR r IN
    SELECT im.product_id, im.quantity, im.location_type, im.location_id
    FROM inventory_movements im
    WHERE im.reference_id = p_sale_id AND im.reference_type = 'sale' AND im.movement_type = 'sale'
  LOOP
    SELECT stock INTO v_prev FROM product_stock
      WHERE product_id = r.product_id AND location_type = r.location_type AND location_id = r.location_id
      FOR UPDATE;
    v_new := COALESCE(v_prev,0) + r.quantity;
    UPDATE product_stock SET stock = v_new, updated_at = now()
      WHERE product_id = r.product_id AND location_type = r.location_type AND location_id = r.location_id;

    INSERT INTO inventory_movements (
      tenant_id, product_id, movement_type, quantity, previous_stock, new_stock,
      reference_type, reference_id, performed_by, location_type, location_id, reason
    ) VALUES (
      v_tenant, r.product_id, 'sale_revert', r.quantity, COALESCE(v_prev,0), v_new,
      'sale', p_sale_id, auth.uid(), r.location_type, r.location_id, 'Anulación de venta'
    );
  END LOOP;
END;
$$;

-- 9) RPC: receive_stock_transfer — recibe transferencia y mueve stock
CREATE OR REPLACE FUNCTION public.receive_stock_transfer(p_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t record;
  r record;
  v_origin_prev numeric;
  v_dest_prev numeric;
BEGIN
  SELECT * INTO v_t FROM stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF v_t IS NULL THEN RAISE EXCEPTION 'Transferencia no encontrada'; END IF;
  IF v_t.status NOT IN ('in_transit','approved') THEN
    RAISE EXCEPTION 'La transferencia no está en estado válido para recibir';
  END IF;

  FOR r IN
    SELECT product_id, COALESCE(NULLIF(quantity_received,0), quantity_shipped, quantity_requested) AS qty
    FROM stock_transfer_items WHERE transfer_id = p_transfer_id
  LOOP
    -- descuenta origen
    SELECT stock INTO v_origin_prev FROM product_stock
      WHERE product_id = r.product_id AND location_type = v_t.origin_type AND location_id = v_t.origin_id
      FOR UPDATE;
    UPDATE product_stock SET stock = COALESCE(v_origin_prev,0) - r.qty, updated_at = now()
      WHERE product_id = r.product_id AND location_type = v_t.origin_type AND location_id = v_t.origin_id;

    -- suma destino
    INSERT INTO product_stock (tenant_id, product_id, location_type, location_id, stock)
      VALUES (v_t.tenant_id, r.product_id, v_t.destination_type, v_t.destination_id, 0)
    ON CONFLICT (product_id, location_type, location_id) DO NOTHING;
    SELECT stock INTO v_dest_prev FROM product_stock
      WHERE product_id = r.product_id AND location_type = v_t.destination_type AND location_id = v_t.destination_id
      FOR UPDATE;
    UPDATE product_stock SET stock = COALESCE(v_dest_prev,0) + r.qty, updated_at = now()
      WHERE product_id = r.product_id AND location_type = v_t.destination_type AND location_id = v_t.destination_id;

    -- movimientos
    INSERT INTO inventory_movements (tenant_id, product_id, movement_type, quantity, previous_stock, new_stock,
      reference_type, reference_id, performed_by, location_type, location_id, reason)
    VALUES (v_t.tenant_id, r.product_id, 'transfer_out', r.qty, COALESCE(v_origin_prev,0), COALESCE(v_origin_prev,0)-r.qty,
      'transfer', p_transfer_id, auth.uid(), v_t.origin_type, v_t.origin_id, 'Salida por transferencia');
    INSERT INTO inventory_movements (tenant_id, product_id, movement_type, quantity, previous_stock, new_stock,
      reference_type, reference_id, performed_by, location_type, location_id, reason)
    VALUES (v_t.tenant_id, r.product_id, 'transfer_in', r.qty, COALESCE(v_dest_prev,0), COALESCE(v_dest_prev,0)+r.qty,
      'transfer', p_transfer_id, auth.uid(), v_t.destination_type, v_t.destination_id, 'Entrada por transferencia');
  END LOOP;

  UPDATE stock_transfers SET status = 'received', received_at = now(), received_by = auth.uid(), updated_at = now()
    WHERE id = p_transfer_id;
END;
$$;

-- 10) MIGRACIÓN inicial de stock: products.stock -> product_stock (en su warehouse_id si existe)
INSERT INTO public.product_stock (tenant_id, product_id, location_type, location_id, stock, min_stock)
SELECT p.tenant_id, p.id, 'warehouse', p.warehouse_id, p.stock, p.min_stock
FROM public.products p
WHERE p.warehouse_id IS NOT NULL AND p.tenant_id IS NOT NULL
ON CONFLICT (product_id, location_type, location_id) DO NOTHING;

-- 11) Bloquear UPDATE/DELETE en activity_log para inmutabilidad
REVOKE UPDATE, DELETE ON public.activity_log FROM authenticated, anon;