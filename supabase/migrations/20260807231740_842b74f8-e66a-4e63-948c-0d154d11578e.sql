-- 1. Fix wrong natures (assets stored as credit, etc.)
UPDATE public.accounting_accounts
   SET nature = CASE WHEN type IN ('asset','expense','cost') THEN 'debit' ELSE 'credit' END,
       updated_at = now()
 WHERE nature <> CASE WHEN type IN ('asset','expense','cost') THEN 'debit' ELSE 'credit' END;

-- 2. Keep it consistent going forward
CREATE OR REPLACE FUNCTION public.enforce_account_nature()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.nature := CASE WHEN NEW.type IN ('asset','expense','cost') THEN 'debit' ELSE 'credit' END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_account_nature ON public.accounting_accounts;
CREATE TRIGGER trg_account_nature
BEFORE INSERT OR UPDATE OF type, nature ON public.accounting_accounts
FOR EACH ROW EXECUTE FUNCTION public.enforce_account_nature();

-- 3. Reports derive the balance sign from the account type
CREATE OR REPLACE FUNCTION public.report_trial_balance(p_tenant uuid, p_from date, p_to date)
RETURNS TABLE(code text, name text, type text, nature text, debit numeric, credit numeric, balance numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT a.code, a.name, a.type,
         CASE WHEN a.type IN ('asset','expense','cost') THEN 'debit' ELSE 'credit' END,
         COALESCE(SUM(l.debit),0), COALESCE(SUM(l.credit),0),
         CASE WHEN a.type IN ('asset','expense','cost')
              THEN COALESCE(SUM(l.debit),0) - COALESCE(SUM(l.credit),0)
              ELSE COALESCE(SUM(l.credit),0) - COALESCE(SUM(l.debit),0) END
    FROM public.accounting_accounts a
    JOIN public.journal_entry_lines l ON l.account_id = a.id
    JOIN public.journal_entries je ON je.id = l.entry_id
   WHERE a.tenant_id = p_tenant AND je.tenant_id = p_tenant AND je.status = 'posted'
     AND je.date BETWEEN p_from AND p_to
     AND (public.is_superadmin(auth.uid()) OR public.is_tenant_member(p_tenant))
   GROUP BY a.code, a.name, a.type
  HAVING COALESCE(SUM(l.debit),0) <> 0 OR COALESCE(SUM(l.credit),0) <> 0
   ORDER BY a.code;
$$;

CREATE OR REPLACE FUNCTION public.report_general_ledger(p_tenant uuid, p_from date, p_to date)
RETURNS TABLE(code text, name text, entry_date date, entry_number text, description text,
              debit numeric, credit numeric, running_balance numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT a.code, a.name, je.date, je.entry_number, COALESCE(l.description, je.description),
         l.debit, l.credit,
         SUM(CASE WHEN a.type IN ('asset','expense','cost') THEN l.debit - l.credit ELSE l.credit - l.debit END)
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

-- 4. Resync ledger balances after the nature fix
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT tenant_id FROM public.journal_entries LOOP
    PERFORM public.rebuild_general_ledger_all(r.tenant_id);
  END LOOP;
END $$;