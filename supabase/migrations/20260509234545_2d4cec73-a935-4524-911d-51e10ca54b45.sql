
-- Extend products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'simple',
  ADD COLUMN IF NOT EXISTS barcodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS expiration_tracking boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS track_serials boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS track_lots boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_stock numeric;

-- Extend product_stock
ALTER TABLE public.product_stock
  ADD COLUMN IF NOT EXISTS in_transit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS damaged numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS committed numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_stock numeric;

-- Variants
CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku text,
  name text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  price numeric NOT NULL DEFAULT 0,
  cost numeric NOT NULL DEFAULT 0,
  barcode text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select_variants" ON public.product_variants FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_insert_variants" ON public.product_variants FOR INSERT WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_update_variants" ON public.product_variants FOR UPDATE USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_delete_variants" ON public.product_variants FOR DELETE USING (public.is_tenant_member(tenant_id));
CREATE TRIGGER trg_variants_updated BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_variants_tenant BEFORE INSERT ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.autofill_tenant_id();
CREATE INDEX IF NOT EXISTS idx_variants_product ON public.product_variants(product_id);

-- Lots
CREATE TABLE IF NOT EXISTS public.product_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  lot_number text NOT NULL,
  expiration_date date,
  manufacturing_date date,
  quantity numeric NOT NULL DEFAULT 0,
  location_type text,
  location_id uuid,
  unit_cost numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.product_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select_lots" ON public.product_lots FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_insert_lots" ON public.product_lots FOR INSERT WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_update_lots" ON public.product_lots FOR UPDATE USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_delete_lots" ON public.product_lots FOR DELETE USING (public.is_tenant_member(tenant_id));
CREATE TRIGGER trg_lots_updated BEFORE UPDATE ON public.product_lots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_lots_tenant BEFORE INSERT ON public.product_lots FOR EACH ROW EXECUTE FUNCTION public.autofill_tenant_id();
CREATE INDEX IF NOT EXISTS idx_lots_product ON public.product_lots(product_id);
CREATE INDEX IF NOT EXISTS idx_lots_expiration ON public.product_lots(expiration_date);

-- Serials
CREATE TABLE IF NOT EXISTS public.product_serials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  serial_number text NOT NULL,
  status text NOT NULL DEFAULT 'available',
  location_type text,
  location_id uuid,
  sale_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, serial_number)
);
ALTER TABLE public.product_serials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select_serials" ON public.product_serials FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_insert_serials" ON public.product_serials FOR INSERT WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_update_serials" ON public.product_serials FOR UPDATE USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_delete_serials" ON public.product_serials FOR DELETE USING (public.is_tenant_member(tenant_id));
CREATE TRIGGER trg_serials_updated BEFORE UPDATE ON public.product_serials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_serials_tenant BEFORE INSERT ON public.product_serials FOR EACH ROW EXECUTE FUNCTION public.autofill_tenant_id();
CREATE INDEX IF NOT EXISTS idx_serials_product ON public.product_serials(product_id);

-- Physical counts
CREATE TABLE IF NOT EXISTS public.physical_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  reference text,
  count_type text NOT NULL DEFAULT 'cycle',
  status text NOT NULL DEFAULT 'draft',
  location_type text,
  location_id uuid,
  notes text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.physical_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select_pcounts" ON public.physical_counts FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_insert_pcounts" ON public.physical_counts FOR INSERT WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_update_pcounts" ON public.physical_counts FOR UPDATE USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_delete_pcounts" ON public.physical_counts FOR DELETE USING (public.is_tenant_member(tenant_id));
CREATE TRIGGER trg_pcounts_updated BEFORE UPDATE ON public.physical_counts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pcounts_tenant BEFORE INSERT ON public.physical_counts FOR EACH ROW EXECUTE FUNCTION public.autofill_tenant_id();

CREATE TABLE IF NOT EXISTS public.physical_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id uuid NOT NULL REFERENCES public.physical_counts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  expected_qty numeric NOT NULL DEFAULT 0,
  counted_qty numeric NOT NULL DEFAULT 0,
  difference numeric GENERATED ALWAYS AS (counted_qty - expected_qty) STORED,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.physical_count_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select_pcount_items" ON public.physical_count_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.physical_counts pc WHERE pc.id = count_id AND public.is_tenant_member(pc.tenant_id)));
CREATE POLICY "tenant_modify_pcount_items" ON public.physical_count_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.physical_counts pc WHERE pc.id = count_id AND public.is_tenant_member(pc.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.physical_counts pc WHERE pc.id = count_id AND public.is_tenant_member(pc.tenant_id)));
CREATE INDEX IF NOT EXISTS idx_pcount_items_count ON public.physical_count_items(count_id);

-- Supplier costs history
CREATE TABLE IF NOT EXISTS public.product_supplier_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_id uuid,
  unit_cost numeric NOT NULL,
  currency text NOT NULL DEFAULT 'CUP',
  recorded_at timestamptz NOT NULL DEFAULT now(),
  reference_type text,
  reference_id uuid,
  notes text
);
ALTER TABLE public.product_supplier_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select_pscosts" ON public.product_supplier_costs FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_insert_pscosts" ON public.product_supplier_costs FOR INSERT WITH CHECK (public.is_tenant_member(tenant_id));
CREATE TRIGGER trg_pscosts_tenant BEFORE INSERT ON public.product_supplier_costs FOR EACH ROW EXECUTE FUNCTION public.autofill_tenant_id();
CREATE INDEX IF NOT EXISTS idx_pscosts_product ON public.product_supplier_costs(product_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_lots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_serials;
ALTER PUBLICATION supabase_realtime ADD TABLE public.physical_counts;
