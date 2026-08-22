CREATE OR REPLACE FUNCTION public.financial_exceptions_report(p_tenant uuid DEFAULT NULL)
RETURNS TABLE (
  code text, severity text, entity_type text, entity_id uuid,
  reference text, amount numeric, occurred_at timestamptz, detail text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid := COALESCE(p_tenant, public.sa_active_tenant());
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Negocio no resuelto'; END IF;
  PERFORM public.assert_tenant_access(v_tenant);

  RETURN QUERY
  SELECT 'journal_without_source','warning','journal_entries', je.id, je.entry_number, NULL::numeric, je.created_at,
         'Asiento posteado sin referencia a documento origen'
  FROM public.journal_entries je
  WHERE je.tenant_id = v_tenant AND je.status='posted'
    AND (je.reference_type IS NULL OR je.reference_id IS NULL)
    AND COALESCE(je.source_module,'') <> 'manual';

  RETURN QUERY
  SELECT 'sale_without_journal','critical','sales', s.id, s.ticket_number, s.total, s.created_at,
         'Venta completada sin asiento contable'
  FROM public.sales s
  WHERE s.tenant_id = v_tenant AND s.status = 'completed'
    AND NOT EXISTS (SELECT 1 FROM public.journal_entries je
                    WHERE je.tenant_id = s.tenant_id AND je.reference_id = s.id
                      AND je.reference_type LIKE 'sale%' AND je.status='posted');

  RETURN QUERY
  SELECT 'purchase_without_journal','critical','purchases', p.id, p.purchase_number, p.total, p.created_at,
         'Compra recibida sin asiento contable'
  FROM public.purchases p
  WHERE p.tenant_id = v_tenant AND p.status IN ('received','partial','paid')
    AND NOT EXISTS (SELECT 1 FROM public.journal_entries je
                    WHERE je.tenant_id = p.tenant_id AND je.reference_id = p.id
                      AND je.reference_type LIKE 'purchase%' AND je.status='posted');

  RETURN QUERY
  SELECT 'payment_pending_stale','warning','sale_payments', sp.id, sp.reference, sp.amount, sp.created_at,
         'Pago pendiente de confirmación con más de 3 días'
  FROM public.sale_payments sp
  JOIN public.sales s ON s.id = sp.sale_id
  WHERE s.tenant_id = v_tenant AND sp.status = 'pending' AND sp.created_at < now() - interval '3 days';

  RETURN QUERY
  SELECT 'payable_inconsistent','critical','accounts_payable', ap.id, ap.description, ap.amount, ap.created_at,
         format('Cobrado/pagado %s frente a importe %s', ap.amount_paid, ap.amount)
  FROM public.accounts_payable ap
  WHERE ap.tenant_id = v_tenant
    AND (ap.amount_paid > ap.amount + 0.01
         OR (ap.status = 'paid' AND ap.amount_paid < ap.amount - 0.01));

  RETURN QUERY
  SELECT 'sale_line_without_cost','warning','sale_items', si.id, s.ticket_number, si.total, si.created_at,
         'Línea de venta sin costo unitario: COGS incompleto'
  FROM public.sale_items si
  JOIN public.sales s ON s.id = si.sale_id
  WHERE s.tenant_id = v_tenant AND s.status='completed'
    AND (si.unit_cost IS NULL OR si.unit_cost = 0);

  RETURN QUERY
  SELECT 'cash_difference_unexplained','critical','sales_shifts', sh.id, sh.store_name, sh.cash_difference, sh.closed_at,
         'Diferencia de caja al cierre sin motivo documentado'
  FROM public.sales_shifts sh
  WHERE sh.tenant_id = v_tenant AND sh.status <> 'open'
    AND COALESCE(abs(sh.cash_difference),0) > 0.01
    AND COALESCE(btrim(sh.notes),'') = '';

  RETURN QUERY
  SELECT 'duplicate_document','critical','journal_entries', d.min_id, d.num, NULL::numeric, d.min_at,
         format('%s asientos comparten el número %s', d.n, d.num)
  FROM (
    SELECT je.entry_number AS num, count(*) AS n,
           min(je.id::text)::uuid AS min_id, min(je.created_at) AS min_at
    FROM public.journal_entries je
    WHERE je.tenant_id = v_tenant AND je.entry_number IS NOT NULL
    GROUP BY je.entry_number HAVING count(*) > 1
  ) d;

  RETURN QUERY
  SELECT 'duplicate_document','critical','invoices', d.min_id, d.num, NULL::numeric, d.min_at,
         format('%s facturas comparten serie/número %s', d.n, d.num)
  FROM (
    SELECT i.invoice_number AS num, count(*) AS n,
           min(i.id::text)::uuid AS min_id, min(i.created_at) AS min_at
    FROM public.invoices i
    WHERE i.tenant_id = v_tenant AND i.invoice_number IS NOT NULL
    GROUP BY i.series_code, i.invoice_number HAVING count(*) > 1
  ) d;

  RETURN QUERY
  SELECT 'journal_reversed','info','journal_entries', je.id, je.entry_number, NULL::numeric, je.created_at,
         'Asiento reversado: revise la causa de la corrección'
  FROM public.journal_entries je
  WHERE je.tenant_id = v_tenant AND (je.reverses IS NOT NULL OR je.reversed_by IS NOT NULL);

  RETURN QUERY
  SELECT 'period_reopened','warning','accounting_periods', al.entity_id, al.description, NULL::numeric, al.created_at,
         COALESCE(al.metadata->>'reason','Reapertura sin motivo registrado')
  FROM public.activity_log al
  WHERE al.tenant_id = v_tenant AND al.action = 'period_reopen';

  RETURN QUERY
  SELECT 'bank_unmatched','warning','bank_transactions', bt.id, bt.reference, bt.amount, bt.created_at,
         'Movimiento bancario sin conciliar con más de 7 días'
  FROM public.bank_transactions bt
  WHERE bt.tenant_id = v_tenant AND COALESCE(bt.status,'pending') IN ('pending','unmatched','mismatch')
    AND bt.transaction_date < current_date - 7;
END; $$;
REVOKE ALL ON FUNCTION public.financial_exceptions_report(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.financial_exceptions_report(uuid) TO authenticated;