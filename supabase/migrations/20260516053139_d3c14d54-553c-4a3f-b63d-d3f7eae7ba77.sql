-- ============================================================
-- BLOQUE 1 - FASE 1: CONTABILIDAD OPERATIVA
-- ============================================================

-- 1. EXTENDER accounting_accounts: jerarquía, imputable, naturaleza
ALTER TABLE public.accounting_accounts
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS level int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_postable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS nature text NOT NULL DEFAULT 'debit' CHECK (nature IN ('debit','credit')),
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'CUP',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS plan_template text;

CREATE INDEX IF NOT EXISTS idx_accounting_accounts_parent ON public.accounting_accounts(parent_id);
CREATE INDEX IF NOT EXISTS idx_accounting_accounts_tenant_code ON public.accounting_accounts(tenant_id, code);

-- Sync nature based on type for existing rows
UPDATE public.accounting_accounts
SET nature = CASE WHEN type IN ('asset','expense') THEN 'debit' ELSE 'credit' END
WHERE nature IS NULL OR nature = 'debit';

-- 2. FISCAL YEARS Y PERIODS
CREATE TABLE IF NOT EXISTS public.fiscal_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  year int NOT NULL,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','locked')),
  is_current boolean NOT NULL DEFAULT false,
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, year)
);

CREATE TABLE IF NOT EXISTS public.accounting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  fiscal_year_id uuid NOT NULL REFERENCES public.fiscal_years(id) ON DELETE CASCADE,
  period_number int NOT NULL CHECK (period_number BETWEEN 1 AND 13),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','locked')),
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(fiscal_year_id, period_number)
);

CREATE INDEX IF NOT EXISTS idx_acc_periods_tenant_dates ON public.accounting_periods(tenant_id, start_date, end_date);

ALTER TABLE public.fiscal_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fiscal_years tenant access" ON public.fiscal_years;
CREATE POLICY "fiscal_years tenant access" ON public.fiscal_years
  FOR ALL USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "accounting_periods tenant access" ON public.accounting_periods;
CREATE POLICY "accounting_periods tenant access" ON public.accounting_periods
  FOR ALL USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));

CREATE TRIGGER trg_fiscal_years_updated BEFORE UPDATE ON public.fiscal_years
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_acc_periods_updated BEFORE UPDATE ON public.accounting_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. EXTENDER journal_entries con period
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS period_id uuid REFERENCES public.accounting_periods(id),
  ADD COLUMN IF NOT EXISTS fiscal_year_id uuid REFERENCES public.fiscal_years(id),
  ADD COLUMN IF NOT EXISTS series text NOT NULL DEFAULT 'GEN',
  ADD COLUMN IF NOT EXISTS reversed_by uuid REFERENCES public.journal_entries(id),
  ADD COLUMN IF NOT EXISTS reverses uuid REFERENCES public.journal_entries(id),
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS posted_by uuid;

CREATE INDEX IF NOT EXISTS idx_journal_entries_period ON public.journal_entries(period_id);

-- 4. FUNCIÓN: crear ejercicio fiscal con 12 períodos
CREATE OR REPLACE FUNCTION public.create_fiscal_year(p_tenant_id uuid, p_year int, p_start_month int DEFAULT 1)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fy_id uuid;
  v_start date;
  v_end date;
  i int;
  v_p_start date;
  v_p_end date;
BEGIN
  v_start := make_date(p_year, p_start_month, 1);
  v_end := (v_start + interval '1 year' - interval '1 day')::date;

  INSERT INTO public.fiscal_years (tenant_id, year, name, start_date, end_date, status, is_current)
  VALUES (p_tenant_id, p_year, 'Ejercicio ' || p_year, v_start, v_end, 'open',
          NOT EXISTS (SELECT 1 FROM public.fiscal_years WHERE tenant_id = p_tenant_id AND is_current))
  RETURNING id INTO v_fy_id;

  FOR i IN 1..12 LOOP
    v_p_start := (v_start + ((i - 1) || ' month')::interval)::date;
    v_p_end := ((v_p_start + interval '1 month') - interval '1 day')::date;
    INSERT INTO public.accounting_periods (tenant_id, fiscal_year_id, period_number, name, start_date, end_date)
    VALUES (p_tenant_id, v_fy_id, i, to_char(v_p_start, 'TMMonth YYYY'), v_p_start, v_p_end);
  END LOOP;

  RETURN v_fy_id;
END $$;

-- 5. FUNCIÓN: cerrar/reabrir período
CREATE OR REPLACE FUNCTION public.close_accounting_period(p_period_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.accounting_periods
  SET status = 'closed', closed_at = now(), closed_by = auth.uid()
  WHERE id = p_period_id AND status = 'open';
END $$;

CREATE OR REPLACE FUNCTION public.reopen_accounting_period(p_period_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.accounting_periods
  SET status = 'open', closed_at = NULL, closed_by = NULL
  WHERE id = p_period_id AND status = 'closed';
END $$;

-- 6. FUNCIÓN: resolver período por fecha
CREATE OR REPLACE FUNCTION public.resolve_period(p_tenant_id uuid, p_date date)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.accounting_periods
  WHERE tenant_id = p_tenant_id AND p_date BETWEEN start_date AND end_date
  LIMIT 1
$$;

-- 7. FUNCIÓN: postear asiento con validación partida doble
CREATE OR REPLACE FUNCTION public.post_journal_entry(p_entry_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry record;
  v_debits numeric;
  v_credits numeric;
  v_period record;
  v_non_postable int;
BEGIN
  SELECT * INTO v_entry FROM public.journal_entries WHERE id = p_entry_id FOR UPDATE;
  IF v_entry IS NULL THEN RAISE EXCEPTION 'Asiento no encontrado'; END IF;
  IF v_entry.status = 'posted' THEN RETURN; END IF;
  IF v_entry.status = 'cancelled' THEN RAISE EXCEPTION 'Asiento anulado, no se puede postear'; END IF;

  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO v_debits, v_credits
  FROM public.journal_entry_lines WHERE entry_id = p_entry_id;

  IF ABS(v_debits - v_credits) > 0.01 THEN
    RAISE EXCEPTION 'Asiento desbalanceado: débitos % vs créditos %', v_debits, v_credits;
  END IF;
  IF v_debits = 0 THEN RAISE EXCEPTION 'Asiento sin líneas válidas'; END IF;

  -- Validar cuentas imputables
  SELECT COUNT(*) INTO v_non_postable
  FROM public.journal_entry_lines l
  JOIN public.accounting_accounts a ON a.id = l.account_id
  WHERE l.entry_id = p_entry_id AND a.is_postable = false;
  IF v_non_postable > 0 THEN
    RAISE EXCEPTION 'Hay % línea(s) con cuentas no imputables (grupo). Use cuentas de detalle.', v_non_postable;
  END IF;

  -- Validar período abierto
  IF v_entry.period_id IS NOT NULL THEN
    SELECT * INTO v_period FROM public.accounting_periods WHERE id = v_entry.period_id;
    IF v_period.status <> 'open' THEN
      RAISE EXCEPTION 'El período "%" está %', v_period.name, v_period.status;
    END IF;
  END IF;

  UPDATE public.journal_entries
  SET status = 'posted', posted_at = now(), posted_by = auth.uid(), updated_at = now()
  WHERE id = p_entry_id;
END $$;

-- 8. FUNCIÓN: reversar asiento (crea asiento opuesto, nunca borra)
CREATE OR REPLACE FUNCTION public.reverse_journal_entry(p_entry_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry record;
  v_new_id uuid;
  v_new_number text;
  v_period uuid;
BEGIN
  SELECT * INTO v_entry FROM public.journal_entries WHERE id = p_entry_id FOR UPDATE;
  IF v_entry IS NULL THEN RAISE EXCEPTION 'Asiento no encontrado'; END IF;
  IF v_entry.status <> 'posted' THEN RAISE EXCEPTION 'Solo se reversan asientos posteados'; END IF;
  IF v_entry.reversed_by IS NOT NULL THEN RAISE EXCEPTION 'Asiento ya fue reversado'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Motivo obligatorio';
  END IF;

  v_period := public.resolve_period(v_entry.tenant_id, CURRENT_DATE);
  v_new_number := 'REV-' || v_entry.entry_number;

  INSERT INTO public.journal_entries (
    tenant_id, entry_number, date, description, status, series,
    reference_type, reference_id, reverses, period_id, fiscal_year_id, created_by, posted_at, posted_by
  ) VALUES (
    v_entry.tenant_id, v_new_number, CURRENT_DATE,
    'Reversión: ' || COALESCE(v_entry.description,'') || ' | ' || p_reason,
    'posted', COALESCE(v_entry.series, 'GEN'),
    'reversal', p_entry_id, p_entry_id, v_period, v_entry.fiscal_year_id,
    auth.uid(), now(), auth.uid()
  ) RETURNING id INTO v_new_id;

  INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description)
  SELECT v_new_id, account_id, credit, debit, 'Reversión: ' || COALESCE(description,'')
  FROM public.journal_entry_lines WHERE entry_id = p_entry_id;

  UPDATE public.journal_entries SET reversed_by = v_new_id, updated_at = now() WHERE id = p_entry_id;

  RETURN v_new_id;
END $$;

-- 9. FUNCIÓN: importar plan contable desde plantilla
CREATE OR REPLACE FUNCTION public.import_chart_template(p_tenant_id uuid, p_template text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  ELSE
    RAISE EXCEPTION 'Plantilla desconocida: %', p_template;
  END IF;

  RETURN v_count;
END $$;

-- 10. Sincronizar parent_id por código para plantillas (best-effort)
CREATE OR REPLACE FUNCTION public.relink_chart_parents(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, code FROM public.accounting_accounts WHERE tenant_id = p_tenant_id LOOP
    UPDATE public.accounting_accounts a
    SET parent_id = p.id
    FROM public.accounting_accounts p
    WHERE a.id = r.id
      AND p.tenant_id = p_tenant_id
      AND length(r.code) > 1
      AND p.code = substr(r.code, 1, length(r.code) - 1)
      AND a.parent_id IS DISTINCT FROM p.id;
  END LOOP;
END $$;