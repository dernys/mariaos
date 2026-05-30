
-- ============================================================
-- 1. JOB POSITIONS (Clasificador de Puestos)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  department text,
  level text,
  base_salary numeric NOT NULL DEFAULT 0,
  min_salary numeric NOT NULL DEFAULT 0,
  max_salary numeric NOT NULL DEFAULT 0,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_positions TO authenticated;
GRANT ALL ON public.job_positions TO service_role;

ALTER TABLE public.job_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_job_positions" ON public.job_positions FOR SELECT
  USING (is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
CREATE POLICY "tenant_manage_job_positions" ON public.job_positions FOR ALL
  USING (is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()))
  WITH CHECK (is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));

CREATE TRIGGER trg_job_positions_tenant BEFORE INSERT ON public.job_positions
  FOR EACH ROW EXECUTE FUNCTION autofill_tenant_id();

CREATE UNIQUE INDEX IF NOT EXISTS uq_job_positions_code ON public.job_positions(tenant_id, code);

-- Add optional position_id FK on employees (keep text position for legacy)
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS position_id uuid REFERENCES public.job_positions(id) ON DELETE SET NULL;

-- ============================================================
-- 2. ACCOUNTS PAYABLE (CxP unificadas)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.accounts_payable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  party_type text NOT NULL CHECK (party_type IN ('employee','supplier')),
  party_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('payroll','purchase','manual')),
  source_id uuid,
  description text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  amount_paid numeric NOT NULL DEFAULT 0,
  due_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','partial','paid','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts_payable TO authenticated;
GRANT ALL ON public.accounts_payable TO service_role;

ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_ap" ON public.accounts_payable FOR SELECT
  USING (is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
CREATE POLICY "tenant_manage_ap" ON public.accounts_payable FOR ALL
  USING (is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()))
  WITH CHECK (is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));

CREATE TRIGGER trg_ap_tenant BEFORE INSERT ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION autofill_tenant_id();

CREATE INDEX IF NOT EXISTS idx_ap_party ON public.accounts_payable(tenant_id, party_type, party_id, status);
CREATE INDEX IF NOT EXISTS idx_ap_source ON public.accounts_payable(source_type, source_id);

-- ============================================================
-- 3. AUTO-GENERATE CxP ON PAYROLL CREATION
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_payroll_payable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_emp_name text;
BEGIN
  IF NEW.net_pay <= 0 THEN RETURN NEW; END IF;
  -- avoid duplicate
  IF EXISTS (SELECT 1 FROM public.accounts_payable
             WHERE source_type='payroll' AND source_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  SELECT name INTO v_emp_name FROM public.employees WHERE id = NEW.employee_id;
  INSERT INTO public.accounts_payable(
    tenant_id, party_type, party_id, source_type, source_id,
    description, amount, due_date, status
  ) VALUES (
    NEW.tenant_id, 'employee', NEW.employee_id, 'payroll', NEW.id,
    'Nómina ' || COALESCE(v_emp_name,'') || ' · ' || NEW.period_start || ' → ' || NEW.period_end,
    NEW.net_pay, NEW.period_end + INTERVAL '5 days', 'pending'
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_payroll_create_ap ON public.payroll_runs;
CREATE TRIGGER trg_payroll_create_ap
  AFTER INSERT ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.generate_payroll_payable();

-- ============================================================
-- 4. PAY PAYROLL (registra pago + cierra CxP)
-- ============================================================
CREATE OR REPLACE FUNCTION public.pay_payroll(
  _payroll_id uuid,
  _method text DEFAULT 'transfer',
  _notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _pr public.payroll_runs;
  _ap public.accounts_payable;
  _pay_id uuid;
BEGIN
  SELECT * INTO _pr FROM public.payroll_runs WHERE id = _payroll_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nómina no encontrada'; END IF;
  IF _pr.status = 'paid' THEN RAISE EXCEPTION 'Nómina ya pagada'; END IF;

  SELECT * INTO _ap FROM public.accounts_payable
    WHERE source_type='payroll' AND source_id = _payroll_id LIMIT 1;

  INSERT INTO public.account_payments(
    tenant_id, party_type, party_id, reference_type, reference_id,
    direction, method, currency, amount, amount_in_base, exchange_rate, notes, performed_by
  ) VALUES (
    _pr.tenant_id, 'employee', _pr.employee_id, 'adjustment', _payroll_id,
    'out', _method, 'CUP', _pr.net_pay, _pr.net_pay, 1,
    COALESCE(_notes, 'Pago nómina ' || _pr.period_start || '→' || _pr.period_end),
    auth.uid()
  ) RETURNING id INTO _pay_id;

  UPDATE public.payroll_runs
    SET status='paid', paid_at = now()
    WHERE id = _payroll_id;

  IF _ap.id IS NOT NULL THEN
    UPDATE public.accounts_payable
      SET amount_paid = _ap.amount, status='paid', updated_at = now()
      WHERE id = _ap.id;
  END IF;

  -- compensar el efecto del trigger account_payments en employee.balance
  -- (que restó net_pay haciendo balance negativo). Revertirlo:
  UPDATE public.employees
    SET balance = balance + _pr.net_pay, updated_at = now()
    WHERE id = _pr.employee_id;

  RETURN _pay_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.pay_payroll(uuid, text, text) TO authenticated;
