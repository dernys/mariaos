
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS gross_salary numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxable_base numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS irpf_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ss_worker_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ss_company_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonuses_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_deductions numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receipt_number text,
  ADD COLUMN IF NOT EXISTS payslip_url text,
  ADD COLUMN IF NOT EXISTS payment_iban text,
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'transfer',
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sepa_export_id uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

CREATE TABLE IF NOT EXISTS public.payroll_tax_brackets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  country_code text NOT NULL DEFAULT 'ES',
  bracket_type text NOT NULL CHECK (bracket_type IN ('irpf','ss_worker','ss_company')),
  year integer NOT NULL,
  min_base numeric NOT NULL DEFAULT 0,
  max_base numeric,
  rate_percent numeric NOT NULL DEFAULT 0,
  fixed_amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payroll_tax_brackets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_payroll_brackets" ON public.payroll_tax_brackets
  FOR ALL USING (is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()))
  WITH CHECK (is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
CREATE TRIGGER trg_payroll_brackets_tenant BEFORE INSERT ON public.payroll_tax_brackets
  FOR EACH ROW EXECUTE FUNCTION autofill_tenant_id();
CREATE INDEX IF NOT EXISTS idx_payroll_brackets_lookup
  ON public.payroll_tax_brackets(tenant_id, bracket_type, year, min_base);

CREATE TABLE IF NOT EXISTS public.payroll_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  concept_type text NOT NULL CHECK (concept_type IN ('earning','deduction')),
  is_taxable boolean NOT NULL DEFAULT true,
  contributes_ss boolean NOT NULL DEFAULT true,
  default_amount numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payroll_concepts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_payroll_concepts" ON public.payroll_concepts
  FOR ALL USING (is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()))
  WITH CHECK (is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
CREATE TRIGGER trg_payroll_concepts_tenant BEFORE INSERT ON public.payroll_concepts
  FOR EACH ROW EXECUTE FUNCTION autofill_tenant_id();
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_concepts_code
  ON public.payroll_concepts(tenant_id, code);

CREATE TABLE IF NOT EXISTS public.payroll_run_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payroll_run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  concept_id uuid REFERENCES public.payroll_concepts(id) ON DELETE SET NULL,
  description text NOT NULL,
  concept_type text NOT NULL CHECK (concept_type IN ('earning','deduction')),
  quantity numeric NOT NULL DEFAULT 1,
  unit_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  is_taxable boolean NOT NULL DEFAULT true,
  contributes_ss boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payroll_run_concepts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_payroll_run_concepts" ON public.payroll_run_concepts
  FOR ALL USING (is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()))
  WITH CHECK (is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
CREATE TRIGGER trg_payroll_lines_tenant BEFORE INSERT ON public.payroll_run_concepts
  FOR EACH ROW EXECUTE FUNCTION autofill_tenant_id();
CREATE INDEX IF NOT EXISTS idx_payroll_lines_run
  ON public.payroll_run_concepts(payroll_run_id);

CREATE TABLE IF NOT EXISTS public.sepa_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  message_id text NOT NULL,
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  payment_count integer NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  xml_content text,
  status text NOT NULL DEFAULT 'generated' CHECK (status IN ('generated','sent','confirmed','failed')),
  generated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sepa_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_sepa_exports" ON public.sepa_exports
  FOR ALL USING (is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()))
  WITH CHECK (is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
CREATE TRIGGER trg_sepa_exports_tenant BEFORE INSERT ON public.sepa_exports
  FOR EACH ROW EXECUTE FUNCTION autofill_tenant_id();

ALTER TABLE public.payroll_runs
  DROP CONSTRAINT IF EXISTS fk_payroll_sepa;
ALTER TABLE public.payroll_runs
  ADD CONSTRAINT fk_payroll_sepa FOREIGN KEY (sepa_export_id) REFERENCES public.sepa_exports(id) ON DELETE SET NULL;

INSERT INTO storage.buckets (id, name, public)
VALUES ('payslips', 'payslips', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Tenant members can view payslips" ON storage.objects;
CREATE POLICY "Tenant members can view payslips"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'payslips'
  AND (
    public.is_superadmin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.user_id = auth.uid()
      AND tu.tenant_id::text = (storage.foldername(name))[1]
    )
  )
);

DROP POLICY IF EXISTS "Tenant members can upload payslips" ON storage.objects;
CREATE POLICY "Tenant members can upload payslips"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'payslips'
  AND (
    public.is_superadmin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.user_id = auth.uid()
      AND tu.tenant_id::text = (storage.foldername(name))[1]
    )
  )
);

CREATE OR REPLACE FUNCTION public.compute_payroll_full(
  _employee_id uuid,
  _period_start date,
  _period_end date,
  _bonuses numeric DEFAULT 0,
  _other_deductions numeric DEFAULT 0
)
RETURNS TABLE (
  hours_worked numeric,
  base_salary numeric,
  overtime_amount numeric,
  gross_salary numeric,
  taxable_base numeric,
  irpf_amount numeric,
  ss_worker_amount numeric,
  ss_company_amount numeric,
  net_pay numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid;
  _hours numeric := 0;
  _ot_amount numeric := 0;
  _base numeric := 0;
  _gross numeric := 0;
  _taxable numeric := 0;
  _irpf numeric := 0;
  _ssw numeric := 0;
  _ssc numeric := 0;
  _year integer := EXTRACT(YEAR FROM _period_end)::int;
  _hourly_rate numeric := 0;
BEGIN
  SELECT tenant_id, COALESCE(salary,0) INTO _tenant, _base
  FROM public.employees WHERE id = _employee_id;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'Empleado no encontrado'; END IF;

  SELECT COALESCE(SUM(hours_worked),0) INTO _hours
  FROM public.employee_attendance
  WHERE employee_id = _employee_id
    AND check_in::date BETWEEN _period_start AND _period_end
    AND check_out IS NOT NULL;

  SELECT COALESCE(SUM(hours * COALESCE(pay_factor,1.5)),0)
  INTO _ot_amount
  FROM public.overtime_records
  WHERE employee_id = _employee_id
    AND work_date BETWEEN _period_start AND _period_end;

  IF _hours > 0 THEN
    _hourly_rate := _base / GREATEST(_hours, 1);
    _ot_amount := _ot_amount * _hourly_rate;
  END IF;

  _gross := _base + _ot_amount + COALESCE(_bonuses,0);
  _taxable := _gross;

  SELECT COALESCE(SUM(
    CASE WHEN _taxable > b.min_base THEN
      (LEAST(_taxable, COALESCE(b.max_base, _taxable)) - b.min_base) * b.rate_percent / 100
    ELSE 0 END
  ), 0) INTO _irpf
  FROM public.payroll_tax_brackets b
  WHERE b.tenant_id = _tenant AND b.bracket_type = 'irpf' AND b.year = _year;

  SELECT COALESCE(SUM(
    CASE WHEN _taxable > b.min_base THEN
      (LEAST(_taxable, COALESCE(b.max_base, _taxable)) - b.min_base) * b.rate_percent / 100
    ELSE 0 END
  ), 0) INTO _ssw
  FROM public.payroll_tax_brackets b
  WHERE b.tenant_id = _tenant AND b.bracket_type = 'ss_worker' AND b.year = _year;

  SELECT COALESCE(SUM(
    CASE WHEN _taxable > b.min_base THEN
      (LEAST(_taxable, COALESCE(b.max_base, _taxable)) - b.min_base) * b.rate_percent / 100
    ELSE 0 END
  ), 0) INTO _ssc
  FROM public.payroll_tax_brackets b
  WHERE b.tenant_id = _tenant AND b.bracket_type = 'ss_company' AND b.year = _year;

  IF _irpf = 0 AND _ssw = 0 AND _ssc = 0 THEN
    _irpf := _taxable * 0.15;
    _ssw := _taxable * 0.0635;
    _ssc := _taxable * 0.298;
  END IF;

  RETURN QUERY SELECT
    _hours, _base, _ot_amount, _gross, _taxable,
    _irpf, _ssw, _ssc,
    (_gross - _irpf - _ssw - COALESCE(_other_deductions,0));
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_sepa_xml(_payroll_run_ids uuid[], _bank_account_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid;
  _xml text;
  _msg_id text;
  _total numeric := 0;
  _count integer := 0;
  _export_id uuid;
  r record;
BEGIN
  SELECT tenant_id INTO _tenant FROM public.bank_accounts WHERE id = _bank_account_id;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'Cuenta bancaria no encontrada'; END IF;
  IF NOT is_tenant_member(_tenant) AND NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Sin permisos';
  END IF;

  _msg_id := 'PAY-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || substr(gen_random_uuid()::text,1,6);

  _xml := '<?xml version="1.0" encoding="UTF-8"?>' ||
    '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">' ||
    '<CstmrCdtTrfInitn><GrpHdr><MsgId>' || _msg_id || '</MsgId>' ||
    '<CreDtTm>' || to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') || '</CreDtTm>';

  FOR r IN
    SELECT pr.id, pr.net_pay, pr.payment_iban, pr.receipt_number, e.name AS emp_name
    FROM public.payroll_runs pr
    JOIN public.employees e ON e.id = pr.employee_id
    WHERE pr.id = ANY(_payroll_run_ids) AND pr.tenant_id = _tenant
  LOOP
    _count := _count + 1;
    _total := _total + COALESCE(r.net_pay,0);
    _xml := _xml || '<!-- ' || r.emp_name || ' ' || COALESCE(r.payment_iban,'NO_IBAN') || ' ' || r.net_pay || ' -->';
  END LOOP;

  _xml := _xml || '<NbOfTxs>' || _count || '</NbOfTxs><CtrlSum>' || _total || '</CtrlSum>' ||
    '</GrpHdr></CstmrCdtTrfInitn></Document>';

  INSERT INTO public.sepa_exports(tenant_id, message_id, bank_account_id, payment_count, total_amount, xml_content, generated_by)
  VALUES (_tenant, _msg_id, _bank_account_id, _count, _total, _xml, auth.uid())
  RETURNING id INTO _export_id;

  UPDATE public.payroll_runs SET sepa_export_id = _export_id
  WHERE id = ANY(_payroll_run_ids) AND tenant_id = _tenant;

  RETURN _export_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_employee_record()
RETURNS TABLE (id uuid, tenant_id uuid, emp_name text, email text, job_position text, salary numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.tenant_id, e.name, e.email, e."position", e.salary
  FROM public.employees e
  WHERE e.user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.my_payslips()
RETURNS SETOF public.payroll_runs
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pr.* FROM public.payroll_runs pr
  JOIN public.employees e ON e.id = pr.employee_id
  WHERE e.user_id = auth.uid()
  ORDER BY pr.period_end DESC;
$$;

CREATE OR REPLACE FUNCTION public.my_leave_requests()
RETURNS SETOF public.leave_requests
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lr.* FROM public.leave_requests lr
  JOIN public.employees e ON e.id = lr.employee_id
  WHERE e.user_id = auth.uid()
  ORDER BY lr.start_date DESC;
$$;

CREATE OR REPLACE FUNCTION public.my_attendance(_from date DEFAULT NULL, _to date DEFAULT NULL)
RETURNS SETOF public.employee_attendance
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.* FROM public.employee_attendance a
  JOIN public.employees e ON e.id = a.employee_id
  WHERE e.user_id = auth.uid()
    AND (_from IS NULL OR a.check_in::date >= _from)
    AND (_to IS NULL OR a.check_in::date <= _to)
  ORDER BY a.check_in DESC;
$$;

CREATE OR REPLACE FUNCTION public.my_vacation_balance()
RETURNS TABLE (entitled integer, taken integer, pending integer, remaining integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _emp uuid;
BEGIN
  SELECT id INTO _emp FROM public.employees WHERE user_id = auth.uid() LIMIT 1;
  IF _emp IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.employee_vacation_balance(_emp);
END;
$$;

DROP FUNCTION IF EXISTS public.post_payroll_journal_entry(uuid);
CREATE OR REPLACE FUNCTION public.post_payroll_journal_entry(_payroll_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pr public.payroll_runs;
  _entry_id uuid;
  _salary_acc uuid;
  _ss_acc uuid;
  _irpf_acc uuid;
  _cash_acc uuid;
BEGIN
  SELECT * INTO _pr FROM public.payroll_runs WHERE id = _payroll_id;
  IF _pr IS NULL THEN RAISE EXCEPTION 'Nómina no encontrada'; END IF;
  IF _pr.journal_entry_id IS NOT NULL THEN RETURN _pr.journal_entry_id; END IF;

  SELECT id INTO _salary_acc FROM public.accounting_accounts
    WHERE tenant_id = _pr.tenant_id AND code LIKE '640%' LIMIT 1;
  SELECT id INTO _ss_acc FROM public.accounting_accounts
    WHERE tenant_id = _pr.tenant_id AND code LIKE '476%' LIMIT 1;
  SELECT id INTO _irpf_acc FROM public.accounting_accounts
    WHERE tenant_id = _pr.tenant_id AND code LIKE '4751%' LIMIT 1;
  SELECT id INTO _cash_acc FROM public.accounting_accounts
    WHERE tenant_id = _pr.tenant_id AND (code LIKE '572%' OR code LIKE '570%') LIMIT 1;

  IF _salary_acc IS NULL OR _cash_acc IS NULL THEN
    RAISE NOTICE 'Plan contable incompleto para nómina';
    RETURN NULL;
  END IF;

  INSERT INTO public.journal_entries(tenant_id, entry_date, description, status, created_by)
  VALUES (_pr.tenant_id, COALESCE(_pr.paid_at::date, CURRENT_DATE),
          'Nómina ' || COALESCE(_pr.receipt_number, _pr.id::text), 'posted', auth.uid())
  RETURNING id INTO _entry_id;

  INSERT INTO public.journal_entry_lines(tenant_id, entry_id, account_id, debit, credit, description)
  VALUES (_pr.tenant_id, _entry_id, _salary_acc, _pr.gross_salary, 0, 'Salario bruto');
  IF _ss_acc IS NOT NULL AND _pr.ss_company_amount > 0 THEN
    INSERT INTO public.journal_entry_lines(tenant_id, entry_id, account_id, debit, credit, description)
    VALUES (_pr.tenant_id, _entry_id, _salary_acc, _pr.ss_company_amount, 0, 'SS Empresa');
    INSERT INTO public.journal_entry_lines(tenant_id, entry_id, account_id, debit, credit, description)
    VALUES (_pr.tenant_id, _entry_id, _ss_acc, 0, _pr.ss_company_amount + _pr.ss_worker_amount, 'SS por pagar');
  END IF;
  IF _irpf_acc IS NOT NULL AND _pr.irpf_amount > 0 THEN
    INSERT INTO public.journal_entry_lines(tenant_id, entry_id, account_id, debit, credit, description)
    VALUES (_pr.tenant_id, _entry_id, _irpf_acc, 0, _pr.irpf_amount, 'IRPF retenido');
  END IF;
  INSERT INTO public.journal_entry_lines(tenant_id, entry_id, account_id, debit, credit, description)
  VALUES (_pr.tenant_id, _entry_id, _cash_acc, 0, _pr.net_pay, 'Pago neto a empleado');

  UPDATE public.payroll_runs SET journal_entry_id = _entry_id WHERE id = _payroll_id;
  RETURN _entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_default_tax_brackets(_tenant uuid, _year integer DEFAULT 2026)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_tenant_member(_tenant) OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'Sin permisos';
  END IF;
  DELETE FROM public.payroll_tax_brackets WHERE tenant_id = _tenant AND year = _year;
  INSERT INTO public.payroll_tax_brackets(tenant_id, bracket_type, year, min_base, max_base, rate_percent) VALUES
    (_tenant,'irpf',_year,0,12450,19),
    (_tenant,'irpf',_year,12450,20200,24),
    (_tenant,'irpf',_year,20200,35200,30),
    (_tenant,'irpf',_year,35200,60000,37),
    (_tenant,'irpf',_year,60000,300000,45),
    (_tenant,'irpf',_year,300000,NULL,47),
    (_tenant,'ss_worker',_year,0,NULL,6.35),
    (_tenant,'ss_company',_year,0,NULL,29.9);
END;
$$;
