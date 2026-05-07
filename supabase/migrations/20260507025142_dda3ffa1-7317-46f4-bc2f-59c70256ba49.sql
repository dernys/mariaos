
-- Supplier products catalog: track which products each supplier can provide, with status & cost history
CREATE TABLE IF NOT EXISTS public.supplier_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  sku text,
  supplier_sku text,
  unit_cost numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'CUP',
  min_order_qty numeric NOT NULL DEFAULT 1,
  lead_time_days integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'available',  -- available | low_stock | out_of_stock | discontinued
  is_preferred boolean NOT NULL DEFAULT false,
  is_consignment boolean NOT NULL DEFAULT false,
  last_purchase_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, supplier_id, product_name, supplier_sku)
);

ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant manage supplier_products" ON public.supplier_products
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid())
    OR is_superadmin(auth.uid())
  ) WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid())
    OR is_superadmin(auth.uid())
  );

CREATE TRIGGER trg_supplier_products_updated
  BEFORE UPDATE ON public.supplier_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_supplier_products_tenant ON public.supplier_products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_products_supplier ON public.supplier_products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_products_product ON public.supplier_products(product_id);

-- When a purchase_item is recorded, automatically upsert/update the supplier_products entry
CREATE OR REPLACE FUNCTION public.sync_supplier_product_from_purchase()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant uuid;
  v_supplier uuid;
BEGIN
  SELECT tenant_id, supplier_id INTO v_tenant, v_supplier
  FROM public.purchases WHERE id = NEW.purchase_id;

  IF v_supplier IS NULL OR v_tenant IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.supplier_products (
    tenant_id, supplier_id, product_id, product_name, sku, supplier_sku,
    unit_cost, last_purchase_at, status
  ) VALUES (
    v_tenant, v_supplier, NEW.product_id, NEW.product_name, NEW.sku, NEW.sku,
    NEW.cost, now(), 'available'
  )
  ON CONFLICT (tenant_id, supplier_id, product_name, supplier_sku)
  DO UPDATE SET
    unit_cost = EXCLUDED.unit_cost,
    last_purchase_at = now(),
    product_id = COALESCE(EXCLUDED.product_id, public.supplier_products.product_id),
    status = 'available',
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_purchase_items_sync_sup_prod ON public.purchase_items;
CREATE TRIGGER trg_purchase_items_sync_sup_prod
  AFTER INSERT ON public.purchase_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_supplier_product_from_purchase();
