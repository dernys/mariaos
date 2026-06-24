
-- 1) Fix sale trigger to cover real statuses used by the system
CREATE OR REPLACE FUNCTION public.trg_post_sale_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('completed','paid','partial','pending') THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
      BEGIN
        PERFORM public.post_sale_journal_entry(NEW.id);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'post_sale_journal_entry failed for sale %: %', NEW.id, SQLERRM;
      END;
    END IF;
  END IF;
  RETURN NEW;
END; $function$;

-- 2) Fix purchase trigger to cover received/paid/partial statuses
CREATE OR REPLACE FUNCTION public.trg_post_purchase_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('received','paid','partial') THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
      BEGIN
        PERFORM public.post_purchase_journal_entry(NEW.id);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'post_purchase_journal_entry failed for purchase %: %', NEW.id, SQLERRM;
      END;
    END IF;
  END IF;
  RETURN NEW;
END; $function$;

-- Make sure purchase trigger also fires on INSERT
DROP TRIGGER IF EXISTS trg_post_purchase_journal ON public.purchases;
CREATE TRIGGER trg_post_purchase_journal
AFTER INSERT OR UPDATE ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.trg_post_purchase_journal();

-- 3) Backfill missing journal entries
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.sales
    WHERE status IN ('completed','paid','partial','pending')
      AND NOT EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.reference_type='sale' AND je.reference_id = sales.id)
  LOOP
    BEGIN PERFORM public.post_sale_journal_entry(r.id);
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'backfill sale % skipped: %', r.id, SQLERRM; END;
  END LOOP;

  FOR r IN
    SELECT id FROM public.purchases
    WHERE status IN ('received','paid','partial')
      AND NOT EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.reference_type='purchase' AND je.reference_id = purchases.id)
  LOOP
    BEGIN PERFORM public.post_purchase_journal_entry(r.id);
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'backfill purchase % skipped: %', r.id, SQLERRM; END;
  END LOOP;

  FOR r IN
    SELECT id FROM public.account_payments ap
    WHERE NOT EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.reference_type='payment' AND je.reference_id = ap.id)
  LOOP
    BEGIN PERFORM public.post_payment_journal_entry(r.id);
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'backfill payment % skipped: %', r.id, SQLERRM; END;
  END LOOP;
END $$;

-- 4) Accounting audit summary function for the FinancialKpiPanel and SmokeTestPanel
CREATE OR REPLACE FUNCTION public.accounting_audit_summary(p_tenant_id uuid)
RETURNS TABLE (
  sales_unposted bigint,
  purchases_unposted bigint,
  returns_unposted bigint,
  payrolls_unposted bigint,
  payments_unposted bigint,
  unbalanced_entries bigint,
  total_entries bigint,
  total_debit numeric,
  total_credit numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    (SELECT count(*) FROM sales s
      WHERE s.tenant_id = p_tenant_id
        AND s.status IN ('completed','paid','partial')
        AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_type='sale' AND je.reference_id = s.id)),
    (SELECT count(*) FROM purchases p
      WHERE p.tenant_id = p_tenant_id
        AND p.status IN ('received','paid','partial')
        AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_type='purchase' AND je.reference_id = p.id)),
    (SELECT count(*) FROM sale_returns sr
      WHERE sr.tenant_id = p_tenant_id
        AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_type='sale_return' AND je.reference_id = sr.id)),
    (SELECT count(*) FROM payroll_runs pr
      WHERE pr.tenant_id = p_tenant_id
        AND pr.status IN ('approved','paid')
        AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_type='payroll' AND je.reference_id = pr.id)),
    (SELECT count(*) FROM account_payments ap
      WHERE ap.tenant_id = p_tenant_id
        AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_type='payment' AND je.reference_id = ap.id)),
    (SELECT count(*) FROM journal_entries je
      WHERE je.tenant_id = p_tenant_id
        AND (SELECT coalesce(sum(debit),0) - coalesce(sum(credit),0)
             FROM journal_entry_lines WHERE entry_id = je.id) <> 0),
    (SELECT count(*) FROM journal_entries je WHERE je.tenant_id = p_tenant_id),
    (SELECT coalesce(sum(jel.debit),0)
       FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id = jel.entry_id
      WHERE je.tenant_id = p_tenant_id),
    (SELECT coalesce(sum(jel.credit),0)
       FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id = jel.entry_id
      WHERE je.tenant_id = p_tenant_id)
$$;

GRANT EXECUTE ON FUNCTION public.accounting_audit_summary(uuid) TO authenticated, service_role;
