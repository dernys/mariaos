
-- ============================================================
-- CU: DECLARACIONES JURADAS ONAT (DJ-08 / DJ-09)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cu_tax_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  declaration_type text NOT NULL,           -- DJ-08, DJ-09, IVS, etc
  period_id uuid REFERENCES public.accounting_periods(id) ON DELETE SET NULL,
  fiscal_year integer NOT NULL,
  period_label text NOT NULL,               -- '2026-Q1', '2026-06', '2026'
  total_income numeric(18,2) NOT NULL DEFAULT 0,
  total_expenses numeric(18,2) NOT NULL DEFAULT 0,
  deductible_expenses numeric(18,2) NOT NULL DEFAULT 0,
  taxable_base numeric(18,2) NOT NULL DEFAULT 0,
  tax_rate numeric(6,2) NOT NULL DEFAULT 0,
  tax_due numeric(18,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',     -- draft, submitted, paid
  submitted_at timestamptz,
  paid_at timestamptz,
  file_url text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cu_tax_declarations TO authenticated;
GRANT ALL ON public.cu_tax_declarations TO service_role;

ALTER TABLE public.cu_tax_declarations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cu_tax_tenant_access" ON public.cu_tax_declarations
  FOR ALL TO authenticated
  USING (
    tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS cu_tax_tenant_idx ON public.cu_tax_declarations(tenant_id, fiscal_year);

CREATE TRIGGER trg_cu_tax_updated_at
  BEFORE UPDATE ON public.cu_tax_declarations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_cu_tax_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.cu_tax_declarations
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- ============================================================
-- CU: FICHAS DE COSTO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cu_cost_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  raw_materials_cost numeric(18,2) NOT NULL DEFAULT 0,
  labor_cost numeric(18,2) NOT NULL DEFAULT 0,
  indirect_cost numeric(18,2) NOT NULL DEFAULT 0,
  packaging_cost numeric(18,2) NOT NULL DEFAULT 0,
  other_cost numeric(18,2) NOT NULL DEFAULT 0,
  unit_cost numeric(18,2) NOT NULL DEFAULT 0,
  margin_pct numeric(6,2) NOT NULL DEFAULT 30,
  suggested_price numeric(18,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'CUP',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cu_cost_sheets TO authenticated;
GRANT ALL ON public.cu_cost_sheets TO service_role;
ALTER TABLE public.cu_cost_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cu_cost_tenant_access" ON public.cu_cost_sheets
  FOR ALL TO authenticated
  USING (
    tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS cu_cost_tenant_idx ON public.cu_cost_sheets(tenant_id);
CREATE INDEX IF NOT EXISTS cu_cost_product_idx ON public.cu_cost_sheets(product_id);

CREATE TRIGGER trg_cu_cost_updated_at
  BEFORE UPDATE ON public.cu_cost_sheets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_cu_cost_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.cu_cost_sheets
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- ============================================================
-- CU: ÍTEMS DE FICHA DE COSTO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cu_cost_sheet_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_sheet_id uuid NOT NULL REFERENCES public.cu_cost_sheets(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  category text NOT NULL,                   -- raw_material, labor, indirect, packaging, other
  description text NOT NULL,
  quantity numeric(18,4) NOT NULL DEFAULT 1,
  unit text,
  unit_cost numeric(18,4) NOT NULL DEFAULT 0,
  total numeric(18,2) NOT NULL DEFAULT 0,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cu_cost_sheet_items TO authenticated;
GRANT ALL ON public.cu_cost_sheet_items TO service_role;
ALTER TABLE public.cu_cost_sheet_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cu_cost_items_tenant_access" ON public.cu_cost_sheet_items
  FOR ALL TO authenticated
  USING (
    tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS cu_cost_items_sheet_idx ON public.cu_cost_sheet_items(cost_sheet_id);

CREATE TRIGGER trg_cu_cost_items_updated_at
  BEFORE UPDATE ON public.cu_cost_sheet_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_cu_cost_items_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.cu_cost_sheet_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- ============================================================
-- FUNCIÓN: recalcular ficha de costo
-- ============================================================
CREATE OR REPLACE FUNCTION public.cu_calculate_cost_sheet(p_sheet_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_raw numeric := 0;
  v_lab numeric := 0;
  v_ind numeric := 0;
  v_pack numeric := 0;
  v_oth numeric := 0;
  v_unit numeric;
  v_margin numeric;
  v_price numeric;
BEGIN
  SELECT COALESCE(SUM(CASE WHEN category='raw_material' THEN total ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN category='labor'        THEN total ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN category='indirect'     THEN total ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN category='packaging'    THEN total ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN category='other'        THEN total ELSE 0 END),0)
    INTO v_raw, v_lab, v_ind, v_pack, v_oth
    FROM public.cu_cost_sheet_items
   WHERE cost_sheet_id = p_sheet_id;

  v_unit := v_raw + v_lab + v_ind + v_pack + v_oth;

  SELECT margin_pct INTO v_margin FROM public.cu_cost_sheets WHERE id = p_sheet_id;
  v_price := round(v_unit * (1 + COALESCE(v_margin,0)/100.0), 2);

  UPDATE public.cu_cost_sheets
     SET raw_materials_cost = v_raw,
         labor_cost = v_lab,
         indirect_cost = v_ind,
         packaging_cost = v_pack,
         other_cost = v_oth,
         unit_cost = v_unit,
         suggested_price = v_price,
         updated_at = now()
   WHERE id = p_sheet_id;

  RETURN v_unit;
END;
$$;

-- ============================================================
-- FUNCIÓN: generar declaración ONAT desde mayor materializado
-- ============================================================
CREATE OR REPLACE FUNCTION public.cu_generate_tax_declaration(
  p_tenant_id uuid,
  p_declaration_type text,
  p_period_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_income numeric := 0;
  v_expenses numeric := 0;
  v_base numeric;
  v_rate numeric;
  v_tax numeric;
  v_year int;
  v_label text;
  v_id uuid;
BEGIN
  -- Refrescar mayor
  PERFORM public.rebuild_general_ledger(p_period_id);

  SELECT extract(year FROM ap.start_date)::int, ap.name
    INTO v_year, v_label
    FROM public.accounting_periods ap WHERE ap.id = p_period_id;

  SELECT COALESCE(SUM(CASE WHEN a.type='income'  THEN gl.credit_total - gl.debit_total ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN a.type='expense' THEN gl.debit_total - gl.credit_total ELSE 0 END),0)
    INTO v_income, v_expenses
    FROM public.general_ledger gl
    JOIN public.accounting_accounts a ON a.id = gl.account_id
   WHERE gl.tenant_id = p_tenant_id AND gl.period_id = p_period_id;

  v_base := GREATEST(0, v_income - v_expenses);

  -- Tarifa según tipo (escalado simplificado ONAT)
  v_rate := CASE p_declaration_type
              WHEN 'DJ-08' THEN 15  -- Personas naturales TCP
              WHEN 'DJ-09' THEN 35  -- MIPYME utilidades
              ELSE 10
            END;
  v_tax := round(v_base * v_rate / 100.0, 2);

  INSERT INTO public.cu_tax_declarations (
    tenant_id, declaration_type, period_id, fiscal_year, period_label,
    total_income, total_expenses, deductible_expenses, taxable_base,
    tax_rate, tax_due, status, created_by
  ) VALUES (
    p_tenant_id, p_declaration_type, p_period_id, v_year, COALESCE(v_label, v_year::text),
    v_income, v_expenses, v_expenses, v_base,
    v_rate, v_tax, 'draft', auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
