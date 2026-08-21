-- 1) Views tenant-scoped: respetar RLS del usuario
ALTER VIEW public.v_ar_aging SET (security_invoker = true);
ALTER VIEW public.v_ap_aging SET (security_invoker = true);
ALTER VIEW public.v_cash_flow SET (security_invoker = true);
ALTER VIEW public.v_trial_balance SET (security_invoker = true);
ALTER VIEW public.trial_balance_view SET (security_invoker = true);
ALTER VIEW public.v_income_statement SET (security_invoker = true);
ALTER VIEW public.v_balance_sheet SET (security_invoker = true);
ALTER VIEW public.general_ledger_view SET (security_invoker = true);
ALTER VIEW public.sale_returns_view SET (security_invoker = true);
ALTER VIEW public.recipe_costing SET (security_invoker = true);
ALTER VIEW public.v_replenishment_suggestions SET (security_invoker = true);
ALTER VIEW public.budget_execution_view SET (security_invoker = true);
ALTER VIEW public.party_balance_by_currency SET (security_invoker = true);
ALTER VIEW public.domain_event_divergences SET (security_invoker = true);
ALTER VIEW public.driver_last_location SET (security_invoker = true);

-- 2) Funciones de trigger: no deben ser invocables por la API
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $do$;

-- 3) RPC privilegiadas que la aplicación NO invoca desde el cliente
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'allocate_consignment_for_sale','apply_coupon_to_sale','auto_reconcile_bank_account',
        'close_fiscal_year','close_shift_with_summary','compute_payroll_full','cu_calculate_cost_sheet',
        'employee_vacation_balance','post_financial_event','rebuild_general_ledger',
        'refresh_shift_totals','upsert_customer_for_online_order','provision_default_ai_agents',
        'assign_ticket_number','default_employee_pin','verify_employee_pin','validate_coupon',
        'apply_account_payment_balance','apply_purchase_credit_balance','apply_sale_credit_balance',
        'generate_payroll_payable','reopen_accounting_period','assert_public_tenant',
        'is_protected_superadmin','snapshot_currency_rate','sync_supplier_product_from_purchase',
        'ignore_bank_transaction','recompute_cu_cost_sheet'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $do$;

-- reponer las que sí usa el cliente (con guardas añadidas más abajo)
GRANT EXECUTE ON FUNCTION public.reopen_accounting_period(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ignore_bank_transaction(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_cu_cost_sheet(uuid) TO authenticated;

-- firma antigua de cobros (sin idempotencia) fuera de la API
REVOKE ALL ON FUNCTION public.register_account_payment(text,uuid,numeric,text,text,numeric,text,uuid,text) FROM PUBLIC, anon, authenticated;

-- 4) Guardas de tenant en las RPC que sí usa el cliente
DO $do$
DECLARE r record; d text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('clock_in','p_employee_id uuid, p_lat numeric, p_lng numeric, p_photo text, p_store_id uuid, p_source text',
     'PERFORM public.assert_tenant_access((SELECT tenant_id FROM public.employees WHERE id = p_employee_id));'),
    ('clock_out','p_employee_id uuid, p_lat numeric, p_lng numeric, p_photo text',
     'PERFORM public.assert_tenant_access((SELECT tenant_id FROM public.employees WHERE id = p_employee_id));'),
    ('compute_payroll','_employee_id uuid, _start date, _end date',
     'PERFORM public.assert_tenant_access((SELECT tenant_id FROM public.employees WHERE id = _employee_id));'),
    ('request_leave','p_employee_id uuid, p_type text, p_start date, p_end date, p_reason text',
     'PERFORM public.assert_tenant_access((SELECT tenant_id FROM public.employees WHERE id = p_employee_id));'),
    ('reopen_accounting_period','p_period_id uuid',
     'PERFORM public.assert_tenant_access((SELECT tenant_id FROM public.accounting_periods WHERE id = p_period_id));'),
    ('recompute_cu_cost_sheet','p_cost_sheet_id uuid',
     'PERFORM public.assert_tenant_access((SELECT tenant_id FROM public.cu_cost_sheets WHERE id = p_cost_sheet_id));'),
    ('receive_purchase','p_purchase_id uuid',
     'PERFORM public.assert_tenant_access((SELECT tenant_id FROM public.purchases WHERE id = p_purchase_id));'),
    ('receive_purchase','p_purchase_id uuid, p_idempotency_key text, p_correlation_id text',
     'PERFORM public.assert_tenant_access((SELECT tenant_id FROM public.purchases WHERE id = p_purchase_id));'),
    ('register_account_payment','p_party_type text, p_party_id uuid, p_amount numeric, p_method text, p_currency text, p_exchange_rate numeric, p_reference_type text, p_reference_id uuid, p_notes text, p_idempotency_key text, p_correlation_id text',
     'PERFORM public.assert_tenant_access(public.active_tenant_id());')
  ) v(fn, args, guard) LOOP
    SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = r.fn
      AND pg_get_function_identity_arguments(p.oid) = r.args;
    IF d IS NULL THEN RAISE EXCEPTION 'no encontrada: %(%)', r.fn, r.args; END IF;
    IF position('assert_tenant_access' in d) = 0 THEN
      d := regexp_replace(d, '(^|\n)BEGIN\n', '\1BEGIN' || chr(10) || '  ' || r.guard || chr(10));
      EXECUTE d;
    END IF;
  END LOOP;
END $do$;

-- ignore_bank_transaction (SQL) con verificación de negocio
CREATE OR REPLACE FUNCTION public.ignore_bank_transaction(p_tx_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  PERFORM public.assert_tenant_access((SELECT tenant_id FROM public.bank_transactions WHERE id = p_tx_id));
  UPDATE public.bank_transactions SET status = 'ignored' WHERE id = p_tx_id;
END;
$fn$;

-- 5) POS: límites razonables contra cantidades/importes imposibles
DO $do$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('sale_items','sale_items_qty_sane','qty > 0 AND qty <= 1000000'),
    ('sale_items','sale_items_total_sane','total >= 0 AND total < 1e12'),
    ('sales','sales_total_sane','total >= 0 AND total < 1e12'),
    ('sale_payments','sale_payments_amount_sane','amount > 0 AND amount < 1e12')
  ) v(tbl, con, expr) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = r.con) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%s) NOT VALID', r.tbl, r.con, r.expr);
    END IF;
  END LOOP;
END $do$;
