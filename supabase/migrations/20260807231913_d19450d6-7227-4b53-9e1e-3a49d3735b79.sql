CREATE OR REPLACE FUNCTION public.compute_tax_declaration(
  p_tenant uuid,
  p_period_id uuid,
  p_declaration_type text DEFAULT 'income_tax',
  p_tax_rate numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_income numeric := 0;
  v_expenses numeric := 0;
  v_deductible numeric := 0;
  v_base numeric := 0;
  v_tax numeric := 0;
  v_rate numeric;
  v_country text;
  v_kind text;
  v_period public.accounting_periods%ROWTYPE;
  v_decl_id uuid;
  v_payload jsonb;
BEGIN
  IF NOT (public.is_superadmin(auth.uid()) OR public.is_tenant_member(p_tenant)) THEN
    RAISE EXCEPTION 'Sin acceso a esta empresa';
  END IF;

  SELECT * INTO v_period FROM public.accounting_periods WHERE id = p_period_id AND tenant_id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Período no encontrado para esta empresa'; END IF;

  SELECT country_code INTO v_country FROM public.tenants WHERE id = p_tenant;

  v_kind := CASE WHEN p_declaration_type IN ('income_tax','utilidades','DJ-08','DJ-09') THEN 'income_tax'
                 ELSE p_declaration_type END;

  v_rate := p_tax_rate;
  IF v_rate IS NULL THEN
    SELECT fr.rate INTO v_rate
      FROM public.fiscal_rules fr
     WHERE fr.is_active AND fr.rule_type = v_kind
       AND (fr.tenant_id = p_tenant OR (fr.tenant_id IS NULL AND fr.country_code = COALESCE(v_country,'XX')))
     ORDER BY (fr.tenant_id IS NOT NULL) DESC, fr.is_default DESC
     LIMIT 1;
  END IF;
  v_rate := COALESCE(v_rate, 25);

  SELECT
    COALESCE(SUM(CASE WHEN a.type = 'income' THEN jel.credit - jel.debit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN a.type IN ('expense','cost') THEN jel.debit - jel.credit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN a.type IN ('expense','cost') AND a.code NOT LIKE '5401%' THEN jel.debit - jel.credit ELSE 0 END), 0)
    INTO v_income, v_expenses, v_deductible
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.entry_id
  JOIN public.accounting_accounts a ON a.id = jel.account_id
  WHERE je.tenant_id = p_tenant
    AND je.period_id = p_period_id
    AND je.status = 'posted';

  -- Turnover-style taxes are levied on revenue; profit taxes on net income.
  v_base := CASE WHEN v_kind IN ('sales_tax','turnover','vat')
                 THEN GREATEST(v_income, 0)
                 ELSE GREATEST(v_income - v_deductible, 0) END;
  v_tax := ROUND(v_base * (ABS(v_rate) / 100.0), 2);

  v_payload := jsonb_build_object(
    'computed_at', now(),
    'country_code', COALESCE(v_country,'XX'),
    'rule_type', v_kind,
    'base_kind', CASE WHEN v_kind IN ('sales_tax','turnover','vat') THEN 'revenue' ELSE 'net_profit' END,
    'breakdown', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('code', a.code, 'name', a.name, 'type', a.type, 'amount', x.amount) ORDER BY a.code), '[]'::jsonb)
      FROM (
        SELECT jel.account_id,
               CASE WHEN max(a2.type) = 'income' THEN SUM(jel.credit - jel.debit) ELSE SUM(jel.debit - jel.credit) END AS amount
        FROM public.journal_entry_lines jel
        JOIN public.journal_entries je ON je.id = jel.entry_id
        JOIN public.accounting_accounts a2 ON a2.id = jel.account_id
        WHERE je.tenant_id = p_tenant AND je.period_id = p_period_id AND je.status = 'posted'
          AND a2.type IN ('income','expense','cost')
        GROUP BY jel.account_id
      ) x JOIN public.accounting_accounts a ON a.id = x.account_id
    )
  );

  INSERT INTO public.cu_tax_declarations (
    tenant_id, declaration_type, period_id, fiscal_year, period_label,
    total_income, total_expenses, deductible_expenses, taxable_base,
    tax_rate, tax_due, status, payload, created_by
  ) VALUES (
    p_tenant, p_declaration_type, p_period_id, EXTRACT(YEAR FROM v_period.start_date)::int,
    to_char(v_period.start_date, 'YYYY-MM'),
    v_income, v_expenses, v_deductible, v_base, ABS(v_rate), v_tax, 'draft', v_payload, auth.uid()
  )
  ON CONFLICT (tenant_id, period_id, declaration_type) DO UPDATE SET
    total_income = EXCLUDED.total_income,
    total_expenses = EXCLUDED.total_expenses,
    deductible_expenses = EXCLUDED.deductible_expenses,
    taxable_base = EXCLUDED.taxable_base,
    tax_rate = EXCLUDED.tax_rate,
    tax_due = EXCLUDED.tax_due,
    payload = EXCLUDED.payload,
    updated_at = now()
  RETURNING id INTO v_decl_id;

  RETURN v_decl_id;
END;
$function$;