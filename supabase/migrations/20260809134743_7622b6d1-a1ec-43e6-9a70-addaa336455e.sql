CREATE OR REPLACE FUNCTION public.financial_health_check(p_tenant uuid)
RETURNS TABLE(area text, check_name text, status text, metric numeric, detail text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v numeric; v2 numeric; v3 numeric;
BEGIN
  IF NOT (public.is_superadmin(auth.uid()) OR public.is_tenant_member(p_tenant)) THEN
    RAISE EXCEPTION 'Acceso denegado a la empresa indicada';
  END IF;

  SELECT count(*) INTO v FROM public.accounting_accounts WHERE tenant_id = p_tenant AND is_active;
  RETURN QUERY SELECT 'chart_of_accounts','accounts_active',
    CASE WHEN v = 0 THEN 'CRITICAL' WHEN v < 20 THEN 'WARNING' ELSE 'PASS' END, v,
    v || ' cuentas activas en el plan de la empresa';

  SELECT count(*) INTO v FROM public.accounting_accounts a
   WHERE a.tenant_id = p_tenant AND a.parent_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.accounting_accounts p WHERE p.id = a.parent_id);
  RETURN QUERY SELECT 'chart_of_accounts','hierarchy_orphans',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'CRITICAL' END, v, v || ' cuentas con padre inexistente';

  SELECT count(*) INTO v FROM (
    SELECT code FROM public.accounting_accounts WHERE tenant_id = p_tenant GROUP BY code HAVING count(*) > 1) z;
  RETURN QUERY SELECT 'chart_of_accounts','duplicate_codes',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'CRITICAL' END, v, v || ' códigos de cuenta duplicados';

  SELECT count(*) INTO v FROM public.journal_entry_lines l
    JOIN public.journal_entries e ON e.id = l.entry_id
    JOIN public.accounting_accounts a ON a.id = l.account_id
   WHERE e.tenant_id = p_tenant AND (a.is_postable = false OR a.is_active = false);
  RETURN QUERY SELECT 'chart_of_accounts','postings_on_invalid_accounts',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'CRITICAL' END, v, v || ' líneas sobre cuentas no imputables o inactivas';

  SELECT count(*) INTO v FROM (
    SELECT l.entry_id FROM public.journal_entry_lines l
      JOIN public.journal_entries e ON e.id = l.entry_id
     WHERE e.tenant_id = p_tenant AND e.status = 'posted'
     GROUP BY l.entry_id HAVING round(sum(l.debit),2) <> round(sum(l.credit),2)) z;
  RETURN QUERY SELECT 'accounting','double_entry',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'CRITICAL' END, v, v || ' asientos posteados descuadrados';

  SELECT count(*) INTO v FROM public.journal_entry_lines l
   WHERE NOT EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id = l.entry_id);
  RETURN QUERY SELECT 'accounting','orphan_lines',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'CRITICAL' END, v, v || ' líneas sin asiento';

  SELECT COALESCE(SUM(CASE a.type WHEN 'asset' THEN l.debit - l.credit ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN a.type IN ('liability','equity') THEN l.credit - l.debit ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN a.type = 'income' THEN l.credit - l.debit WHEN a.type IN ('expense','cost') THEN l.debit - l.credit ELSE 0 END),0)
    INTO v, v2, v3
  FROM public.journal_entry_lines l
  JOIN public.journal_entries e ON e.id = l.entry_id
  JOIN public.accounting_accounts a ON a.id = l.account_id
  WHERE e.tenant_id = p_tenant AND e.status = 'posted';
  RETURN QUERY SELECT 'accounting','balance_equation',
    CASE WHEN abs(v - (v2 + v3)) < 0.02 THEN 'PASS' ELSE 'CRITICAL' END, round(v - (v2 + v3), 2),
    'Activo ' || round(v,2) || ' = Pasivo+Patrimonio ' || round(v2,2) || ' + Resultado ' || round(v3,2);

  SELECT count(*) INTO v FROM public.general_ledger WHERE tenant_id = p_tenant;
  RETURN QUERY SELECT 'ledger','projection_rows',
    CASE WHEN v = 0 THEN 'WARNING' ELSE 'PASS' END, v,
    CASE WHEN v = 0 THEN 'Mayor sin proyección: ejecute la reconstrucción' ELSE v || ' filas de mayor por período' END;

  SELECT count(*) INTO v FROM public.sales s
   WHERE s.tenant_id = p_tenant AND s.status = 'completed'
     AND NOT EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.reference_type = 'sale' AND j.reference_id = s.id);
  RETURN QUERY SELECT 'sales','sales_posted',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'CRITICAL' END, v, v || ' ventas completadas sin asiento';

  SELECT count(*) INTO v FROM public.purchases p
   WHERE p.tenant_id = p_tenant AND p.status IN ('received','partial','paid')
     AND NOT EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.reference_type = 'purchase' AND j.reference_id = p.id);
  RETURN QUERY SELECT 'purchases','purchases_posted',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'CRITICAL' END, v, v || ' compras recibidas sin asiento';

  SELECT count(*) INTO v FROM public.payroll_runs r
   WHERE r.tenant_id = p_tenant AND r.status = 'paid' AND r.journal_entry_id IS NULL;
  RETURN QUERY SELECT 'payroll','payroll_posted',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'CRITICAL' END, v, v || ' nóminas pagadas sin asiento';

  SELECT count(*) INTO v FROM public.accounts_payable ap
   WHERE ap.tenant_id = p_tenant AND (COALESCE(ap.amount_paid,0) > COALESCE(ap.amount,0) + 0.01);
  RETURN QUERY SELECT 'accounts_payable','overpaid_bills',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'CRITICAL' END, v, v || ' cuentas por pagar con pagos superiores al importe';

  SELECT count(*) INTO v FROM public.customers c WHERE c.tenant_id = p_tenant AND COALESCE(c.balance,0) < -0.01;
  RETURN QUERY SELECT 'accounts_receivable','negative_customer_balance',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'WARNING' END, v, v || ' clientes con saldo negativo (crédito a favor)';

  SELECT count(*) INTO v FROM public.product_stock ps
   WHERE ps.tenant_id = p_tenant AND COALESCE(ps.stock,0) < 0;
  RETURN QUERY SELECT 'inventory','negative_stock',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'WARNING' END, v, v || ' existencias negativas';

  SELECT count(*) INTO v FROM public.fiscal_rules WHERE tenant_id = p_tenant AND is_active;
  RETURN QUERY SELECT 'tax','fiscal_rules_configured',
    CASE WHEN v = 0 THEN 'WARNING' ELSE 'PASS' END, v,
    CASE WHEN v = 0 THEN 'Sin reglas fiscales activas: la empresa no tiene perfil fiscal configurado' ELSE v || ' reglas fiscales activas' END;

  SELECT count(*) INTO v FROM public.sales s
   WHERE s.tenant_id = p_tenant AND (s.currency IS NULL OR COALESCE(s.exchange_rate,0) <= 0);
  RETURN QUERY SELECT 'multicurrency','sales_fx_defined',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'CRITICAL' END, v, v || ' ventas sin moneda o tipo de cambio válido';

  SELECT count(*) INTO v FROM public.journal_entries WHERE tenant_id IS NULL;
  RETURN QUERY SELECT 'security','entries_without_tenant',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'CRITICAL' END, v, v || ' asientos sin empresa (global)';

  SELECT count(*) INTO v FROM public.journal_entry_lines l
    JOIN public.journal_entries e ON e.id = l.entry_id
    JOIN public.accounting_accounts a ON a.id = l.account_id
   WHERE e.tenant_id = p_tenant AND a.tenant_id IS NOT NULL AND a.tenant_id <> e.tenant_id;
  RETURN QUERY SELECT 'security','cross_tenant_lines',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'CRITICAL' END, v, v || ' líneas que usan cuentas de otra empresa';

  SELECT count(*) INTO v FROM public.accounting_mappings WHERE tenant_id = p_tenant AND is_active;
  RETURN QUERY SELECT 'mapping','mappings_defined',
    CASE WHEN v = 0 THEN 'WARNING' ELSE 'PASS' END, v,
    CASE WHEN v = 0 THEN 'Sin mapeos explícitos: se usan códigos de cuenta por convención' ELSE v || ' mapeos contables definidos' END;
END $$;