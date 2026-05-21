
-- ============= B2 Ventas suspendidas (parking) =============
CREATE TABLE IF NOT EXISTS public.parked_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  shift_id uuid,
  name text NOT NULL,
  cart jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.parked_sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parked_sales_select ON public.parked_sales;
CREATE POLICY parked_sales_select ON public.parked_sales FOR SELECT
  USING (public.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS parked_sales_insert ON public.parked_sales;
CREATE POLICY parked_sales_insert ON public.parked_sales FOR INSERT
  WITH CHECK (public.is_tenant_member(tenant_id) AND user_id = auth.uid());
DROP POLICY IF EXISTS parked_sales_update ON public.parked_sales;
CREATE POLICY parked_sales_update ON public.parked_sales FOR UPDATE
  USING (public.is_tenant_member(tenant_id) AND (user_id = auth.uid() OR public.is_superadmin(auth.uid())));
DROP POLICY IF EXISTS parked_sales_delete ON public.parked_sales;
CREATE POLICY parked_sales_delete ON public.parked_sales FOR DELETE
  USING (public.is_tenant_member(tenant_id) AND (user_id = auth.uid() OR public.is_superadmin(auth.uid())));
DROP TRIGGER IF EXISTS parked_sales_autotenant ON public.parked_sales;
CREATE TRIGGER parked_sales_autotenant BEFORE INSERT ON public.parked_sales
  FOR EACH ROW EXECUTE FUNCTION public.autofill_tenant_id();
DROP TRIGGER IF EXISTS parked_sales_updated ON public.parked_sales;
CREATE TRIGGER parked_sales_updated BEFORE UPDATE ON public.parked_sales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS parked_sales_user_idx ON public.parked_sales(user_id, created_at DESC);

-- ============= B3 Favoritos por cajero =============
CREATE TABLE IF NOT EXISTS public.user_pos_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  product_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);
ALTER TABLE public.user_pos_favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS upos_fav_select ON public.user_pos_favorites;
CREATE POLICY upos_fav_select ON public.user_pos_favorites FOR SELECT
  USING (public.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS upos_fav_mutate ON public.user_pos_favorites;
CREATE POLICY upos_fav_mutate ON public.user_pos_favorites FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (public.is_tenant_member(tenant_id) AND user_id = auth.uid());
DROP TRIGGER IF EXISTS upos_fav_autotenant ON public.user_pos_favorites;
CREATE TRIGGER upos_fav_autotenant BEFORE INSERT ON public.user_pos_favorites
  FOR EACH ROW EXECUTE FUNCTION public.autofill_tenant_id();

-- ============= D1 Index sobre lotes existentes (FEFO) =============
CREATE INDEX IF NOT EXISTS plots_expiry_idx ON public.product_lots(tenant_id, expiration_date)
  WHERE expiration_date IS NOT NULL AND quantity > 0;

-- ============= D2 Ajuste rápido de stock =============
CREATE OR REPLACE FUNCTION public.register_stock_adjustment(
  p_product_id uuid,
  p_location_type text,
  p_location_id uuid,
  p_quantity numeric,
  p_reason text,
  p_photo_url text DEFAULT NULL,
  p_kind text DEFAULT 'adjust'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tenant uuid;
  v_prev numeric;
  v_new numeric;
  v_movement_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.products WHERE id = p_product_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
  IF NOT public.is_tenant_member(v_tenant) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Motivo requerido';
  END IF;
  IF p_kind NOT IN ('adjust','loss','breakage','expired','theft') THEN
    RAISE EXCEPTION 'Tipo invalido';
  END IF;

  INSERT INTO public.product_stock (tenant_id, product_id, location_type, location_id, stock)
    VALUES (v_tenant, p_product_id, p_location_type, p_location_id, 0)
  ON CONFLICT (product_id, location_type, location_id) DO NOTHING;

  SELECT stock INTO v_prev FROM public.product_stock
    WHERE product_id = p_product_id AND location_type = p_location_type AND location_id = p_location_id
    FOR UPDATE;
  v_new := COALESCE(v_prev,0) + p_quantity;

  UPDATE public.product_stock SET stock = v_new, updated_at = now()
    WHERE product_id = p_product_id AND location_type = p_location_type AND location_id = p_location_id;

  INSERT INTO public.inventory_movements (
    tenant_id, product_id, movement_type, quantity, previous_stock, new_stock,
    reference_type, reference_id, performed_by, location_type, location_id, reason
  ) VALUES (
    v_tenant, p_product_id, p_kind, p_quantity, COALESCE(v_prev,0), v_new,
    'adjustment', NULL, auth.uid(), p_location_type, p_location_id,
    p_reason || COALESCE(' [foto:'||p_photo_url||']','')
  ) RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END $$;

-- ============= C1 Cierre Z 1-click =============
ALTER TABLE public.sales_shifts ADD COLUMN IF NOT EXISTS z_journal_entry_id uuid;
ALTER TABLE public.sales_shifts ADD COLUMN IF NOT EXISTS z_summary jsonb;
ALTER TABLE public.sales_shifts ADD COLUMN IF NOT EXISTS z_closed_at timestamptz;
ALTER TABLE public.sales_shifts ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.close_shift_z(
  p_shift_id uuid,
  p_counted_cash numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_shift record;
  v_summary jsonb;
  v_entry_id uuid;
  v_cash_acc uuid;
  v_sales_acc uuid;
  v_tax_acc uuid;
  v_total_sales numeric := 0;
  v_total_tax numeric := 0;
BEGIN
  SELECT * INTO v_shift FROM public.sales_shifts WHERE id = p_shift_id FOR UPDATE;
  IF v_shift IS NULL THEN RAISE EXCEPTION 'Turno no encontrado'; END IF;
  IF NOT public.is_tenant_member(v_shift.tenant_id) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF v_shift.locked THEN RAISE EXCEPTION 'El turno ya está bloqueado por cierre Z'; END IF;

  v_summary := public.calculate_shift_summary(p_shift_id);
  v_total_sales := COALESCE((v_summary->>'total_sales')::numeric, 0);

  SELECT COALESCE(SUM(tax),0) INTO v_total_tax FROM public.sales
    WHERE shift_id = p_shift_id AND status IN ('paid','partial');

  SELECT id INTO v_cash_acc FROM public.accounting_accounts
    WHERE tenant_id = v_shift.tenant_id AND (code LIKE '570%' OR code LIKE '1100%') LIMIT 1;
  SELECT id INTO v_sales_acc FROM public.accounting_accounts
    WHERE tenant_id = v_shift.tenant_id AND (code LIKE '700%' OR code LIKE '4100%') LIMIT 1;
  SELECT id INTO v_tax_acc FROM public.accounting_accounts
    WHERE tenant_id = v_shift.tenant_id AND (code LIKE '477%' OR code LIKE '2200%') LIMIT 1;

  IF v_cash_acc IS NOT NULL AND v_sales_acc IS NOT NULL AND v_total_sales > 0 THEN
    INSERT INTO public.journal_entries(tenant_id, entry_date, description, status, created_by)
    VALUES (v_shift.tenant_id, CURRENT_DATE, 'Cierre Z turno '||p_shift_id::text, 'posted', auth.uid())
    RETURNING id INTO v_entry_id;

    INSERT INTO public.journal_entry_lines(tenant_id, entry_id, account_id, debit, credit, description)
    VALUES (v_shift.tenant_id, v_entry_id, v_cash_acc, v_total_sales, 0, 'Caja del día');
    INSERT INTO public.journal_entry_lines(tenant_id, entry_id, account_id, debit, credit, description)
    VALUES (v_shift.tenant_id, v_entry_id, v_sales_acc, 0, v_total_sales - v_total_tax, 'Ventas del día');
    IF v_tax_acc IS NOT NULL AND v_total_tax > 0 THEN
      INSERT INTO public.journal_entry_lines(tenant_id, entry_id, account_id, debit, credit, description)
      VALUES (v_shift.tenant_id, v_entry_id, v_tax_acc, 0, v_total_tax, 'IVA repercutido');
    END IF;
  END IF;

  v_summary := v_summary || jsonb_build_object(
    'counted_cash', p_counted_cash,
    'cash_difference', COALESCE(p_counted_cash,0) - COALESCE((v_summary->>'expected_cash')::numeric,0),
    'journal_entry_id', v_entry_id,
    'closed_at', now()
  );

  UPDATE public.sales_shifts SET
    status = 'closed',
    closed_at = COALESCE(closed_at, now()),
    z_closed_at = now(),
    z_summary = v_summary,
    z_journal_entry_id = v_entry_id,
    locked = true,
    counted_cash = COALESCE(p_counted_cash, counted_cash),
    updated_at = now()
  WHERE id = p_shift_id;

  INSERT INTO public.activity_log (entity_type, entity_id, action, description, tenant_id, performed_by)
  VALUES ('shift', p_shift_id, 'Cierre Z', 'Turno cerrado con asiento '||COALESCE(v_entry_id::text,'n/a'), v_shift.tenant_id, auth.uid());

  RETURN v_summary;
END $$;

-- ============= G1 Tasas historicas =============
CREATE TABLE IF NOT EXISTS public.exchange_rates_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  currency_code text NOT NULL,
  rate numeric NOT NULL,
  effective_from date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, currency_code, effective_from)
);
ALTER TABLE public.exchange_rates_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erh_select ON public.exchange_rates_history;
CREATE POLICY erh_select ON public.exchange_rates_history FOR SELECT
  USING (public.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS erh_mutate ON public.exchange_rates_history;
CREATE POLICY erh_mutate ON public.exchange_rates_history FOR ALL
  USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));
DROP TRIGGER IF EXISTS erh_autotenant ON public.exchange_rates_history;
CREATE TRIGGER erh_autotenant BEFORE INSERT ON public.exchange_rates_history
  FOR EACH ROW EXECUTE FUNCTION public.autofill_tenant_id();
CREATE INDEX IF NOT EXISTS erh_currency_date_idx ON public.exchange_rates_history(tenant_id, currency_code, effective_from DESC);

CREATE OR REPLACE FUNCTION public.snapshot_currency_rate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate)
     OR TG_OP = 'INSERT' THEN
    INSERT INTO public.exchange_rates_history (tenant_id, currency_code, rate, effective_from)
    VALUES (NEW.tenant_id, NEW.code, NEW.exchange_rate, CURRENT_DATE)
    ON CONFLICT (tenant_id, currency_code, effective_from) DO UPDATE SET rate = EXCLUDED.rate;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_snapshot_currency_rate ON public.currencies;
CREATE TRIGGER trg_snapshot_currency_rate AFTER INSERT OR UPDATE ON public.currencies
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_currency_rate();

-- ============= H Auditoria universal =============
ALTER TABLE public.activity_log ADD COLUMN IF NOT EXISTS metadata jsonb;

CREATE OR REPLACE FUNCTION public.universal_audit_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tenant uuid;
  v_changes jsonb;
  v_id uuid;
BEGIN
  BEGIN v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id); EXCEPTION WHEN OTHERS THEN v_tenant := NULL; END;
  BEGIN v_id := COALESCE((CASE WHEN TG_OP <> 'DELETE' THEN (NEW).id ELSE (OLD).id END)::uuid, gen_random_uuid()); EXCEPTION WHEN OTHERS THEN v_id := gen_random_uuid(); END;
  IF TG_OP = 'UPDATE' THEN
    v_changes := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
  ELSIF TG_OP = 'INSERT' THEN
    v_changes := jsonb_build_object('after', to_jsonb(NEW));
  ELSE
    v_changes := jsonb_build_object('before', to_jsonb(OLD));
  END IF;
  INSERT INTO public.activity_log (entity_type, entity_id, action, description, tenant_id, performed_by, metadata)
  VALUES (TG_TABLE_NAME, v_id, TG_OP, TG_OP || ' en ' || TG_TABLE_NAME, v_tenant, auth.uid(), v_changes);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS audit_products ON public.products;
CREATE TRIGGER audit_products AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.universal_audit_trigger();
DROP TRIGGER IF EXISTS audit_employees ON public.employees;
CREATE TRIGGER audit_employees AFTER INSERT OR UPDATE OR DELETE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.universal_audit_trigger();

-- ============= D3 Vista de reposicion sugerida =============
CREATE OR REPLACE VIEW public.v_replenishment_suggestions AS
SELECT
  p.tenant_id,
  p.id AS product_id,
  p.name AS product_name,
  p.sku,
  COALESCE(p.min_stock, 0) AS min_stock,
  COALESCE(SUM(ps.stock), 0) AS current_stock,
  COALESCE((
    SELECT SUM(si.qty) / 30.0
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    WHERE si.product_id = p.id
      AND s.tenant_id = p.tenant_id
      AND s.status IN ('paid','partial')
      AND s.created_at >= now() - interval '30 days'
  ), 0) AS avg_daily_consumption,
  GREATEST(0, COALESCE(p.min_stock,0) - COALESCE(SUM(ps.stock),0)) AS suggested_qty
FROM public.products p
LEFT JOIN public.product_stock ps ON ps.product_id = p.id
WHERE p.is_active = true
GROUP BY p.id, p.tenant_id, p.name, p.sku, p.min_stock;
