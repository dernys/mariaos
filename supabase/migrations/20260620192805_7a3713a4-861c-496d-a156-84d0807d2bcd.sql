
DROP FUNCTION IF EXISTS public.close_accounting_period(uuid);

CREATE OR REPLACE FUNCTION public.resolve_period_id(p_tenant uuid, p_date date)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.accounting_periods
  WHERE tenant_id = p_tenant AND p_date BETWEEN start_date AND end_date
  ORDER BY period_number LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.resolve_fiscal_year_id(p_tenant uuid, p_date date)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.fiscal_years
  WHERE tenant_id = p_tenant AND p_date BETWEEN start_date AND end_date
  ORDER BY start_date LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.post_financial_event(p_event_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event public.financial_events%ROWTYPE;
  v_profile text; v_rule public.posting_rules%ROWTYPE;
  v_journal_id uuid; v_debit_acc uuid; v_credit_acc uuid;
  v_amount numeric; v_amount_base numeric; v_rules_found int := 0;
  v_period uuid; v_fy uuid; v_entry_num text;
BEGIN
  SELECT * INTO v_event FROM public.financial_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event % not found', p_event_id; END IF;
  IF v_event.status = 'posted' THEN RETURN v_event.posted_journal_id; END IF;

  SELECT accounting_profile_code INTO v_profile FROM public.tenants WHERE id = v_event.tenant_id;
  v_period := public.resolve_period_id(v_event.tenant_id, v_event.event_date);
  v_fy := public.resolve_fiscal_year_id(v_event.tenant_id, v_event.event_date);
  v_entry_num := 'AUTO-' || to_char(v_event.event_date,'YYYYMM') || '-' || substr(v_event.id::text,1,8);

  INSERT INTO public.journal_entries (
    tenant_id, date, description, reference_type, reference_id,
    status, created_by, period_id, fiscal_year_id, entry_number, posted_at
  ) VALUES (
    v_event.tenant_id, v_event.event_date,
    'Auto: ' || v_event.event_type || ' #' || substr(v_event.source_id::text,1,8),
    v_event.source_table, v_event.source_id, 'posted',
    v_event.created_by, v_period, v_fy, v_entry_num, now()
  ) RETURNING id INTO v_journal_id;

  FOR v_rule IN
    SELECT * FROM public.posting_rules
    WHERE event_type = v_event.event_type AND active = true
      AND (profile_code = v_profile OR profile_code IS NULL)
    ORDER BY (profile_code IS NULL), sequence
  LOOP
    v_rules_found := v_rules_found + 1;
    IF v_rule.amount_field = 'amount' THEN
      v_amount := v_event.amount; v_amount_base := v_event.amount_in_base;
    ELSE
      v_amount := COALESCE((v_event.payload ->> v_rule.amount_field)::numeric, 0);
      v_amount_base := v_amount * v_event.exchange_rate;
    END IF;
    IF v_amount = 0 THEN CONTINUE; END IF;
    v_debit_acc := public.resolve_account_id(v_event.tenant_id, v_rule.debit_account_code);
    v_credit_acc := public.resolve_account_id(v_event.tenant_id, v_rule.credit_account_code);
    IF v_debit_acc IS NULL OR v_credit_acc IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description)
      VALUES (v_journal_id, v_debit_acc, v_amount_base, 0, v_rule.description);
    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description)
      VALUES (v_journal_id, v_credit_acc, 0, v_amount_base, v_rule.description);
  END LOOP;

  IF v_rules_found = 0 THEN
    DELETE FROM public.journal_entries WHERE id = v_journal_id;
    UPDATE public.financial_events SET status='skipped', error='no posting rule', posted_at=now() WHERE id = p_event_id;
    RETURN NULL;
  END IF;

  UPDATE public.financial_events
    SET status='posted', posted_journal_id=v_journal_id, posted_at=now(), error=NULL
    WHERE id = p_event_id;
  RETURN v_journal_id;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.financial_events SET status='failed', error=SQLERRM WHERE id = p_event_id;
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_journal_assign_period()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL OR NEW.date IS NULL THEN RETURN NEW; END IF;
  IF NEW.period_id IS NULL THEN
    NEW.period_id := public.resolve_period_id(NEW.tenant_id, NEW.date);
  END IF;
  IF NEW.fiscal_year_id IS NULL THEN
    NEW.fiscal_year_id := public.resolve_fiscal_year_id(NEW.tenant_id, NEW.date);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_period_autofill ON public.journal_entries;
CREATE TRIGGER trg_journal_period_autofill
  BEFORE INSERT OR UPDATE OF date ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_journal_assign_period();

CREATE OR REPLACE FUNCTION public.rebuild_general_ledger(p_tenant uuid, p_period uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int := 0;
  v_period public.accounting_periods%ROWTYPE;
  v_prev_period uuid;
BEGIN
  SELECT * INTO v_period FROM public.accounting_periods
    WHERE id = p_period AND tenant_id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Período % no encontrado', p_period; END IF;

  SELECT id INTO v_prev_period FROM public.accounting_periods
    WHERE tenant_id = p_tenant
      AND fiscal_year_id = v_period.fiscal_year_id
      AND period_number = v_period.period_number - 1;

  DELETE FROM public.general_ledger WHERE tenant_id = p_tenant AND period_id = p_period;

  WITH agg AS (
    SELECT jel.account_id, SUM(jel.debit) AS d, SUM(jel.credit) AS c
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.entry_id
    WHERE je.tenant_id = p_tenant AND je.status = 'posted'
      AND je.date BETWEEN v_period.start_date AND v_period.end_date
    GROUP BY jel.account_id
  ),
  prev AS (
    SELECT account_id, closing_balance AS ob FROM public.general_ledger
    WHERE tenant_id = p_tenant AND period_id = v_prev_period
  ),
  joined AS (
    SELECT COALESCE(agg.account_id, prev.account_id) AS account_id,
           COALESCE(prev.ob, 0) AS opening_balance,
           COALESCE(agg.d, 0) AS debit_total,
           COALESCE(agg.c, 0) AS credit_total
    FROM agg FULL OUTER JOIN prev ON prev.account_id = agg.account_id
  )
  INSERT INTO public.general_ledger
    (tenant_id, period_id, account_id, opening_balance, debit_total, credit_total, closing_balance, currency)
  SELECT p_tenant, p_period, j.account_id,
         j.opening_balance, j.debit_total, j.credit_total,
         j.opening_balance + CASE WHEN a.nature='debit'
              THEN (j.debit_total - j.credit_total)
              ELSE (j.credit_total - j.debit_total) END,
         COALESCE(a.currency,'CUP')
  FROM joined j
  JOIN public.accounting_accounts a ON a.id = j.account_id
  WHERE j.debit_total <> 0 OR j.credit_total <> 0 OR j.opening_balance <> 0;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.rebuild_general_ledger_all(p_tenant uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_period uuid; v_total int := 0; v_n int;
BEGIN
  FOR v_period IN
    SELECT p.id FROM public.accounting_periods p
    WHERE p.tenant_id = p_tenant
    ORDER BY p.fiscal_year_id, p.period_number
  LOOP
    v_n := public.rebuild_general_ledger(p_tenant, v_period);
    v_total := v_total + v_n;
  END LOOP;
  RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_journal_line_touch_gl()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry_id uuid; v_tenant uuid; v_period uuid;
BEGIN
  v_entry_id := COALESCE(NEW.entry_id, OLD.entry_id);
  SELECT tenant_id, period_id INTO v_tenant, v_period
    FROM public.journal_entries WHERE id = v_entry_id;
  IF v_tenant IS NULL OR v_period IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  PERFORM public.rebuild_general_ledger(v_tenant, v_period);
  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'rebuild_general_ledger falló: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_jel_refresh_gl ON public.journal_entry_lines;
CREATE TRIGGER trg_jel_refresh_gl
  AFTER INSERT OR UPDATE OR DELETE ON public.journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_journal_line_touch_gl();

CREATE OR REPLACE FUNCTION public.close_accounting_period(p_period uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_period public.accounting_periods%ROWTYPE;
  v_drafts int; v_gl_count int;
BEGIN
  SELECT * INTO v_period FROM public.accounting_periods WHERE id = p_period;
  IF NOT FOUND THEN RAISE EXCEPTION 'Período no encontrado'; END IF;
  IF v_period.status <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_' || v_period.status);
  END IF;

  SELECT count(*) INTO v_drafts FROM public.journal_entries
    WHERE tenant_id = v_period.tenant_id AND status = 'draft'
      AND date BETWEEN v_period.start_date AND v_period.end_date;
  IF v_drafts > 0 THEN
    RAISE EXCEPTION 'No se puede cerrar: % asientos en borrador', v_drafts;
  END IF;

  v_gl_count := public.rebuild_general_ledger(v_period.tenant_id, p_period);

  UPDATE public.accounting_periods
    SET status = 'closed', closed_at = now(), closed_by = auth.uid()
    WHERE id = p_period;

  RETURN jsonb_build_object('ok', true, 'gl_rows', v_gl_count, 'period', v_period.name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_accounting_period(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_general_ledger(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_general_ledger_all(uuid) TO authenticated;

-- Backfill
UPDATE public.journal_entries je
SET period_id = public.resolve_period_id(je.tenant_id, je.date),
    fiscal_year_id = public.resolve_fiscal_year_id(je.tenant_id, je.date)
WHERE je.period_id IS NULL AND je.tenant_id IS NOT NULL;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT tenant_id FROM public.journal_entries WHERE tenant_id IS NOT NULL LOOP
    PERFORM public.rebuild_general_ledger_all(r.tenant_id);
  END LOOP;
END $$;
