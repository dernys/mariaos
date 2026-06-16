
DROP FUNCTION IF EXISTS public.close_accounting_period(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.close_fiscal_year(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.rebuild_general_ledger(uuid) CASCADE;

ALTER TABLE public.tax_rates ADD COLUMN IF NOT EXISTS code text;
CREATE UNIQUE INDEX IF NOT EXISTS tax_rates_tenant_code_uidx
  ON public.tax_rates (tenant_id, code) WHERE code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.apply_accounting_profile(p_tenant_id uuid, p_profile_code text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tmpl record;
  v_parent_id uuid;
  v_count int := 0;
  v_tax record;
BEGIN
  UPDATE public.tenants SET accounting_profile_code = p_profile_code WHERE id = p_tenant_id;

  FOR v_tmpl IN
    SELECT * FROM public.chart_account_templates
    WHERE profile_code = p_profile_code
    ORDER BY length(code), sort_order, code
  LOOP
    v_parent_id := NULL;
    IF v_tmpl.parent_code IS NOT NULL THEN
      SELECT id INTO v_parent_id FROM public.accounting_accounts
      WHERE tenant_id = p_tenant_id AND code = v_tmpl.parent_code;
    END IF;

    INSERT INTO public.accounting_accounts (tenant_id, code, name, type, nature, parent_id, is_active)
    VALUES (p_tenant_id, v_tmpl.code, v_tmpl.name, v_tmpl.type, v_tmpl.nature, v_parent_id, true)
    ON CONFLICT (tenant_id, code) DO UPDATE
      SET name = EXCLUDED.name, type = EXCLUDED.type, nature = EXCLUDED.nature;
    v_count := v_count + 1;
  END LOOP;

  FOR v_tax IN SELECT * FROM public.tax_templates WHERE profile_code = p_profile_code LOOP
    INSERT INTO public.tax_rates (tenant_id, code, name, rate, is_active)
    VALUES (p_tenant_id, v_tax.code, v_tax.name, v_tax.rate, true)
    ON CONFLICT (tenant_id, code) WHERE code IS NOT NULL DO NOTHING;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE TABLE IF NOT EXISTS public.general_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  period_id uuid NOT NULL REFERENCES public.accounting_periods(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounting_accounts(id) ON DELETE CASCADE,
  opening_balance numeric(18,2) NOT NULL DEFAULT 0,
  debit_total numeric(18,2) NOT NULL DEFAULT 0,
  credit_total numeric(18,2) NOT NULL DEFAULT 0,
  closing_balance numeric(18,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'CUP',
  rebuilt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, period_id, account_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.general_ledger TO authenticated;
GRANT ALL ON public.general_ledger TO service_role;

ALTER TABLE public.general_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gl_tenant_access" ON public.general_ledger;
CREATE POLICY "gl_tenant_access" ON public.general_ledger
  FOR ALL TO authenticated
  USING (
    tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS gl_tenant_period_idx ON public.general_ledger(tenant_id, period_id);
CREATE INDEX IF NOT EXISTS gl_account_idx ON public.general_ledger(account_id);

DROP TRIGGER IF EXISTS trg_general_ledger_updated_at ON public.general_ledger;
CREATE TRIGGER trg_general_ledger_updated_at
  BEFORE UPDATE ON public.general_ledger
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_general_ledger_audit ON public.general_ledger;
CREATE TRIGGER trg_general_ledger_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.general_ledger
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE OR REPLACE FUNCTION public.rebuild_general_ledger(p_period_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_count int := 0;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.accounting_periods WHERE id = p_period_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Periodo % no existe', p_period_id;
  END IF;

  DELETE FROM public.general_ledger WHERE period_id = p_period_id;

  INSERT INTO public.general_ledger (tenant_id, period_id, account_id, opening_balance, debit_total, credit_total, closing_balance)
  SELECT
    v_tenant,
    p_period_id,
    a.id,
    0::numeric,
    COALESCE(SUM(l.debit), 0),
    COALESCE(SUM(l.credit), 0),
    COALESCE(SUM(l.debit - l.credit), 0)
  FROM public.accounting_accounts a
  LEFT JOIN public.journal_entry_lines l ON l.account_id = a.id
  LEFT JOIN public.journal_entries j ON j.id = l.entry_id
    AND j.period_id = p_period_id
    AND COALESCE(j.status,'posted') = 'posted'
  WHERE a.tenant_id = v_tenant
  GROUP BY a.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_accounting_period(p_period_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_diff numeric;
BEGIN
  PERFORM public.rebuild_general_ledger(p_period_id);

  SELECT COALESCE(SUM(debit_total - credit_total), 0)
    INTO v_diff
    FROM public.general_ledger
   WHERE period_id = p_period_id;

  IF ABS(v_diff) > 0.01 THEN
    RAISE EXCEPTION 'Periodo no cuadrado: diferencia %', v_diff;
  END IF;

  UPDATE public.accounting_periods
     SET status = 'closed', closed_at = now()
   WHERE id = p_period_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_fiscal_year(p_fiscal_year_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_period record;
BEGIN
  FOR v_period IN
    SELECT id FROM public.accounting_periods
    WHERE fiscal_year_id = p_fiscal_year_id AND COALESCE(status,'open') <> 'closed'
  LOOP
    PERFORM public.close_accounting_period(v_period.id);
  END LOOP;

  UPDATE public.fiscal_years SET status = 'closed', closed_at = now()
   WHERE id = p_fiscal_year_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE VIEW public.v_trial_balance AS
SELECT gl.tenant_id, gl.period_id, a.code, a.name, a.type, a.nature,
       gl.opening_balance, gl.debit_total, gl.credit_total, gl.closing_balance
FROM public.general_ledger gl
JOIN public.accounting_accounts a ON a.id = gl.account_id;

CREATE OR REPLACE VIEW public.v_income_statement AS
SELECT gl.tenant_id, gl.period_id, a.type, a.code, a.name,
       CASE WHEN a.type = 'income' THEN gl.credit_total - gl.debit_total
            WHEN a.type = 'expense' THEN gl.debit_total - gl.credit_total
            ELSE 0 END AS amount
FROM public.general_ledger gl
JOIN public.accounting_accounts a ON a.id = gl.account_id
WHERE a.type IN ('income','expense');

CREATE OR REPLACE VIEW public.v_balance_sheet AS
SELECT gl.tenant_id, gl.period_id, a.type, a.code, a.name, gl.closing_balance
FROM public.general_ledger gl
JOIN public.accounting_accounts a ON a.id = gl.account_id
WHERE a.type IN ('asset','liability','equity');

CREATE OR REPLACE VIEW public.v_cash_flow AS
SELECT j.tenant_id, j.period_id, j.date AS entry_date, a.code, a.name,
       l.debit, l.credit, (l.debit - l.credit) AS net_change
FROM public.journal_entry_lines l
JOIN public.journal_entries j ON j.id = l.entry_id
JOIN public.accounting_accounts a ON a.id = l.account_id
WHERE a.code LIKE '110%';

CREATE OR REPLACE VIEW public.v_ar_aging AS
SELECT s.tenant_id, s.customer_id, c.name AS customer_name,
       s.id AS sale_id, s.ticket_number AS invoice_number, s.created_at AS invoice_date,
       s.total,
       COALESCE(s.total,0) - COALESCE(s.amount_paid,0) AS balance,
       GREATEST(0, EXTRACT(day FROM now() - s.created_at)::int) AS days_old
FROM public.sales s
LEFT JOIN public.customers c ON c.id = s.customer_id
WHERE COALESCE(s.amount_paid,0) < COALESCE(s.total,0);

CREATE OR REPLACE VIEW public.v_ap_aging AS
SELECT p.tenant_id, p.supplier_id, sup.name AS supplier_name,
       p.id AS purchase_id, p.invoice_number, p.created_at AS invoice_date,
       p.total,
       COALESCE(p.total,0) - COALESCE(p.amount_paid,0) AS balance,
       GREATEST(0, EXTRACT(day FROM now() - p.created_at)::int) AS days_old
FROM public.purchases p
LEFT JOIN public.suppliers sup ON sup.id = p.supplier_id
WHERE COALESCE(p.amount_paid,0) < COALESCE(p.total,0);

GRANT SELECT ON public.v_trial_balance, public.v_income_statement, public.v_balance_sheet,
                 public.v_cash_flow, public.v_ar_aging, public.v_ap_aging
  TO authenticated, service_role;
