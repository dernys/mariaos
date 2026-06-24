
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    (SELECT count(*) FROM sales s
      WHERE s.tenant_id = p_tenant_id AND s.status IN ('completed','paid','partial')
        AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_type='sale' AND je.reference_id = s.id)),
    (SELECT count(*) FROM purchases p
      WHERE p.tenant_id = p_tenant_id AND p.status IN ('received','paid','partial')
        AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_type='purchase' AND je.reference_id = p.id)),
    (SELECT count(*) FROM sale_returns sr
      WHERE sr.tenant_id = p_tenant_id
        AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_type='sale_return' AND je.reference_id = sr.id)),
    (SELECT count(*) FROM payroll_runs pr
      WHERE pr.tenant_id = p_tenant_id AND pr.status IN ('approved','paid')
        AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_type='payroll' AND je.reference_id = pr.id)),
    (SELECT count(*) FROM account_payments ap
      WHERE ap.tenant_id = p_tenant_id
        AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_type='payment' AND je.reference_id = ap.id)
        -- Exclude payments that belong to a sale/purchase whose entry already includes the cash leg
        AND NOT (
          ap.reference_type IN ('sale','purchase')
          AND EXISTS (
            SELECT 1 FROM journal_entries je2
            WHERE je2.reference_type = ap.reference_type
              AND je2.reference_id = ap.reference_id
              AND je2.created_at <= ap.created_at + interval '5 seconds'
          )
        )),
    (SELECT count(*) FROM journal_entries je
      WHERE je.tenant_id = p_tenant_id
        AND (SELECT coalesce(sum(debit),0) - coalesce(sum(credit),0)
             FROM journal_entry_lines WHERE entry_id = je.id) <> 0),
    (SELECT count(*) FROM journal_entries je WHERE je.tenant_id = p_tenant_id),
    (SELECT coalesce(sum(jel.debit),0)
       FROM journal_entry_lines jel JOIN journal_entries je ON je.id = jel.entry_id
      WHERE je.tenant_id = p_tenant_id),
    (SELECT coalesce(sum(jel.credit),0)
       FROM journal_entry_lines jel JOIN journal_entries je ON je.id = jel.entry_id
      WHERE je.tenant_id = p_tenant_id)
$$;
