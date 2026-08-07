-- 1. FIX: smoke_test_financial_core referenced accounting_profiles.tenant_id (does not exist)
CREATE OR REPLACE FUNCTION public.smoke_test_financial_core(p_tenant uuid)
RETURNS TABLE(check_name text, status text, detail text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
  v_debit numeric;
  v_credit numeric;
  v_profile text;
BEGIN
  SELECT t.accounting_profile_code INTO v_profile FROM public.tenants t WHERE t.id = p_tenant;
  check_name := 'accounting_profile';
  status := CASE WHEN EXISTS (SELECT 1 FROM public.accounting_profiles ap WHERE ap.code = v_profile) THEN 'pass' ELSE 'fail' END;
  detail := COALESCE(v_profile, 'sin perfil');
  RETURN NEXT;

  SELECT COUNT(*) INTO v_count FROM public.accounting_accounts WHERE tenant_id = p_tenant;
  check_name := 'chart_of_accounts';
  status := CASE WHEN v_count >= 10 THEN 'pass' ELSE 'fail' END;
  detail := v_count || ' cuentas';
  RETURN NEXT;

  SELECT COUNT(*) INTO v_count FROM public.accounting_periods WHERE tenant_id = p_tenant;
  check_name := 'fiscal_periods';
  status := CASE WHEN v_count = 12 THEN 'pass' WHEN v_count > 0 THEN 'warn' ELSE 'fail' END;
  detail := v_count || ' períodos';
  RETURN NEXT;

  SELECT COUNT(*) INTO v_count FROM public.posting_rules;
  check_name := 'posting_rules';
  status := CASE WHEN v_count >= 5 THEN 'pass' ELSE 'fail' END;
  detail := v_count || ' reglas globales';
  RETURN NEXT;

  SELECT COALESCE(SUM(jel.debit),0), COALESCE(SUM(jel.credit),0)
    INTO v_debit, v_credit
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.entry_id
   WHERE je.tenant_id = p_tenant AND je.status = 'posted';
  check_name := 'ledger_balance';
  status := CASE WHEN ABS(COALESCE(v_debit,0) - COALESCE(v_credit,0)) < 0.01 THEN 'pass' ELSE 'fail' END;
  detail := 'Débitos=' || COALESCE(v_debit,0) || ' Créditos=' || COALESCE(v_credit,0);
  RETURN NEXT;

  SELECT COUNT(*) INTO v_count FROM pg_trigger tg
   WHERE NOT tg.tgisinternal
     AND tg.tgrelid IN ('public.sales'::regclass, 'public.purchases'::regclass, 'public.account_payments'::regclass);
  check_name := 'operational_triggers';
  status := CASE WHEN v_count >= 3 THEN 'pass' ELSE 'fail' END;
  detail := v_count || ' triggers operativos';
  RETURN NEXT;

  SELECT COUNT(*) INTO v_count FROM public.financial_events WHERE tenant_id = p_tenant;
  check_name := 'financial_events';
  status := CASE WHEN v_count > 0 THEN 'pass' ELSE 'warn' END;
  detail := v_count || ' eventos';
  RETURN NEXT;

  SELECT COUNT(*) INTO v_count FROM public.fiscal_rules fr
   WHERE fr.is_active AND (fr.tenant_id = p_tenant
     OR fr.country_code = (SELECT country_code FROM public.tenants WHERE id = p_tenant));
  check_name := 'fiscal_rules';
  status := CASE WHEN v_count > 0 THEN 'pass' ELSE 'fail' END;
  detail := v_count || ' reglas fiscales aplicables';
  RETURN NEXT;
END;
$function$;

-- 2. Income tax rules for the remaining countries (generic fiscal engine)
INSERT INTO public.fiscal_rules (tenant_id, country_code, code, name, rule_type, rate, base, applies_to, is_default, is_active)
VALUES
  (NULL,'ES','ES_IS','Impuesto de Sociedades','income_tax',25,'net','any',true,true),
  (NULL,'MX','MX_ISR','Impuesto sobre la Renta','income_tax',30,'net','any',true,true),
  (NULL,'CO','CO_RENTA','Impuesto de Renta','income_tax',35,'net','any',true,true),
  (NULL,'PE','PE_RENTA','Impuesto a la Renta','income_tax',29.5,'net','any',true,true),
  (NULL,'BR','BR_IRPJ','IRPJ + CSLL','income_tax',34,'net','any',true,true),
  (NULL,'AR','AR_GAN','Impuesto a las Ganancias','income_tax',35,'net','any',true,true),
  (NULL,'US','US_CIT','Corporate Income Tax','income_tax',21,'net','any',true,true),
  (NULL,'XX','XX_CIT','Impuesto sobre utilidades','income_tax',25,'net','any',true,true)
ON CONFLICT DO NOTHING;

-- 3. Generic, country-aware tax declaration (replaces the Cuba-only broken version)
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

  v_rate := p_tax_rate;
  IF v_rate IS NULL THEN
    SELECT fr.rate INTO v_rate
      FROM public.fiscal_rules fr
     WHERE fr.is_active
       AND fr.rule_type = CASE WHEN p_declaration_type IN ('income_tax','utilidades','DJ-08','DJ-09') THEN 'income_tax' ELSE p_declaration_type END
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

  v_base := GREATEST(v_income - v_deductible, 0);
  v_tax := ROUND(v_base * (v_rate / 100.0), 2);

  v_payload := jsonb_build_object(
    'computed_at', now(),
    'country_code', COALESCE(v_country,'XX'),
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
    v_income, v_expenses, v_deductible, v_base, v_rate, v_tax, 'draft', v_payload, auth.uid()
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

-- keep the old name working, delegating to the fixed generic implementation
CREATE OR REPLACE FUNCTION public.compute_cu_tax_declaration(
  p_tenant uuid, p_period_id uuid, p_declaration_type text DEFAULT 'utilidades'::text, p_tax_rate numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.compute_tax_declaration(p_tenant, p_period_id, p_declaration_type, p_tax_rate);
$function$;

-- 4. FIX: submit declaration wrote to non-existent journal_entry_lines columns
CREATE OR REPLACE FUNCTION public.submit_cu_tax_declaration(p_declaration_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_decl public.cu_tax_declarations%ROWTYPE;
  v_acc_expense uuid;
  v_acc_payable uuid;
  v_je_id uuid;
  v_entry_no text;
BEGIN
  SELECT * INTO v_decl FROM public.cu_tax_declarations WHERE id = p_declaration_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Declaración no encontrada'; END IF;
  IF NOT (public.is_superadmin(auth.uid()) OR public.is_tenant_member(v_decl.tenant_id)) THEN
    RAISE EXCEPTION 'Sin acceso a esta empresa';
  END IF;
  IF v_decl.status = 'submitted' THEN RETURN jsonb_build_object('ok', false, 'msg', 'Ya enviada'); END IF;
  IF v_decl.tax_due <= 0 THEN
    UPDATE public.cu_tax_declarations SET status='submitted', submitted_at=now() WHERE id=p_declaration_id;
    RETURN jsonb_build_object('ok', true, 'msg', 'Sin impuesto a pagar');
  END IF;

  SELECT id INTO v_acc_expense FROM public.accounting_accounts
   WHERE tenant_id=v_decl.tenant_id AND type IN ('expense','cost')
   ORDER BY (code LIKE '5401%') DESC, (name ILIKE '%impuesto%') DESC, code LIMIT 1;
  SELECT id INTO v_acc_payable FROM public.accounting_accounts
   WHERE tenant_id=v_decl.tenant_id AND type='liability'
   ORDER BY (code LIKE '2110%') DESC, (name ILIKE '%impuesto%') DESC, code LIMIT 1;

  IF v_acc_expense IS NULL OR v_acc_payable IS NULL THEN
    RAISE EXCEPTION 'Faltan cuentas de gasto de impuestos o pasivo por pagar en el plan contable';
  END IF;

  v_entry_no := 'TAX-' || to_char(now(), 'YYYYMMDDHH24MISS');

  INSERT INTO public.journal_entries (tenant_id, date, entry_number, description, status, period_id, reference_type, reference_id)
  VALUES (v_decl.tenant_id, CURRENT_DATE, v_entry_no,
          'Declaración fiscal ' || v_decl.declaration_type || ' ' || v_decl.period_label,
          'posted', v_decl.period_id, 'tax_declaration', v_decl.id)
  RETURNING id INTO v_je_id;

  INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description)
  VALUES
    (v_je_id, v_acc_expense, v_decl.tax_due, 0, 'Impuesto devengado'),
    (v_je_id, v_acc_payable, 0, v_decl.tax_due, 'Impuesto por pagar');

  UPDATE public.cu_tax_declarations SET status='submitted', submitted_at=now() WHERE id=p_declaration_id;
  PERFORM public.rebuild_general_ledger(v_decl.tenant_id, v_decl.period_id);

  RETURN jsonb_build_object('ok', true, 'journal_entry_id', v_je_id);
END;
$function$;

-- 5. Real, on-screen accounting reports computed from posted journal entries
CREATE OR REPLACE FUNCTION public.report_trial_balance(p_tenant uuid, p_from date, p_to date)
RETURNS TABLE(code text, name text, type text, nature text, debit numeric, credit numeric, balance numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT a.code, a.name, a.type, a.nature,
         COALESCE(SUM(l.debit),0), COALESCE(SUM(l.credit),0),
         CASE WHEN a.nature = 'credit' THEN COALESCE(SUM(l.credit),0) - COALESCE(SUM(l.debit),0)
              ELSE COALESCE(SUM(l.debit),0) - COALESCE(SUM(l.credit),0) END
    FROM public.accounting_accounts a
    JOIN public.journal_entry_lines l ON l.account_id = a.id
    JOIN public.journal_entries je ON je.id = l.entry_id
   WHERE a.tenant_id = p_tenant AND je.tenant_id = p_tenant AND je.status = 'posted'
     AND je.date BETWEEN p_from AND p_to
     AND (public.is_superadmin(auth.uid()) OR public.is_tenant_member(p_tenant))
   GROUP BY a.code, a.name, a.type, a.nature
  HAVING COALESCE(SUM(l.debit),0) <> 0 OR COALESCE(SUM(l.credit),0) <> 0
   ORDER BY a.code;
$$;

CREATE OR REPLACE FUNCTION public.report_income_statement(p_tenant uuid, p_from date, p_to date)
RETURNS TABLE(section text, code text, name text, amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE WHEN a.type = 'income' THEN 'income' ELSE 'expense' END,
         a.code, a.name,
         CASE WHEN a.type = 'income' THEN COALESCE(SUM(l.credit),0) - COALESCE(SUM(l.debit),0)
              ELSE COALESCE(SUM(l.debit),0) - COALESCE(SUM(l.credit),0) END
    FROM public.accounting_accounts a
    JOIN public.journal_entry_lines l ON l.account_id = a.id
    JOIN public.journal_entries je ON je.id = l.entry_id
   WHERE a.tenant_id = p_tenant AND je.status = 'posted'
     AND a.type IN ('income','expense','cost')
     AND je.date BETWEEN p_from AND p_to
     AND (public.is_superadmin(auth.uid()) OR public.is_tenant_member(p_tenant))
   GROUP BY a.type, a.code, a.name
  HAVING COALESCE(SUM(l.debit),0) <> 0 OR COALESCE(SUM(l.credit),0) <> 0
   ORDER BY 1 DESC, a.code;
$$;

CREATE OR REPLACE FUNCTION public.report_balance_sheet(p_tenant uuid, p_to date)
RETURNS TABLE(section text, code text, name text, amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT a.type, a.code, a.name,
         CASE WHEN a.type IN ('liability','equity') THEN COALESCE(SUM(l.credit),0) - COALESCE(SUM(l.debit),0)
              ELSE COALESCE(SUM(l.debit),0) - COALESCE(SUM(l.credit),0) END
    FROM public.accounting_accounts a
    JOIN public.journal_entry_lines l ON l.account_id = a.id
    JOIN public.journal_entries je ON je.id = l.entry_id
   WHERE a.tenant_id = p_tenant AND je.status = 'posted'
     AND a.type IN ('asset','liability','equity')
     AND je.date <= p_to
     AND (public.is_superadmin(auth.uid()) OR public.is_tenant_member(p_tenant))
   GROUP BY a.type, a.code, a.name
  HAVING COALESCE(SUM(l.debit),0) <> 0 OR COALESCE(SUM(l.credit),0) <> 0
   ORDER BY a.type, a.code;
$$;

CREATE OR REPLACE FUNCTION public.report_journal(p_tenant uuid, p_from date, p_to date)
RETURNS TABLE(entry_id uuid, entry_number text, entry_date date, entry_description text,
              code text, name text, debit numeric, credit numeric, line_description text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT je.id, je.entry_number, je.date, je.description,
         a.code, a.name, l.debit, l.credit, l.description
    FROM public.journal_entries je
    JOIN public.journal_entry_lines l ON l.entry_id = je.id
    JOIN public.accounting_accounts a ON a.id = l.account_id
   WHERE je.tenant_id = p_tenant AND je.status = 'posted'
     AND je.date BETWEEN p_from AND p_to
     AND (public.is_superadmin(auth.uid()) OR public.is_tenant_member(p_tenant))
   ORDER BY je.date, je.entry_number, a.code;
$$;

CREATE OR REPLACE FUNCTION public.report_general_ledger(p_tenant uuid, p_from date, p_to date)
RETURNS TABLE(code text, name text, entry_date date, entry_number text, description text,
              debit numeric, credit numeric, running_balance numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT a.code, a.name, je.date, je.entry_number, COALESCE(l.description, je.description),
         l.debit, l.credit,
         SUM(CASE WHEN a.nature = 'credit' THEN l.credit - l.debit ELSE l.debit - l.credit END)
           OVER (PARTITION BY a.id ORDER BY je.date, je.entry_number, l.id
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
    FROM public.journal_entries je
    JOIN public.journal_entry_lines l ON l.entry_id = je.id
    JOIN public.accounting_accounts a ON a.id = l.account_id
   WHERE je.tenant_id = p_tenant AND je.status = 'posted'
     AND je.date BETWEEN p_from AND p_to
     AND (public.is_superadmin(auth.uid()) OR public.is_tenant_member(p_tenant))
   ORDER BY a.code, je.date, je.entry_number;
$$;

GRANT EXECUTE ON FUNCTION public.report_trial_balance(uuid,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_income_statement(uuid,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_balance_sheet(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_journal(uuid,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_general_ledger(uuid,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_tax_declaration(uuid,uuid,text,numeric) TO authenticated;

-- 6. Resync the general ledger for every tenant with accounting data
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT tenant_id FROM public.journal_entries LOOP
    PERFORM public.rebuild_general_ledger_all(r.tenant_id);
  END LOOP;
END $$;