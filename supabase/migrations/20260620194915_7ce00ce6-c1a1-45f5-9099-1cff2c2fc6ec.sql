
-- =========================================================
-- FASE 6: KPIs financieros desde el Libro Mayor + Smoke Test
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_financial_kpis(
  p_tenant uuid,
  p_period_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period uuid := p_period_id;
  v_period_name text;
  v_period_status text;
  v_revenue numeric := 0;
  v_expense numeric := 0;
  v_assets numeric := 0;
  v_liab numeric := 0;
  v_equity numeric := 0;
  v_cash numeric := 0;
  v_ar numeric := 0;
  v_ap numeric := 0;
BEGIN
  IF v_period IS NULL THEN
    SELECT id INTO v_period
      FROM public.accounting_periods
     WHERE tenant_id = p_tenant AND status = 'open'
     ORDER BY start_date DESC LIMIT 1;
  END IF;

  IF v_period IS NULL THEN
    SELECT id INTO v_period
      FROM public.accounting_periods
     WHERE tenant_id = p_tenant
     ORDER BY start_date DESC LIMIT 1;
  END IF;

  SELECT name, status INTO v_period_name, v_period_status
    FROM public.accounting_periods WHERE id = v_period;

  -- Aggregate from general_ledger by account type/code prefix
  SELECT
    COALESCE(SUM(CASE WHEN a.type = 'income'  THEN gl.credit_total - gl.debit_total END),0),
    COALESCE(SUM(CASE WHEN a.type = 'expense' THEN gl.debit_total  - gl.credit_total END),0),
    COALESCE(SUM(CASE WHEN a.type = 'asset'   THEN gl.closing_balance END),0),
    COALESCE(SUM(CASE WHEN a.type = 'liability' THEN gl.closing_balance END),0),
    COALESCE(SUM(CASE WHEN a.type = 'equity'  THEN gl.closing_balance END),0),
    COALESCE(SUM(CASE WHEN a.code LIKE '1101%' THEN gl.closing_balance END),0),
    COALESCE(SUM(CASE WHEN a.code LIKE '1105%' OR a.code LIKE '1106%' THEN gl.closing_balance END),0),
    COALESCE(SUM(CASE WHEN a.code LIKE '2101%' OR a.code LIKE '2110%' THEN gl.closing_balance END),0)
  INTO v_revenue, v_expense, v_assets, v_liab, v_equity, v_cash, v_ar, v_ap
  FROM public.general_ledger gl
  JOIN public.accounting_accounts a ON a.id = gl.account_id
  WHERE gl.tenant_id = p_tenant
    AND (v_period IS NULL OR gl.period_id = v_period);

  RETURN jsonb_build_object(
    'period_id', v_period,
    'period_name', v_period_name,
    'period_status', v_period_status,
    'revenue', v_revenue,
    'expense', v_expense,
    'net_income', v_revenue - v_expense,
    'assets', v_assets,
    'liabilities', v_liab,
    'equity', v_equity,
    'cash', v_cash,
    'accounts_receivable', v_ar,
    'accounts_payable', v_ap,
    'margin_pct', CASE WHEN v_revenue > 0 THEN ROUND(((v_revenue - v_expense)/v_revenue)*100, 2) ELSE 0 END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_financial_kpis(uuid, uuid) TO authenticated, service_role;

-- =========================================================
-- Smoke test end-to-end del Financial Core
-- =========================================================
CREATE OR REPLACE FUNCTION public.smoke_test_financial_core(p_tenant uuid)
RETURNS TABLE(check_name text, status text, detail text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_debit numeric;
  v_credit numeric;
BEGIN
  -- 1. Perfil contable asignado
  SELECT COUNT(*) INTO v_count
    FROM public.accounting_profiles WHERE tenant_id = p_tenant;
  check_name := 'accounting_profile';
  status := CASE WHEN v_count > 0 THEN 'pass' ELSE 'fail' END;
  detail := v_count || ' perfil(es)';
  RETURN NEXT;

  -- 2. Plan de cuentas
  SELECT COUNT(*) INTO v_count
    FROM public.accounting_accounts WHERE tenant_id = p_tenant;
  check_name := 'chart_of_accounts';
  status := CASE WHEN v_count >= 10 THEN 'pass' ELSE 'fail' END;
  detail := v_count || ' cuentas';
  RETURN NEXT;

  -- 3. Año fiscal y períodos
  SELECT COUNT(*) INTO v_count
    FROM public.accounting_periods WHERE tenant_id = p_tenant;
  check_name := 'fiscal_periods';
  status := CASE WHEN v_count = 12 THEN 'pass' WHEN v_count > 0 THEN 'warn' ELSE 'fail' END;
  detail := v_count || ' períodos';
  RETURN NEXT;

  -- 4. Reglas de posteo
  SELECT COUNT(*) INTO v_count FROM public.posting_rules;
  check_name := 'posting_rules';
  status := CASE WHEN v_count >= 5 THEN 'pass' ELSE 'fail' END;
  detail := v_count || ' reglas globales';
  RETURN NEXT;

  -- 5. Libro mayor cuadrado
  SELECT COALESCE(SUM(jel.debit),0), COALESCE(SUM(jel.credit),0)
    INTO v_debit, v_credit
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.entry_id
   WHERE je.tenant_id = p_tenant AND je.status = 'posted';
  check_name := 'ledger_balance';
  status := CASE WHEN ABS(v_debit - v_credit) < 0.01 THEN 'pass' ELSE 'fail' END;
  detail := 'Débitos=' || v_debit || ' Créditos=' || v_credit;
  RETURN NEXT;

  -- 6. Triggers conectados
  SELECT COUNT(*) INTO v_count
    FROM pg_trigger
   WHERE tgname IN (
     'trg_inventory_movement_event','trg_bank_tx_event',
     'trg_delivery_commission_event','trg_shift_close_event',
     'trg_jel_refresh_gl'
   );
  check_name := 'operational_triggers';
  status := CASE WHEN v_count >= 4 THEN 'pass' ELSE 'warn' END;
  detail := v_count || ' triggers activos';
  RETURN NEXT;

  -- 7. Eventos financieros procesados
  SELECT COUNT(*) INTO v_count
    FROM public.financial_events
   WHERE tenant_id = p_tenant AND status = 'posted';
  check_name := 'financial_events';
  status := CASE WHEN v_count > 0 THEN 'pass' ELSE 'warn' END;
  detail := v_count || ' eventos posteados';
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.smoke_test_financial_core(uuid) TO authenticated, service_role;
