
CREATE OR REPLACE FUNCTION public.bootstrap_tenant_accounting(p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_profile text; v_year int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  v_fy_id uuid; v_inserted int := 0; m int;
BEGIN
  SELECT accounting_profile_code INTO v_profile FROM public.tenants WHERE id=p_tenant;
  IF v_profile IS NULL THEN RETURN jsonb_build_object('error','sin perfil'); END IF;

  INSERT INTO public.accounting_accounts (tenant_id, code, name, type, nature, is_postable, plan_template)
  SELECT p_tenant, t.code, t.name, t.type, t.nature, NOT t.is_header, v_profile
    FROM public.chart_account_templates t
   WHERE t.profile_code=v_profile
     AND NOT EXISTS (SELECT 1 FROM public.accounting_accounts a WHERE a.tenant_id=p_tenant AND a.code=t.code);
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Resolver parent_id por código (subquery escalar evita conflicto FROM/target)
  UPDATE public.accounting_accounts a
     SET parent_id = (
       SELECT p.id FROM public.accounting_accounts p
        WHERE p.tenant_id = a.tenant_id
          AND p.code = (
            SELECT t.parent_code FROM public.chart_account_templates t
             WHERE t.profile_code = v_profile AND t.code = a.code
          )
        LIMIT 1
     )
   WHERE a.tenant_id = p_tenant
     AND a.parent_id IS NULL
     AND EXISTS (
       SELECT 1 FROM public.chart_account_templates t
        WHERE t.profile_code = v_profile AND t.code = a.code AND t.parent_code IS NOT NULL
     );

  INSERT INTO public.fiscal_years (tenant_id, year, name, start_date, end_date, status, is_current)
  VALUES (p_tenant, v_year, v_year::text, make_date(v_year,1,1), make_date(v_year,12,31), 'open', true)
  ON CONFLICT (tenant_id, year) DO UPDATE SET is_current=true
  RETURNING id INTO v_fy_id;

  IF v_fy_id IS NULL THEN
    SELECT id INTO v_fy_id FROM public.fiscal_years WHERE tenant_id=p_tenant AND year=v_year;
  END IF;

  FOR m IN 1..12 LOOP
    INSERT INTO public.accounting_periods (tenant_id, fiscal_year_id, period_number, name, start_date, end_date, status)
    VALUES (p_tenant, v_fy_id, m, to_char(make_date(v_year,m,1),'YYYY-MM'),
            make_date(v_year,m,1), (make_date(v_year,m,1)+INTERVAL '1 month - 1 day')::date, 'open')
    ON CONFLICT (fiscal_year_id, period_number) DO NOTHING;
  END LOOP;

  PERFORM public.ensure_default_accounts(p_tenant);
  RETURN jsonb_build_object('profile',v_profile,'accounts_inserted',v_inserted,'fiscal_year_id',v_fy_id);
END; $$;

GRANT EXECUTE ON FUNCTION public.bootstrap_tenant_accounting(uuid) TO authenticated, service_role;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id FROM public.tenants WHERE accounting_profile_code IS NOT NULL LOOP
    PERFORM public.bootstrap_tenant_accounting(r.id);
  END LOOP;
END $$;

DELETE FROM public.journal_entries WHERE id='78518514-505e-432e-a17b-4fc293bec049';

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT s.id FROM public.sales s
     WHERE s.status IN ('completed','paid','partial')
       AND NOT EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.reference_type='sale' AND j.reference_id=s.id)
  LOOP
    BEGIN PERFORM public.post_sale_journal_entry(r.id);
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'sale % : %', r.id, SQLERRM; END;
  END LOOP;
END $$;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT p.id FROM public.purchases p
     WHERE p.status='received'
       AND NOT EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.reference_type='purchase' AND j.reference_id=p.id)
  LOOP
    BEGIN PERFORM public.post_purchase_journal_entry(r.id);
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'purchase % : %', r.id, SQLERRM; END;
  END LOOP;
END $$;
