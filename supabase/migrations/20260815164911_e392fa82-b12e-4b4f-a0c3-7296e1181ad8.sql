CREATE OR REPLACE FUNCTION public.financial_engine_diagnostics(p_tenant uuid)
RETURNS TABLE(area text, check_code text, status text, severity text, metric numeric, expected numeric, detail text, remediation text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v numeric;
  v2 numeric;
  v3 numeric;
  v_profile text;
  v_assets numeric; v_liab numeric; v_eq numeric; v_inc numeric; v_exp numeric;
BEGIN
  IF p_tenant IS NULL THEN RETURN; END IF;

  -- ============ ESTRUCTURA ============
  SELECT t.accounting_profile_code INTO v_profile FROM public.tenants t WHERE t.id = p_tenant;
  RETURN QUERY SELECT 'structure','accounting_profile',
    CASE WHEN EXISTS (SELECT 1 FROM public.accounting_profiles ap WHERE ap.code = v_profile) THEN 'pass' ELSE 'fail' END,
    'critical', NULL::numeric, NULL::numeric, COALESCE(v_profile,'—'), 'apply_accounting_profile';

  SELECT count(*) INTO v FROM public.accounting_accounts WHERE tenant_id = p_tenant;
  SELECT count(*) INTO v2 FROM public.accounting_accounts WHERE tenant_id = p_tenant AND is_postable AND is_active;
  RETURN QUERY SELECT 'structure','chart_of_accounts',
    CASE WHEN v >= 20 AND v2 >= 10 THEN 'pass' WHEN v > 0 THEN 'warn' ELSE 'fail' END,
    'high', v, 20::numeric, v || ' / ' || v2, 'import_chart_template';

  SELECT count(*) INTO v FROM public.accounting_accounts a
   WHERE a.tenant_id = p_tenant AND a.parent_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.accounting_accounts p WHERE p.id = a.parent_id);
  RETURN QUERY SELECT 'structure','hierarchy_orphans',
    CASE WHEN v = 0 THEN 'pass' ELSE 'fail' END, 'high', v, 0::numeric, v::text, 'fix_hierarchy';

  SELECT count(*) INTO v FROM (
    SELECT code FROM public.accounting_accounts WHERE tenant_id = p_tenant GROUP BY code HAVING count(*) > 1
  ) d;
  RETURN QUERY SELECT 'structure','duplicate_codes',
    CASE WHEN v = 0 THEN 'pass' ELSE 'fail' END, 'high', v, 0::numeric, v::text, 'fix_duplicate_codes';

  SELECT count(*) INTO v FROM public.accounting_mappings WHERE tenant_id = p_tenant AND is_active;
  RETURN QUERY SELECT 'structure','accounting_mappings',
    CASE WHEN v >= 8 THEN 'pass' WHEN v > 0 THEN 'warn' ELSE 'fail' END, 'high', v, 8::numeric, v::text, 'configure_mappings';

  SELECT count(*) INTO v FROM public.posting_rules WHERE active;
  RETURN QUERY SELECT 'structure','posting_rules',
    CASE WHEN v >= 5 THEN 'pass' ELSE 'warn' END, 'medium', v, 5::numeric, v::text, 'configure_posting_rules';

  -- ============ PERIODOS ============
  SELECT count(*) INTO v FROM public.fiscal_years WHERE tenant_id = p_tenant AND is_current;
  RETURN QUERY SELECT 'periods','current_fiscal_year',
    CASE WHEN v = 1 THEN 'pass' ELSE 'fail' END, 'critical', v, 1::numeric, v::text, 'create_fiscal_year';

  SELECT count(*) INTO v FROM public.accounting_periods ap
    JOIN public.fiscal_years fy ON fy.id = ap.fiscal_year_id AND fy.is_current
   WHERE ap.tenant_id = p_tenant;
  RETURN QUERY SELECT 'periods','periods_generated',
    CASE WHEN v = 12 THEN 'pass' WHEN v > 0 THEN 'warn' ELSE 'fail' END, 'high', v, 12::numeric, v::text, 'create_fiscal_year';

  SELECT count(*) INTO v FROM public.accounting_periods ap
   WHERE ap.tenant_id = p_tenant AND ap.status = 'open' AND ap.end_date < date_trunc('month', CURRENT_DATE)::date;
  RETURN QUERY SELECT 'periods','stale_open_periods',
    CASE WHEN v = 0 THEN 'pass' ELSE 'warn' END, 'medium', v, 0::numeric, v::text, 'close_accounting_period';

  -- ============ PARTIDA DOBLE ============
  SELECT COALESCE(sum(l.debit),0), COALESCE(sum(l.credit),0) INTO v, v2
    FROM public.journal_entry_lines l JOIN public.journal_entries j ON j.id = l.entry_id
   WHERE j.tenant_id = p_tenant AND j.status = 'posted';
  RETURN QUERY SELECT 'double_entry','double_entry_global',
    CASE WHEN abs(v - v2) < 0.01 THEN 'pass' ELSE 'fail' END, 'critical',
    round(v,2), round(v2,2), round(v,2) || ' / ' || round(v2,2), 'reverse_and_repost';

  SELECT count(*) INTO v FROM (
    SELECT j.id FROM public.journal_entries j JOIN public.journal_entry_lines l ON l.entry_id = j.id
     WHERE j.tenant_id = p_tenant AND j.status = 'posted'
     GROUP BY j.id HAVING abs(COALESCE(sum(l.debit),0) - COALESCE(sum(l.credit),0)) > 0.01
  ) u;
  RETURN QUERY SELECT 'double_entry','unbalanced_entries',
    CASE WHEN v = 0 THEN 'pass' ELSE 'fail' END, 'critical', v, 0::numeric, v::text, 'reverse_and_repost';

  SELECT count(*) INTO v FROM public.journal_entry_lines l
    JOIN public.journal_entries j ON j.id = l.entry_id
    JOIN public.accounting_accounts a ON a.id = l.account_id
   WHERE j.tenant_id = p_tenant AND (NOT a.is_postable OR NOT a.is_active);
  RETURN QUERY SELECT 'double_entry','postings_on_invalid_accounts',
    CASE WHEN v = 0 THEN 'pass' ELSE 'fail' END, 'high', v, 0::numeric, v::text, 'fix_account_flags';

  SELECT count(*) INTO v FROM public.journal_entry_lines l
    JOIN public.journal_entries j ON j.id = l.entry_id
    JOIN public.accounting_accounts a ON a.id = l.account_id
   WHERE j.tenant_id = p_tenant AND a.tenant_id IS NOT NULL AND a.tenant_id <> j.tenant_id;
  RETURN QUERY SELECT 'security','cross_tenant_lines',
    CASE WHEN v = 0 THEN 'pass' ELSE 'fail' END, 'critical', v, 0::numeric, v::text, 'contact_support';

  SELECT count(*) INTO v FROM public.journal_entries WHERE tenant_id IS NULL;
  RETURN QUERY SELECT 'security','entries_without_tenant',
    CASE WHEN v = 0 THEN 'pass' ELSE 'fail' END, 'critical', v, 0::numeric, v::text, 'contact_support';

  SELECT count(*) INTO v FROM public.journal_entries
   WHERE tenant_id = p_tenant AND status = 'draft';
  RETURN QUERY SELECT 'double_entry','draft_entries',
    CASE WHEN v = 0 THEN 'pass' ELSE 'warn' END, 'medium', v, 0::numeric, v::text, 'post_journal_entry';

  SELECT count(*) INTO v FROM (
    SELECT series, entry_number FROM public.journal_entries
     WHERE tenant_id = p_tenant GROUP BY series, entry_number HAVING count(*) > 1
  ) d;
  RETURN QUERY SELECT 'double_entry','entry_number_uniqueness',
    CASE WHEN v = 0 THEN 'pass' ELSE 'fail' END, 'high', v, 0::numeric, v::text, 'contact_support';

  SELECT count(*) INTO v FROM public.journal_entries j
   WHERE j.tenant_id = p_tenant AND j.reverses IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.journal_entries o WHERE o.id = j.reverses);
  RETURN QUERY SELECT 'double_entry','reversal_traceability',
    CASE WHEN v = 0 THEN 'pass' ELSE 'fail' END, 'medium', v, 0::numeric, v::text, 'contact_support';

  SELECT count(*) INTO v FROM public.journal_entries j
   WHERE j.tenant_id = p_tenant AND COALESCE(j.exchange_rate,0) <= 0;
  RETURN QUERY SELECT 'multicurrency','journal_fx_rate',
    CASE WHEN v = 0 THEN 'pass' ELSE 'fail' END, 'high', v, 0::numeric, v::text, 'set_exchange_rate';

  -- ============ ECUACION PATRIMONIAL ============
  SELECT
    COALESCE(sum(CASE WHEN a.type = 'asset' THEN l.debit - l.credit END),0),
    COALESCE(sum(CASE WHEN a.type = 'liability' THEN l.credit - l.debit END),0),
    COALESCE(sum(CASE WHEN a.type = 'equity' THEN l.credit - l.debit END),0),
    COALESCE(sum(CASE WHEN a.type = 'revenue' THEN l.credit - l.debit END),0),
    COALESCE(sum(CASE WHEN a.type IN ('expense','cost') THEN l.debit - l.credit END),0)
    INTO v_assets, v_liab, v_eq, v_inc, v_exp
    FROM public.journal_entry_lines l
    JOIN public.journal_entries j ON j.id = l.entry_id
    JOIN public.accounting_accounts a ON a.id = l.account_id
   WHERE j.tenant_id = p_tenant AND j.status = 'posted';

  RETURN QUERY SELECT 'ledger','balance_equation',
    CASE WHEN abs(v_assets - (v_liab + v_eq + v_inc - v_exp)) < 0.01 THEN 'pass' ELSE 'fail' END,
    'critical', round(v_assets,2), round(v_liab + v_eq + v_inc - v_exp,2),
    round(v_assets,2) || ' / ' || round(v_liab + v_eq + v_inc - v_exp,2), 'rebuild_general_ledger';

  RETURN QUERY SELECT 'ledger','net_income','info','info',
    round(v_inc - v_exp,2), NULL::numeric, round(v_inc,2) || ' / ' || round(v_exp,2), 'none';

  SELECT count(*) INTO v FROM public.general_ledger WHERE tenant_id = p_tenant;
  RETURN QUERY SELECT 'ledger','projection_rows',
    CASE WHEN v > 0 THEN 'pass' ELSE 'warn' END, 'medium', v, NULL::numeric, v::text, 'rebuild_general_ledger';

  SELECT COALESCE(sum(debit_total),0), COALESCE(sum(credit_total),0) INTO v, v2
    FROM public.general_ledger WHERE tenant_id = p_tenant;
  RETURN QUERY SELECT 'ledger','projection_balanced',
    CASE WHEN abs(v - v2) < 0.01 THEN 'pass' ELSE 'warn' END, 'medium',
    round(v,2), round(v2,2), round(v,2) || ' / ' || round(v2,2), 'rebuild_general_ledger';

  -- ============ VENTAS ============
  SELECT count(*) INTO v FROM public.sales s
   WHERE s.tenant_id = p_tenant AND s.status = 'completed'
     AND NOT EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.reference_type = 'sale' AND j.reference_id = s.id);
  RETURN QUERY SELECT 'sales','sales_posted',
    CASE WHEN v = 0 THEN 'pass' ELSE 'fail' END, 'critical', v, 0::numeric, v::text, 'repost_sales';

  SELECT count(*) INTO v FROM public.sales s
   WHERE s.tenant_id = p_tenant AND abs(COALESCE(s.total,0) - (COALESCE(s.subtotal,0) + COALESCE(s.tax,0))) > 0.01;
  RETURN QUERY SELECT 'sales','sale_totals',
    CASE WHEN v = 0 THEN 'pass' ELSE 'fail' END, 'high', v, 0::numeric, v::text, 'review_sales';

  SELECT count(*) INTO v FROM public.sales s
   WHERE s.tenant_id = p_tenant AND s.status = 'completed'
     AND abs(COALESCE(s.subtotal,0) - COALESCE((SELECT sum(i.total) FROM public.sale_items i WHERE i.sale_id = s.id),0)) > 0.05;
  RETURN QUERY SELECT 'sales','sale_lines_match',
    CASE WHEN v = 0 THEN 'pass' ELSE 'warn' END, 'medium', v, 0::numeric, v::text, 'review_sales';

  SELECT count(*) INTO v FROM public.sales s
   WHERE s.tenant_id = p_tenant AND (s.currency IS NULL OR COALESCE(s.exchange_rate,0) <= 0
     OR abs(COALESCE(s.total_in_base, s.total * s.exchange_rate) - s.total * s.exchange_rate) > 0.05);
  RETURN QUERY SELECT 'multicurrency','sales_fx_consistency',
    CASE WHEN v = 0 THEN 'pass' ELSE 'fail' END, 'high', v, 0::numeric, v::text, 'set_exchange_rate';

  -- ============ COMPRAS / NOMINA / TURNOS ============
  SELECT count(*) INTO v FROM public.purchases p
   WHERE p.tenant_id = p_tenant AND p.status IN ('received','partial','paid')
     AND NOT EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.reference_type = 'purchase' AND j.reference_id = p.id);
  RETURN QUERY SELECT 'purchases','purchases_posted',
    CASE WHEN v = 0 THEN 'pass' ELSE 'fail' END, 'critical', v, 0::numeric, v::text, 'repost_purchases';

  SELECT count(*) INTO v FROM public.payroll_runs r
   WHERE r.tenant_id = p_tenant AND r.status = 'paid' AND r.journal_entry_id IS NULL;
  RETURN QUERY SELECT 'payroll','payroll_posted',
    CASE WHEN v = 0 THEN 'pass' ELSE 'fail' END, 'high', v, 0::numeric, v::text, 'repost_payroll';

  SELECT count(*) INTO v FROM public.sales_shifts s
   WHERE s.tenant_id = p_tenant AND s.status = 'closed' AND s.z_journal_entry_id IS NULL;
  RETURN QUERY SELECT 'treasury','shifts_z_posted',
    CASE WHEN v = 0 THEN 'pass' ELSE 'warn' END, 'medium', v, 0::numeric, v::text, 'close_shift_z';

  SELECT COALESCE(sum(abs(COALESCE(cash_difference,0))),0) INTO v FROM public.sales_shifts
   WHERE tenant_id = p_tenant AND status = 'closed';
  RETURN QUERY SELECT 'treasury','shift_cash_variance',
    CASE WHEN v < 1 THEN 'pass' ELSE 'warn' END, 'medium', round(v,2), 0::numeric, round(v,2)::text, 'review_shifts';

  -- ============ CxC / CxP ============
  SELECT count(*) INTO v FROM public.accounts_payable
   WHERE tenant_id = p_tenant AND COALESCE(amount_paid,0) > COALESCE(amount,0) + 0.01;
  RETURN QUERY SELECT 'accounts_payable','overpaid_bills',
    CASE WHEN v = 0 THEN 'pass' ELSE 'fail' END, 'high', v, 0::numeric, v::text, 'review_payables';

  SELECT count(*), COALESCE(sum(amount - COALESCE(amount_paid,0)),0) INTO v, v2
    FROM public.accounts_payable
   WHERE tenant_id = p_tenant AND status <> 'paid' AND due_date IS NOT NULL AND due_date < CURRENT_DATE;
  RETURN QUERY SELECT 'accounts_payable','overdue_payables',
    CASE WHEN v = 0 THEN 'pass' ELSE 'warn' END, 'medium', v, 0::numeric, v || ' / ' || round(v2,2), 'pay_overdue';

  SELECT count(*), COALESCE(sum(balance),0) INTO v, v2 FROM public.customers
   WHERE tenant_id = p_tenant AND balance > 0;
  SELECT count(*) INTO v3 FROM public.customers
   WHERE tenant_id = p_tenant AND credit_limit > 0 AND balance > credit_limit;
  RETURN QUERY SELECT 'accounts_receivable','receivables_exposure',
    CASE WHEN v3 = 0 THEN 'pass' ELSE 'warn' END, 'medium', round(v2,2), NULL::numeric,
    v || ' / ' || round(v2,2) || ' / ' || v3, 'review_receivables';

  SELECT count(*) INTO v FROM public.customers WHERE tenant_id = p_tenant AND balance < -0.01;
  RETURN QUERY SELECT 'accounts_receivable','negative_customer_balance',
    CASE WHEN v = 0 THEN 'pass' ELSE 'warn' END, 'low', v, 0::numeric, v::text, 'review_receivables';

  -- ============ INVENTARIO ============
  SELECT count(*) INTO v FROM public.product_stock WHERE tenant_id = p_tenant AND stock < 0;
  RETURN QUERY SELECT 'inventory','negative_stock',
    CASE WHEN v = 0 THEN 'pass' ELSE 'fail' END, 'high', v, 0::numeric, v::text, 'adjust_stock';

  SELECT count(*) INTO v FROM public.product_stock
   WHERE tenant_id = p_tenant AND min_stock > 0 AND stock <= min_stock;
  RETURN QUERY SELECT 'inventory','stock_below_min',
    CASE WHEN v = 0 THEN 'pass' ELSE 'warn' END, 'low', v, 0::numeric, v::text, 'replenish_stock';

  -- ============ FISCALIDAD ============
  SELECT count(*) INTO v FROM public.fiscal_rules WHERE tenant_id = p_tenant AND is_active;
  RETURN QUERY SELECT 'tax','fiscal_rules_configured',
    CASE WHEN v > 0 THEN 'pass' ELSE 'warn' END, 'high', v, 1::numeric, v::text, 'configure_fiscal_rules';

  SELECT count(*) INTO v FROM public.cu_tax_declarations
   WHERE tenant_id = p_tenant AND status IN ('draft','computed');
  RETURN QUERY SELECT 'tax','pending_declarations',
    CASE WHEN v = 0 THEN 'pass' ELSE 'warn' END, 'medium', v, 0::numeric, v::text, 'submit_declarations';

  -- ============ TESORERIA / BANCOS ============
  SELECT count(*) INTO v FROM public.bank_accounts
   WHERE tenant_id = p_tenant AND is_active AND accounting_account_id IS NULL;
  RETURN QUERY SELECT 'treasury','bank_accounts_mapped',
    CASE WHEN v = 0 THEN 'pass' ELSE 'warn' END, 'medium', v, 0::numeric, v::text, 'map_bank_accounts';

  SELECT count(*) INTO v FROM public.bank_transactions
   WHERE tenant_id = p_tenant AND status = 'pending';
  RETURN QUERY SELECT 'treasury','unmatched_bank_tx',
    CASE WHEN v = 0 THEN 'pass' ELSE 'warn' END, 'medium', v, 0::numeric, v::text, 'reconcile_bank';

  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.financial_engine_diagnostics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.financial_engine_diagnostics(uuid) TO authenticated, service_role;