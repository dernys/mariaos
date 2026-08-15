-- =============== Historial de nóminas ===============
CREATE TABLE IF NOT EXISTS public.payroll_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  payroll_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid,
  actor_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.payroll_events TO authenticated;
GRANT ALL ON public.payroll_events TO service_role;
ALTER TABLE public.payroll_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_events_select" ON public.payroll_events
  FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()) OR public.is_tenant_member(tenant_id));

CREATE POLICY "payroll_events_insert" ON public.payroll_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin(auth.uid()) OR public.is_tenant_member(tenant_id));

CREATE INDEX IF NOT EXISTS idx_payroll_events_payroll ON public.payroll_events(payroll_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_events_tenant ON public.payroll_events(tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_payroll_event(
  p_payroll_id uuid, p_event_type text, p_from text DEFAULT NULL, p_to text DEFAULT NULL,
  p_note text DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_p payroll_runs%ROWTYPE; v_id uuid;
BEGIN
  SELECT * INTO v_p FROM payroll_runs WHERE id = p_payroll_id;
  IF v_p.id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO payroll_events (tenant_id, payroll_id, employee_id, event_type, from_status, to_status, note, metadata, actor_user_id, actor_label)
  VALUES (v_p.tenant_id, p_payroll_id, v_p.employee_id, p_event_type, p_from, p_to, p_note,
          COALESCE(p_metadata, '{}'::jsonb), auth.uid(), public.current_actor_label())
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.trg_payroll_run_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_label text;
BEGIN
  v_label := public.current_actor_label();
  IF TG_OP = 'INSERT' THEN
    INSERT INTO payroll_events (tenant_id, payroll_id, employee_id, event_type, to_status, note, metadata, actor_user_id, actor_label)
    VALUES (NEW.tenant_id, NEW.id, NEW.employee_id, 'payroll_created', NEW.status,
            'Nómina generada ' || NEW.period_start || ' → ' || NEW.period_end,
            jsonb_build_object('net_pay', NEW.net_pay, 'gross', NEW.gross_salary), auth.uid(), v_label);
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO payroll_events (tenant_id, payroll_id, employee_id, event_type, from_status, to_status, note, metadata, actor_user_id, actor_label)
    VALUES (NEW.tenant_id, NEW.id, NEW.employee_id, 'status_changed', OLD.status, NEW.status, NULL,
            jsonb_build_object('net_pay', NEW.net_pay), auth.uid(), v_label);
  ELSIF (NEW.net_pay IS DISTINCT FROM OLD.net_pay
      OR NEW.base_salary IS DISTINCT FROM OLD.base_salary
      OR NEW.bonus IS DISTINCT FROM OLD.bonus
      OR NEW.deductions IS DISTINCT FROM OLD.deductions
      OR NEW.hours_worked IS DISTINCT FROM OLD.hours_worked) THEN
    INSERT INTO payroll_events (tenant_id, payroll_id, employee_id, event_type, note, metadata, actor_user_id, actor_label)
    VALUES (NEW.tenant_id, NEW.id, NEW.employee_id, 'payroll_edited', 'Importes modificados',
            jsonb_build_object('before', jsonb_build_object('base', OLD.base_salary, 'bonus', OLD.bonus, 'deductions', OLD.deductions, 'hours', OLD.hours_worked, 'net', OLD.net_pay),
                               'after',  jsonb_build_object('base', NEW.base_salary, 'bonus', NEW.bonus, 'deductions', NEW.deductions, 'hours', NEW.hours_worked, 'net', NEW.net_pay)),
            auth.uid(), v_label);
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_payroll_run_event_ins ON public.payroll_runs;
CREATE TRIGGER trg_payroll_run_event_ins AFTER INSERT ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.trg_payroll_run_event();

DROP TRIGGER IF EXISTS trg_payroll_run_event_upd ON public.payroll_runs;
CREATE TRIGGER trg_payroll_run_event_upd AFTER UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.trg_payroll_run_event();

-- =============== Firmas de nómina ===============
CREATE TABLE IF NOT EXISTS public.payroll_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  payroll_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid,
  signer_name text NOT NULL,
  method text NOT NULL DEFAULT 'paper',
  document_ref text,
  evidence_url text,
  notes text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  registered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_signatures TO authenticated;
GRANT ALL ON public.payroll_signatures TO service_role;
ALTER TABLE public.payroll_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_signatures_tenant_all" ON public.payroll_signatures
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()) OR public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_superadmin(auth.uid()) OR public.is_tenant_member(tenant_id));

CREATE POLICY "payroll_signatures_own_employee_select" ON public.payroll_signatures
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT e.id FROM public.employees e WHERE e.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_payroll_signatures_payroll ON public.payroll_signatures(payroll_id);

CREATE TRIGGER update_payroll_signatures_updated_at BEFORE UPDATE ON public.payroll_signatures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.register_payroll_signature(
  p_payroll_id uuid, p_signer_name text DEFAULT NULL, p_method text DEFAULT 'paper',
  p_evidence_url text DEFAULT NULL, p_notes text DEFAULT NULL, p_document_ref text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_p payroll_runs%ROWTYPE; v_name text; v_id uuid;
BEGIN
  SELECT * INTO v_p FROM payroll_runs WHERE id = p_payroll_id;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'Nómina no encontrada'; END IF;
  IF NOT (is_superadmin(auth.uid()) OR is_tenant_member(v_p.tenant_id)) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF v_p.status = 'cancelled' THEN RAISE EXCEPTION 'La nómina está anulada'; END IF;

  SELECT COALESCE(NULLIF(btrim(p_signer_name),''), e.name) INTO v_name FROM employees e WHERE e.id = v_p.employee_id;
  v_name := COALESCE(v_name, p_signer_name, 'Trabajador');

  INSERT INTO payroll_signatures (tenant_id, payroll_id, employee_id, signer_name, method, evidence_url, notes, document_ref, registered_by)
  VALUES (v_p.tenant_id, p_payroll_id, v_p.employee_id, v_name, COALESCE(p_method,'paper'), p_evidence_url, p_notes, p_document_ref, auth.uid())
  RETURNING id INTO v_id;

  PERFORM log_payroll_event(p_payroll_id, 'signature_registered', NULL, NULL,
    'Firma registrada de ' || v_name, jsonb_build_object('method', COALESCE(p_method,'paper'), 'signature_id', v_id));
  RETURN v_id;
END $function$;

-- =============== Acciones de ciclo de vida ===============
CREATE OR REPLACE FUNCTION public.recompute_payroll_run(p_payroll_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_p payroll_runs%ROWTYPE; v_calc jsonb;
BEGIN
  SELECT * INTO v_p FROM payroll_runs WHERE id = p_payroll_id FOR UPDATE;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'Nómina no encontrada'; END IF;
  IF NOT (is_superadmin(auth.uid()) OR is_tenant_member(v_p.tenant_id)) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF v_p.status IN ('paid','cancelled') THEN RAISE EXCEPTION 'No se puede recalcular una nómina % ', v_p.status; END IF;

  SELECT to_jsonb(c) INTO v_calc
    FROM compute_payroll(v_p.employee_id, v_p.period_start, v_p.period_end) c;

  UPDATE payroll_runs SET
    hours_worked = COALESCE((v_calc->>'hours_worked')::numeric, (v_calc->>'hours')::numeric, hours_worked),
    base_salary  = COALESCE((v_calc->>'base_salary')::numeric, (v_calc->>'base')::numeric, base_salary),
    gross_salary = COALESCE((v_calc->>'base_salary')::numeric, (v_calc->>'base')::numeric, base_salary) + bonus,
    net_pay      = COALESCE((v_calc->>'base_salary')::numeric, (v_calc->>'base')::numeric, base_salary) + bonus - deductions
  WHERE id = p_payroll_id;

  UPDATE accounts_payable ap SET amount = (SELECT net_pay FROM payroll_runs WHERE id = p_payroll_id)
   WHERE ap.source_type = 'payroll' AND ap.source_id = p_payroll_id AND ap.status <> 'paid';

  PERFORM log_payroll_event(p_payroll_id, 'payroll_recomputed', NULL, NULL, 'Nómina recalculada con la asistencia registrada', v_calc);
  RETURN jsonb_build_object('ok', true, 'calc', v_calc);
END $function$;

CREATE OR REPLACE FUNCTION public.unapprove_payroll_run(p_payroll_id uuid, p_reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_p payroll_runs%ROWTYPE;
BEGIN
  SELECT * INTO v_p FROM payroll_runs WHERE id = p_payroll_id FOR UPDATE;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'Nómina no encontrada'; END IF;
  IF NOT (is_superadmin(auth.uid()) OR is_tenant_member(v_p.tenant_id)) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF v_p.status <> 'approved' THEN RAISE EXCEPTION 'Sólo se puede desaprobar una nómina aprobada'; END IF;
  UPDATE payroll_runs SET status = 'pending', approved_at = NULL, approved_by = NULL WHERE id = p_payroll_id;
  PERFORM log_payroll_event(p_payroll_id, 'payroll_unapproved', 'approved', 'pending', p_reason, '{}'::jsonb);
  RETURN p_payroll_id;
END $function$;

CREATE OR REPLACE FUNCTION public.cancel_payroll_run(p_payroll_id uuid, p_reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_p payroll_runs%ROWTYPE;
BEGIN
  SELECT * INTO v_p FROM payroll_runs WHERE id = p_payroll_id FOR UPDATE;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'Nómina no encontrada'; END IF;
  IF NOT (is_superadmin(auth.uid()) OR is_tenant_member(v_p.tenant_id)) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF v_p.status = 'paid' THEN RAISE EXCEPTION 'La nómina está pagada: primero revierta el pago'; END IF;
  IF v_p.status = 'cancelled' THEN RETURN p_payroll_id; END IF;

  UPDATE accounts_payable SET status = 'cancelled', updated_at = now()
   WHERE source_type = 'payroll' AND source_id = p_payroll_id AND status <> 'paid';

  UPDATE payroll_runs SET status = 'cancelled',
    notes = COALESCE(notes || ' | ', '') || 'Anulada: ' || COALESCE(p_reason, 'sin motivo')
   WHERE id = p_payroll_id;

  PERFORM log_payroll_event(p_payroll_id, 'payroll_cancelled', v_p.status, 'cancelled', p_reason, '{}'::jsonb);
  RETURN p_payroll_id;
END $function$;

CREATE OR REPLACE FUNCTION public.revert_payroll_payment(p_payroll_id uuid, p_reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_p payroll_runs%ROWTYPE; v_pay uuid;
BEGIN
  SELECT * INTO v_p FROM payroll_runs WHERE id = p_payroll_id FOR UPDATE;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'Nómina no encontrada'; END IF;
  IF NOT (is_superadmin(auth.uid()) OR is_tenant_member(v_p.tenant_id)) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF v_p.status <> 'paid' THEN RAISE EXCEPTION 'La nómina no está pagada'; END IF;

  INSERT INTO account_payments (tenant_id, party_type, party_id, reference_type, reference_id,
    direction, method, currency, amount, amount_in_base, exchange_rate, notes, performed_by)
  VALUES (v_p.tenant_id, 'employee', v_p.employee_id, 'adjustment', p_payroll_id,
    'in', COALESCE(v_p.payment_method,'transfer'), 'CUP', v_p.net_pay, v_p.net_pay, 1,
    'Reverso de pago de nómina: ' || COALESCE(p_reason, 'corrección'), auth.uid())
  RETURNING id INTO v_pay;

  UPDATE employees SET balance = balance - v_p.net_pay, updated_at = now() WHERE id = v_p.employee_id;

  UPDATE accounts_payable SET amount_paid = 0, status = 'pending', updated_at = now()
   WHERE source_type = 'payroll' AND source_id = p_payroll_id;

  UPDATE payroll_runs SET status = 'approved', paid_at = NULL WHERE id = p_payroll_id;

  PERFORM log_payroll_event(p_payroll_id, 'payment_reverted', 'paid', 'approved', p_reason,
    jsonb_build_object('payment_id', v_pay, 'amount', v_p.net_pay));
  RETURN v_pay;
END $function$;

CREATE OR REPLACE FUNCTION public.duplicate_payroll_run(p_payroll_id uuid, p_period_start date DEFAULT NULL, p_period_end date DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_p payroll_runs%ROWTYPE; v_new uuid; v_start date; v_end date;
BEGIN
  SELECT * INTO v_p FROM payroll_runs WHERE id = p_payroll_id;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'Nómina no encontrada'; END IF;
  IF NOT (is_superadmin(auth.uid()) OR is_tenant_member(v_p.tenant_id)) THEN RAISE EXCEPTION 'No autorizado'; END IF;

  v_start := COALESCE(p_period_start, (v_p.period_end + 1));
  v_end := COALESCE(p_period_end, (v_start + (v_p.period_end - v_p.period_start)));

  INSERT INTO payroll_runs (tenant_id, employee_id, period_start, period_end, base_salary, hours_worked,
    bonus, deductions, gross_salary, net_pay, status, notes, payment_method)
  VALUES (v_p.tenant_id, v_p.employee_id, v_start, v_end, v_p.base_salary, v_p.hours_worked,
    v_p.bonus, v_p.deductions, v_p.base_salary + v_p.bonus, v_p.base_salary + v_p.bonus - v_p.deductions,
    'pending', 'Duplicada de ' || v_p.period_start || ' → ' || v_p.period_end, v_p.payment_method)
  RETURNING id INTO v_new;

  PERFORM log_payroll_event(v_new, 'payroll_duplicated', NULL, 'pending',
    'Duplicada desde el período ' || v_p.period_start || ' → ' || v_p.period_end,
    jsonb_build_object('source_payroll_id', p_payroll_id));
  RETURN v_new;
END $function$;

GRANT EXECUTE ON FUNCTION public.log_payroll_event(uuid, text, text, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_payroll_signature(uuid, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recompute_payroll_run(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unapprove_payroll_run(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_payroll_run(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revert_payroll_payment(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.duplicate_payroll_run(uuid, date, date) TO authenticated, service_role;