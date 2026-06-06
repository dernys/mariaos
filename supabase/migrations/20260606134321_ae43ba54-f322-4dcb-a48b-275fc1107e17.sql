
-- ============================================================
-- FASE 2: Contabilidad empresarial (cost centers, budgets, cu_onat, reports)
-- ============================================================

-- 1. COST CENTERS
CREATE TABLE IF NOT EXISTS public.cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  parent_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  store_id uuid,
  department text,
  manager_employee_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_centers TO authenticated;
GRANT ALL ON public.cost_centers TO service_role;
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cost_centers_tenant_select" ON public.cost_centers FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));
CREATE POLICY "cost_centers_tenant_insert" ON public.cost_centers FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "cost_centers_tenant_update" ON public.cost_centers FOR UPDATE TO authenticated
  USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "cost_centers_tenant_delete" ON public.cost_centers FOR DELETE TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE TRIGGER trg_cost_centers_updated_at BEFORE UPDATE ON public.cost_centers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_cost_centers_autofill BEFORE INSERT ON public.cost_centers
  FOR EACH ROW EXECUTE FUNCTION public.autofill_tenant_id();

CREATE INDEX IF NOT EXISTS idx_cost_centers_tenant ON public.cost_centers(tenant_id);

-- 2. BUDGETS
CREATE TABLE IF NOT EXISTS public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  year integer NOT NULL,
  period_type text NOT NULL DEFAULT 'monthly' CHECK (period_type IN ('monthly','quarterly','annual')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','closed')),
  notes text,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.budgets TO authenticated;
GRANT ALL ON public.budgets TO service_role;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budgets_tenant_select" ON public.budgets FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));
CREATE POLICY "budgets_tenant_insert" ON public.budgets FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "budgets_tenant_update" ON public.budgets FOR UPDATE TO authenticated
  USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "budgets_tenant_delete" ON public.budgets FOR DELETE TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE TRIGGER trg_budgets_updated_at BEFORE UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_budgets_autofill BEFORE INSERT ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.autofill_tenant_id();

CREATE INDEX IF NOT EXISTS idx_budgets_tenant_year ON public.budgets(tenant_id, year);

-- 3. BUDGET LINES
CREATE TABLE IF NOT EXISTS public.budget_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounting_accounts(id) ON DELETE CASCADE,
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  period_month integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  amount numeric(18,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_lines TO authenticated;
GRANT ALL ON public.budget_lines TO service_role;
ALTER TABLE public.budget_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_lines_tenant_select" ON public.budget_lines FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));
CREATE POLICY "budget_lines_tenant_insert" ON public.budget_lines FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "budget_lines_tenant_update" ON public.budget_lines FOR UPDATE TO authenticated
  USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "budget_lines_tenant_delete" ON public.budget_lines FOR DELETE TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE TRIGGER trg_budget_lines_updated_at BEFORE UPDATE ON public.budget_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_budget_lines_autofill BEFORE INSERT ON public.budget_lines
  FOR EACH ROW EXECUTE FUNCTION public.autofill_tenant_id();

CREATE INDEX IF NOT EXISTS idx_budget_lines_budget ON public.budget_lines(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_account ON public.budget_lines(account_id);

-- 4. Cost center dimension on existing tables
ALTER TABLE public.journal_entry_lines ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jel_cost_center ON public.journal_entry_lines(cost_center_id);

-- 5. Trial Balance view (sumas y saldos)
CREATE OR REPLACE VIEW public.trial_balance_view AS
SELECT
  a.tenant_id,
  a.id AS account_id,
  a.code,
  a.name,
  a.type,
  a.nature,
  COALESCE(SUM(l.debit), 0) AS total_debit,
  COALESCE(SUM(l.credit), 0) AS total_credit,
  COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0) AS balance,
  je.period_id,
  je.fiscal_year_id
FROM public.accounting_accounts a
LEFT JOIN public.journal_entry_lines l ON l.account_id = a.id
LEFT JOIN public.journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
GROUP BY a.tenant_id, a.id, a.code, a.name, a.type, a.nature, je.period_id, je.fiscal_year_id;

GRANT SELECT ON public.trial_balance_view TO authenticated, service_role;

-- 6. General Ledger view (libro mayor)
CREATE OR REPLACE VIEW public.general_ledger_view AS
SELECT
  je.tenant_id,
  je.id AS entry_id,
  je.entry_number,
  je.date,
  je.description AS entry_description,
  je.status,
  je.period_id,
  je.fiscal_year_id,
  l.id AS line_id,
  l.account_id,
  a.code AS account_code,
  a.name AS account_name,
  l.debit,
  l.credit,
  l.description AS line_description,
  l.cost_center_id,
  cc.code AS cost_center_code,
  cc.name AS cost_center_name
FROM public.journal_entries je
JOIN public.journal_entry_lines l ON l.entry_id = je.id
JOIN public.accounting_accounts a ON a.id = l.account_id
LEFT JOIN public.cost_centers cc ON cc.id = l.cost_center_id
WHERE je.status = 'posted';

GRANT SELECT ON public.general_ledger_view TO authenticated, service_role;

-- 7. Budget execution view (presupuesto vs real)
CREATE OR REPLACE VIEW public.budget_execution_view AS
SELECT
  bl.tenant_id,
  bl.budget_id,
  b.name AS budget_name,
  b.year,
  bl.period_month,
  bl.account_id,
  a.code AS account_code,
  a.name AS account_name,
  a.type AS account_type,
  bl.cost_center_id,
  cc.code AS cost_center_code,
  cc.name AS cost_center_name,
  bl.amount AS budgeted,
  COALESCE((
    SELECT SUM(CASE WHEN a.nature = 'debit' THEN l.debit - l.credit ELSE l.credit - l.debit END)
    FROM public.journal_entry_lines l
    JOIN public.journal_entries je ON je.id = l.entry_id
    WHERE l.account_id = bl.account_id
      AND je.status = 'posted'
      AND EXTRACT(YEAR FROM je.date) = b.year
      AND EXTRACT(MONTH FROM je.date) = bl.period_month
      AND (bl.cost_center_id IS NULL OR l.cost_center_id = bl.cost_center_id)
  ), 0) AS actual,
  bl.amount - COALESCE((
    SELECT SUM(CASE WHEN a.nature = 'debit' THEN l.debit - l.credit ELSE l.credit - l.debit END)
    FROM public.journal_entry_lines l
    JOIN public.journal_entries je ON je.id = l.entry_id
    WHERE l.account_id = bl.account_id
      AND je.status = 'posted'
      AND EXTRACT(YEAR FROM je.date) = b.year
      AND EXTRACT(MONTH FROM je.date) = bl.period_month
      AND (bl.cost_center_id IS NULL OR l.cost_center_id = bl.cost_center_id)
  ), 0) AS variance
FROM public.budget_lines bl
JOIN public.budgets b ON b.id = bl.budget_id
JOIN public.accounting_accounts a ON a.id = bl.account_id
LEFT JOIN public.cost_centers cc ON cc.id = bl.cost_center_id;

GRANT SELECT ON public.budget_execution_view TO authenticated, service_role;

-- 8. Plan contable cu_onat (Cuba — ONAT)
CREATE OR REPLACE FUNCTION public.import_chart_template(p_tenant_id uuid, p_template text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int := 0;
BEGIN
  IF p_template = 'es_pgc' THEN
    INSERT INTO public.accounting_accounts (tenant_id, code, name, type, nature, level, is_postable, plan_template) VALUES
      (p_tenant_id, '1', 'Financiación básica', 'equity', 'credit', 1, false, 'es_pgc'),
      (p_tenant_id, '10', 'Capital', 'equity', 'credit', 2, false, 'es_pgc'),
      (p_tenant_id, '100', 'Capital social', 'equity', 'credit', 3, true, 'es_pgc'),
      (p_tenant_id, '129', 'Resultado del ejercicio', 'equity', 'credit', 3, true, 'es_pgc'),
      (p_tenant_id, '2', 'Activo no corriente', 'asset', 'debit', 1, false, 'es_pgc'),
      (p_tenant_id, '21', 'Inmovilizaciones materiales', 'asset', 'debit', 2, false, 'es_pgc'),
      (p_tenant_id, '210', 'Terrenos', 'asset', 'debit', 3, true, 'es_pgc'),
      (p_tenant_id, '216', 'Mobiliario', 'asset', 'debit', 3, true, 'es_pgc'),
      (p_tenant_id, '217', 'Equipos informáticos', 'asset', 'debit', 3, true, 'es_pgc'),
      (p_tenant_id, '3', 'Existencias', 'asset', 'debit', 1, false, 'es_pgc'),
      (p_tenant_id, '300', 'Mercaderías', 'asset', 'debit', 3, true, 'es_pgc'),
      (p_tenant_id, '4', 'Acreedores y deudores', 'asset', 'debit', 1, false, 'es_pgc'),
      (p_tenant_id, '400', 'Proveedores', 'liability', 'credit', 3, true, 'es_pgc'),
      (p_tenant_id, '430', 'Clientes', 'asset', 'debit', 3, true, 'es_pgc'),
      (p_tenant_id, '472', 'IVA soportado', 'asset', 'debit', 3, true, 'es_pgc'),
      (p_tenant_id, '477', 'IVA repercutido', 'liability', 'credit', 3, true, 'es_pgc'),
      (p_tenant_id, '5', 'Cuentas financieras', 'asset', 'debit', 1, false, 'es_pgc'),
      (p_tenant_id, '570', 'Caja', 'asset', 'debit', 3, true, 'es_pgc'),
      (p_tenant_id, '572', 'Bancos', 'asset', 'debit', 3, true, 'es_pgc'),
      (p_tenant_id, '6', 'Compras y gastos', 'expense', 'debit', 1, false, 'es_pgc'),
      (p_tenant_id, '600', 'Compras de mercaderías', 'expense', 'debit', 3, true, 'es_pgc'),
      (p_tenant_id, '621', 'Arrendamientos', 'expense', 'debit', 3, true, 'es_pgc'),
      (p_tenant_id, '628', 'Suministros', 'expense', 'debit', 3, true, 'es_pgc'),
      (p_tenant_id, '640', 'Sueldos y salarios', 'expense', 'debit', 3, true, 'es_pgc'),
      (p_tenant_id, '642', 'Seguridad Social a cargo empresa', 'expense', 'debit', 3, true, 'es_pgc'),
      (p_tenant_id, '7', 'Ventas e ingresos', 'income', 'credit', 1, false, 'es_pgc'),
      (p_tenant_id, '700', 'Ventas de mercaderías', 'income', 'credit', 3, true, 'es_pgc'),
      (p_tenant_id, '705', 'Prestaciones de servicios', 'income', 'credit', 3, true, 'es_pgc')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSIF p_template = 'mx_sat' THEN
    INSERT INTO public.accounting_accounts (tenant_id, code, name, type, nature, level, is_postable, plan_template) VALUES
      (p_tenant_id, '100', 'Activo', 'asset', 'debit', 1, false, 'mx_sat'),
      (p_tenant_id, '101', 'Caja', 'asset', 'debit', 3, true, 'mx_sat'),
      (p_tenant_id, '102', 'Bancos', 'asset', 'debit', 3, true, 'mx_sat'),
      (p_tenant_id, '105', 'Clientes', 'asset', 'debit', 3, true, 'mx_sat'),
      (p_tenant_id, '115', 'Inventario', 'asset', 'debit', 3, true, 'mx_sat'),
      (p_tenant_id, '118', 'IVA acreditable', 'asset', 'debit', 3, true, 'mx_sat'),
      (p_tenant_id, '200', 'Pasivo', 'liability', 'credit', 1, false, 'mx_sat'),
      (p_tenant_id, '201', 'Proveedores', 'liability', 'credit', 3, true, 'mx_sat'),
      (p_tenant_id, '208', 'IVA trasladado', 'liability', 'credit', 3, true, 'mx_sat'),
      (p_tenant_id, '216', 'ISR por pagar', 'liability', 'credit', 3, true, 'mx_sat'),
      (p_tenant_id, '300', 'Capital', 'equity', 'credit', 1, false, 'mx_sat'),
      (p_tenant_id, '301', 'Capital social', 'equity', 'credit', 3, true, 'mx_sat'),
      (p_tenant_id, '305', 'Resultado del ejercicio', 'equity', 'credit', 3, true, 'mx_sat'),
      (p_tenant_id, '400', 'Ingresos', 'income', 'credit', 1, false, 'mx_sat'),
      (p_tenant_id, '401', 'Ventas', 'income', 'credit', 3, true, 'mx_sat'),
      (p_tenant_id, '500', 'Costos', 'expense', 'debit', 1, false, 'mx_sat'),
      (p_tenant_id, '501', 'Costo de ventas', 'expense', 'debit', 3, true, 'mx_sat'),
      (p_tenant_id, '600', 'Gastos', 'expense', 'debit', 1, false, 'mx_sat'),
      (p_tenant_id, '601', 'Sueldos y salarios', 'expense', 'debit', 3, true, 'mx_sat'),
      (p_tenant_id, '604', 'Renta', 'expense', 'debit', 3, true, 'mx_sat'),
      (p_tenant_id, '605', 'Servicios', 'expense', 'debit', 3, true, 'mx_sat')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSIF p_template = 'niif_generic' THEN
    INSERT INTO public.accounting_accounts (tenant_id, code, name, type, nature, level, is_postable, plan_template) VALUES
      (p_tenant_id, '1', 'Activo', 'asset', 'debit', 1, false, 'niif_generic'),
      (p_tenant_id, '11', 'Efectivo y equivalentes', 'asset', 'debit', 2, false, 'niif_generic'),
      (p_tenant_id, '1101', 'Caja', 'asset', 'debit', 3, true, 'niif_generic'),
      (p_tenant_id, '1102', 'Bancos', 'asset', 'debit', 3, true, 'niif_generic'),
      (p_tenant_id, '1305', 'Clientes', 'asset', 'debit', 3, true, 'niif_generic'),
      (p_tenant_id, '1435', 'Inventarios', 'asset', 'debit', 3, true, 'niif_generic'),
      (p_tenant_id, '2', 'Pasivo', 'liability', 'credit', 1, false, 'niif_generic'),
      (p_tenant_id, '2205', 'Proveedores', 'liability', 'credit', 3, true, 'niif_generic'),
      (p_tenant_id, '2408', 'Impuestos por pagar', 'liability', 'credit', 3, true, 'niif_generic'),
      (p_tenant_id, '3', 'Patrimonio', 'equity', 'credit', 1, false, 'niif_generic'),
      (p_tenant_id, '3105', 'Capital suscrito', 'equity', 'credit', 3, true, 'niif_generic'),
      (p_tenant_id, '4', 'Ingresos', 'income', 'credit', 1, false, 'niif_generic'),
      (p_tenant_id, '4135', 'Ventas', 'income', 'credit', 3, true, 'niif_generic'),
      (p_tenant_id, '5', 'Gastos', 'expense', 'debit', 1, false, 'niif_generic'),
      (p_tenant_id, '5105', 'Sueldos', 'expense', 'debit', 3, true, 'niif_generic'),
      (p_tenant_id, '5135', 'Servicios', 'expense', 'debit', 3, true, 'niif_generic'),
      (p_tenant_id, '6', 'Costos', 'expense', 'debit', 1, false, 'niif_generic'),
      (p_tenant_id, '6135', 'Costo de ventas', 'expense', 'debit', 3, true, 'niif_generic')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSIF p_template = 'cu_onat' THEN
    -- Plan contable Cuba — ONAT (Oficina Nacional de Administración Tributaria)
    -- Adaptado para MIPYMES, TCP y formas de gestión no estatal
    INSERT INTO public.accounting_accounts (tenant_id, code, name, type, nature, level, is_postable, plan_template) VALUES
      -- ACTIVOS
      (p_tenant_id, '1', 'ACTIVOS', 'asset', 'debit', 1, false, 'cu_onat'),
      (p_tenant_id, '10', 'Efectivo en caja', 'asset', 'debit', 2, false, 'cu_onat'),
      (p_tenant_id, '101', 'Caja CUP', 'asset', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '102', 'Caja USD', 'asset', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '103', 'Caja EUR', 'asset', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '104', 'Caja MLC', 'asset', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '11', 'Efectivo en banco', 'asset', 'debit', 2, false, 'cu_onat'),
      (p_tenant_id, '110', 'Cuenta bancaria CUP', 'asset', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '111', 'Cuenta bancaria MLC', 'asset', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '12', 'Cuentas por cobrar', 'asset', 'debit', 2, false, 'cu_onat'),
      (p_tenant_id, '120', 'Clientes', 'asset', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '125', 'Adeudos del personal', 'asset', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '13', 'Inventarios', 'asset', 'debit', 2, false, 'cu_onat'),
      (p_tenant_id, '130', 'Mercancías para la venta', 'asset', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '131', 'Materias primas y materiales', 'asset', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '132', 'Producción en proceso', 'asset', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '133', 'Productos terminados', 'asset', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '14', 'Activos fijos tangibles', 'asset', 'debit', 2, false, 'cu_onat'),
      (p_tenant_id, '140', 'Equipos y mobiliario', 'asset', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '141', 'Medios de transporte', 'asset', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '149', 'Depreciación acumulada', 'asset', 'credit', 3, true, 'cu_onat'),
      -- PASIVOS
      (p_tenant_id, '2', 'PASIVOS', 'liability', 'credit', 1, false, 'cu_onat'),
      (p_tenant_id, '20', 'Cuentas por pagar', 'liability', 'credit', 2, false, 'cu_onat'),
      (p_tenant_id, '200', 'Proveedores', 'liability', 'credit', 3, true, 'cu_onat'),
      (p_tenant_id, '205', 'Obligaciones con el personal', 'liability', 'credit', 3, true, 'cu_onat'),
      (p_tenant_id, '21', 'Obligaciones con el presupuesto', 'liability', 'credit', 2, false, 'cu_onat'),
      (p_tenant_id, '210', 'Impuesto sobre ventas / servicios', 'liability', 'credit', 3, true, 'cu_onat'),
      (p_tenant_id, '211', 'Impuesto sobre ingresos personales', 'liability', 'credit', 3, true, 'cu_onat'),
      (p_tenant_id, '212', 'Impuesto sobre utilidades', 'liability', 'credit', 3, true, 'cu_onat'),
      (p_tenant_id, '213', 'Contribución a la seguridad social', 'liability', 'credit', 3, true, 'cu_onat'),
      (p_tenant_id, '214', 'Impuesto fuerza de trabajo', 'liability', 'credit', 3, true, 'cu_onat'),
      (p_tenant_id, '215', 'ONAT — otros tributos', 'liability', 'credit', 3, true, 'cu_onat'),
      -- PATRIMONIO
      (p_tenant_id, '3', 'PATRIMONIO', 'equity', 'credit', 1, false, 'cu_onat'),
      (p_tenant_id, '30', 'Capital', 'equity', 'credit', 2, false, 'cu_onat'),
      (p_tenant_id, '300', 'Capital social', 'equity', 'credit', 3, true, 'cu_onat'),
      (p_tenant_id, '310', 'Utilidades retenidas', 'equity', 'credit', 3, true, 'cu_onat'),
      (p_tenant_id, '320', 'Resultado del ejercicio', 'equity', 'credit', 3, true, 'cu_onat'),
      -- INGRESOS
      (p_tenant_id, '4', 'INGRESOS', 'income', 'credit', 1, false, 'cu_onat'),
      (p_tenant_id, '40', 'Ingresos por actividad', 'income', 'credit', 2, false, 'cu_onat'),
      (p_tenant_id, '400', 'Venta de mercancías', 'income', 'credit', 3, true, 'cu_onat'),
      (p_tenant_id, '401', 'Prestación de servicios', 'income', 'credit', 3, true, 'cu_onat'),
      (p_tenant_id, '402', 'Producción y venta de alimentos', 'income', 'credit', 3, true, 'cu_onat'),
      (p_tenant_id, '49', 'Otros ingresos', 'income', 'credit', 2, true, 'cu_onat'),
      -- GASTOS Y COSTOS
      (p_tenant_id, '5', 'GASTOS Y COSTOS', 'expense', 'debit', 1, false, 'cu_onat'),
      (p_tenant_id, '50', 'Costo de mercancías vendidas', 'expense', 'debit', 2, true, 'cu_onat'),
      (p_tenant_id, '51', 'Gastos de operación', 'expense', 'debit', 2, false, 'cu_onat'),
      (p_tenant_id, '510', 'Salarios', 'expense', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '511', 'Seguridad social (aporte empresa)', 'expense', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '512', 'Impuesto fuerza de trabajo (5%)', 'expense', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '513', 'Energía eléctrica', 'expense', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '514', 'Agua', 'expense', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '515', 'Arrendamiento', 'expense', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '516', 'Combustible', 'expense', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '517', 'Transporte', 'expense', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '518', 'Mantenimiento y reparaciones', 'expense', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '519', 'Depreciación del ejercicio', 'expense', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '52', 'Tributos del ejercicio', 'expense', 'debit', 2, false, 'cu_onat'),
      (p_tenant_id, '520', 'Impuesto sobre ventas / servicios', 'expense', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '521', 'Impuesto sobre utilidades', 'expense', 'debit', 3, true, 'cu_onat'),
      (p_tenant_id, '59', 'Otros gastos', 'expense', 'debit', 2, true, 'cu_onat')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSE
    RAISE EXCEPTION 'Plantilla desconocida: %', p_template;
  END IF;

  RETURN v_count;
END $function$;

-- 9. Realtime publication for new tables (for live budget tracking)
ALTER PUBLICATION supabase_realtime ADD TABLE public.cost_centers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.budgets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.budget_lines;
