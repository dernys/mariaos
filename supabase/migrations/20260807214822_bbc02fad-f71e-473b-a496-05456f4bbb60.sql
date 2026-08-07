CREATE OR REPLACE VIEW public.v_balance_sheet AS
SELECT gl.tenant_id, gl.period_id, a.type, a.code, a.name,
  gl.closing_balance,
  CASE WHEN a.type IN ('liability','equity') THEN -gl.closing_balance
       ELSE gl.closing_balance END AS presented_balance
FROM public.general_ledger gl
JOIN public.accounting_accounts a ON a.id = gl.account_id
WHERE a.type IN ('asset','liability','equity');
ALTER VIEW public.v_balance_sheet SET (security_invoker = on);