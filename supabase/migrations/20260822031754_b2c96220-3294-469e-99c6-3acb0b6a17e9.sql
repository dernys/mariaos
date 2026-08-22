
-- 1) Saldo inicial esperado de caja: proviene del último cierre de la tienda
CREATE OR REPLACE FUNCTION public.store_expected_opening_cash(p_store_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_prev numeric;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.stores WHERE id = p_store_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Tienda no encontrada'; END IF;
  IF NOT public.assert_tenant_access(v_tenant) THEN
    RAISE EXCEPTION 'No autorizado en este negocio';
  END IF;

  SELECT COALESCE(s.closing_cash, s.declared_cash, 0) INTO v_prev
  FROM public.sales_shifts s
  WHERE s.store_id = p_store_id AND s.status = 'closed' AND s.closed_at IS NOT NULL
  ORDER BY s.closed_at DESC
  LIMIT 1;

  RETURN COALESCE(v_prev, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.store_expected_opening_cash(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.store_expected_opening_cash(uuid) TO authenticated, service_role;

-- 2) open_shift: el fondo inicial se hereda del cierre anterior; toda diferencia queda auditada
CREATE OR REPLACE FUNCTION public.open_shift(
  _store_id uuid,
  _employee_id uuid,
  _opening_cash numeric DEFAULT NULL,
  _pin text DEFAULT NULL,
  _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant UUID;
  _store_name TEXT;
  _emp_user UUID;
  _emp_name TEXT;
  _shift_id UUID;
  _prev_close numeric := 0;
  _declared numeric;
  _final numeric;
  _diff numeric := 0;
  _has_prev boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT tenant_id, name INTO _tenant, _store_name FROM public.stores WHERE id = _store_id;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'Store not found'; END IF;

  IF EXISTS (SELECT 1 FROM public.sales_shifts WHERE store_id = _store_id AND status = 'open') THEN
    RAISE EXCEPTION 'This store already has an open shift';
  END IF;

  SELECT user_id, name INTO _emp_user, _emp_name FROM public.employees WHERE id = _employee_id;
  IF _emp_name IS NULL THEN RAISE EXCEPTION 'Employee not found'; END IF;

  IF _emp_user IS DISTINCT FROM auth.uid() THEN
    IF _pin IS NULL OR NOT public.verify_employee_pin(_employee_id, _pin) THEN
      RAISE EXCEPTION 'Worker PIN required or invalid';
    END IF;
  END IF;

  SELECT COALESCE(s.closing_cash, s.declared_cash, 0), true INTO _prev_close, _has_prev
  FROM public.sales_shifts s
  WHERE s.store_id = _store_id AND s.status = 'closed' AND s.closed_at IS NOT NULL
  ORDER BY s.closed_at DESC
  LIMIT 1;

  _declared := COALESCE(_opening_cash, 0);
  IF _declared < 0 THEN RAISE EXCEPTION 'El fondo inicial no puede ser negativo'; END IF;

  -- El saldo inicial se hereda del cierre anterior; el importe declarado solo puede
  -- diferir de forma explícita y auditada (arqueo/recuento del fondo).
  IF COALESCE(_has_prev, false) THEN
    _final := _declared;
    _diff := _declared - COALESCE(_prev_close, 0);
  ELSE
    _final := _declared;
    _diff := 0;
  END IF;

  INSERT INTO public.sales_shifts(
    tenant_id, user_id, employee_id, store_id, store_name,
    opening_cash, status, opened_at, notes
  ) VALUES (
    _tenant, auth.uid(), _employee_id, _store_id, _store_name,
    _final, 'open', now(), _notes
  ) RETURNING id INTO _shift_id;

  INSERT INTO public.activity_log(tenant_id, entity_type, entity_id, action, description, metadata, performed_by)
  VALUES (
    _tenant, 'sales_shift', _shift_id, 'opened',
    format('Turno abierto en %s por %s (trabajador: %s). Fondo inicial %s (cierre anterior %s%s)',
           _store_name,
           COALESCE((SELECT full_name FROM profiles WHERE user_id = auth.uid()), 'usuario'),
           _emp_name, _final::text, COALESCE(_prev_close,0)::text,
           CASE WHEN abs(_diff) > 0.005 THEN format(', diferencia %s', _diff::text) ELSE '' END),
    jsonb_build_object(
      'store_id', _store_id, 'store_name', _store_name,
      'opened_by_user', auth.uid(), 'worker_employee', _employee_id,
      'worker_is_opener', (_emp_user = auth.uid()),
      'opening_cash', _final,
      'previous_closing_cash', COALESCE(_prev_close, 0),
      'opening_difference', _diff,
      'has_previous_close', COALESCE(_has_prev, false)
    ),
    auth.uid()
  );

  RETURN _shift_id;
END;
$$;

REVOKE ALL ON FUNCTION public.open_shift(uuid, uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_shift(uuid, uuid, numeric, text, text) TO authenticated, service_role;

-- 3) Resumen financiero del día (negocio / tienda / turno)
CREATE OR REPLACE FUNCTION public.daily_financial_summary(
  p_tenant uuid,
  p_from date,
  p_to date,
  p_store uuid DEFAULT NULL,
  p_shift uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz := p_from::timestamptz;
  v_to timestamptz := (p_to + 1)::timestamptz;
  v_opening numeric := 0;
  v_net_sales numeric := 0; v_tax numeric := 0; v_gross_sales numeric := 0; v_tx int := 0;
  v_cogs numeric := 0;
  v_returns numeric := 0; v_returns_cash numeric := 0;
  v_cash numeric := 0; v_bank numeric := 0; v_digital_pending numeric := 0; v_credit numeric := 0;
  v_col_cash numeric := 0; v_col_total numeric := 0;
  v_pay_cash numeric := 0; v_pay_total numeric := 0;
  v_in numeric := 0; v_out numeric := 0; v_expense_cash numeric := 0;
  v_expenses numeric := 0; v_other_income numeric := 0;
  v_ar numeric := 0; v_ap numeric := 0;
  v_banks jsonb := '[]'::jsonb;
  v_shift_ids uuid[];
BEGIN
  IF NOT public.assert_tenant_access(p_tenant) THEN
    RAISE EXCEPTION 'No autorizado en este negocio';
  END IF;

  SELECT array_agg(s.id) INTO v_shift_ids
  FROM public.sales_shifts s
  WHERE s.tenant_id = p_tenant
    AND (p_store IS NULL OR s.store_id = p_store)
    AND (p_shift IS NULL OR s.id = p_shift)
    AND s.opened_at < v_to
    AND (p_shift IS NOT NULL OR s.opened_at >= v_from);

  -- Saldo inicial de caja (fondo), NO es ganancia
  SELECT COALESCE(SUM(s.opening_cash), 0) INTO v_opening
  FROM public.sales_shifts s
  WHERE s.id = ANY(COALESCE(v_shift_ids, ARRAY[]::uuid[]));

  -- Ventas del ámbito
  SELECT COALESCE(SUM(COALESCE(s.subtotal, s.total - COALESCE(s.tax,0))),0),
         COALESCE(SUM(COALESCE(s.tax,0)),0),
         COALESCE(SUM(s.total),0),
         COUNT(*),
         COALESCE(SUM(GREATEST(0, COALESCE(s.total,0) - COALESCE(s.amount_paid,0))),0)
    INTO v_net_sales, v_tax, v_gross_sales, v_tx, v_credit
  FROM public.sales s
  WHERE s.tenant_id = p_tenant
    AND COALESCE(s.status,'') <> 'cancelled'
    AND (p_shift IS NULL OR s.shift_id = p_shift)
    AND (p_store IS NULL OR s.store_id = p_store)
    AND (p_shift IS NOT NULL OR (s.created_at >= v_from AND s.created_at < v_to));

  -- Cobros de venta por clase de medio
  SELECT COALESCE(SUM(sp.amount_in_base) FILTER (WHERE sp.status='PAID' AND public.payment_method_class(sp.method)='cash'),0),
         COALESCE(SUM(sp.amount_in_base) FILTER (WHERE sp.status='PAID' AND public.payment_method_class(sp.method) IN ('bank','digital')),0),
         COALESCE(SUM(sp.amount_in_base) FILTER (WHERE sp.status IN ('PENDING','CREATED')),0)
    INTO v_cash, v_bank, v_digital_pending
  FROM public.sale_payments sp
  JOIN public.sales s ON s.id = sp.sale_id
  WHERE s.tenant_id = p_tenant
    AND COALESCE(s.status,'') <> 'cancelled'
    AND (p_shift IS NULL OR s.shift_id = p_shift)
    AND (p_store IS NULL OR s.store_id = p_store)
    AND (p_shift IS NOT NULL OR (s.created_at >= v_from AND s.created_at < v_to));

  -- Costo de ventas: derivado del libro (cuentas de costo) de los asientos de esas ventas
  SELECT COALESCE(SUM(l.debit - l.credit), 0) INTO v_cogs
  FROM public.journal_entry_lines l
  JOIN public.journal_entries e ON e.id = l.entry_id
  JOIN public.accounting_accounts a ON a.id = l.account_id
  JOIN public.sales s ON s.id = e.reference_id
  WHERE e.tenant_id = p_tenant
    AND e.status = 'posted'
    AND e.reference_type = 'sale'
    AND a.type = 'cost'
    AND (p_shift IS NULL OR s.shift_id = p_shift)
    AND (p_store IS NULL OR s.store_id = p_store)
    AND (p_shift IS NOT NULL OR (s.created_at >= v_from AND s.created_at < v_to));

  -- Devoluciones
  SELECT COALESCE(SUM(sr.total),0),
         COALESCE(SUM(sr.total) FILTER (WHERE public.payment_method_class(sr.refund_method)='cash'),0)
    INTO v_returns, v_returns_cash
  FROM public.sale_returns sr
  JOIN public.sales s ON s.id = sr.sale_id
  WHERE sr.tenant_id = p_tenant
    AND (p_shift IS NULL OR s.shift_id = p_shift)
    AND (p_store IS NULL OR s.store_id = p_store)
    AND (p_shift IS NOT NULL OR (sr.created_at >= v_from AND sr.created_at < v_to));

  -- Cobros de CxC y pagos de CxP (fuera de la venta directa)
  SELECT COALESCE(SUM(COALESCE(ap.amount_in_base, ap.amount)) FILTER (WHERE ap.direction='in' AND public.payment_method_class(ap.method)='cash'),0),
         COALESCE(SUM(COALESCE(ap.amount_in_base, ap.amount)) FILTER (WHERE ap.direction='in'),0),
         COALESCE(SUM(COALESCE(ap.amount_in_base, ap.amount)) FILTER (WHERE ap.direction='out' AND public.payment_method_class(ap.method)='cash'),0),
         COALESCE(SUM(COALESCE(ap.amount_in_base, ap.amount)) FILTER (WHERE ap.direction='out'),0)
    INTO v_col_cash, v_col_total, v_pay_cash, v_pay_total
  FROM public.account_payments ap
  WHERE ap.tenant_id = p_tenant
    AND COALESCE(ap.reference_type,'') <> 'sale'
    AND (p_shift IS NULL OR ap.shift_id = p_shift)
    AND (p_store IS NULL OR ap.store_id = p_store OR ap.shift_id = ANY(COALESCE(v_shift_ids, ARRAY[]::uuid[])))
    AND (p_shift IS NOT NULL OR (ap.created_at >= v_from AND ap.created_at < v_to));

  -- Entradas / salidas de caja del turno
  SELECT COALESCE(SUM(COALESCE(m.amount_in_base, m.amount)) FILTER (WHERE m.movement_type='in'),0),
         COALESCE(SUM(COALESCE(m.amount_in_base, m.amount)) FILTER (WHERE m.movement_type='out'),0),
         COALESCE(SUM(COALESCE(m.amount_in_base, m.amount)) FILTER (WHERE m.movement_type='out' AND m.category='expense'),0)
    INTO v_in, v_out, v_expense_cash
  FROM public.shift_cash_movements m
  WHERE m.tenant_id = p_tenant
    AND (CASE WHEN p_shift IS NOT NULL THEN m.shift_id = p_shift
              ELSE m.shift_id = ANY(COALESCE(v_shift_ids, ARRAY[]::uuid[]))
                   AND m.created_at >= v_from AND m.created_at < v_to END);

  -- Gastos y otros ingresos contabilizados en el período (libro mayor, ámbito negocio)
  SELECT COALESCE(SUM(l.debit - l.credit) FILTER (WHERE a.type='expense'),0),
         COALESCE(SUM(l.credit - l.debit) FILTER (WHERE a.type='income' AND COALESCE(e.reference_type,'') <> 'sale'),0)
    INTO v_expenses, v_other_income
  FROM public.journal_entry_lines l
  JOIN public.journal_entries e ON e.id = l.entry_id
  JOIN public.accounting_accounts a ON a.id = l.account_id
  WHERE e.tenant_id = p_tenant
    AND e.status = 'posted'
    AND e.date >= p_from AND e.date <= p_to;

  -- Saldos vivos de CxC / CxP
  SELECT COALESCE(SUM(GREATEST(0, COALESCE(s.total,0) - COALESCE(s.amount_paid,0))),0) INTO v_ar
  FROM public.sales s
  WHERE s.tenant_id = p_tenant AND COALESCE(s.status,'') <> 'cancelled';

  SELECT COALESCE(SUM(GREATEST(0, COALESCE(ap.amount,0) - COALESCE(ap.amount_paid,0))),0) INTO v_ap
  FROM public.accounts_payable ap
  WHERE ap.tenant_id = p_tenant AND COALESCE(ap.status,'') <> 'cancelled';

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'bank_name', b.bank_name,
                                               'currency', b.currency, 'balance', COALESCE(b.current_balance,0))
                            ORDER BY b.name), '[]'::jsonb)
    INTO v_banks
  FROM public.bank_accounts b
  WHERE b.tenant_id = p_tenant AND COALESCE(b.is_active, true);

  RETURN jsonb_build_object(
    'scope', jsonb_build_object('tenant_id', p_tenant, 'from', p_from, 'to', p_to,
                                'store_id', p_store, 'shift_id', p_shift,
                                'shifts', COALESCE(array_length(v_shift_ids,1), 0)),
    'opening_cash', round(v_opening, 2),
    'net_sales', round(v_net_sales, 2),
    'tax', round(v_tax, 2),
    'gross_sales', round(v_gross_sales, 2),
    'transactions', v_tx,
    'cogs', round(v_cogs, 2),
    'gross_profit', round(v_net_sales - v_cogs, 2),
    'expenses', round(v_expenses, 2),
    'expenses_cash', round(v_expense_cash, 2),
    'other_income', round(v_other_income, 2),
    'operating_result', round(v_net_sales - v_cogs - v_expenses + v_other_income, 2),
    'returns_total', round(v_returns, 2),
    'returns_cash', round(v_returns_cash, 2),
    'cash_sales', round(v_cash, 2),
    'bank_sales', round(v_bank, 2),
    'digital_pending', round(v_digital_pending, 2),
    'credit_sales', round(v_credit, 2),
    'ar_collections_cash', round(v_col_cash, 2),
    'ar_collections_total', round(v_col_total, 2),
    'ap_payments_cash', round(v_pay_cash, 2),
    'ap_payments_total', round(v_pay_total, 2),
    'cash_in', round(v_in, 2),
    'cash_out', round(v_out, 2),
    'expected_cash', round(v_opening + v_cash + v_col_cash + v_in - v_out - v_pay_cash - v_returns_cash, 2),
    'ar_balance', round(v_ar, 2),
    'ap_balance', round(v_ap, 2),
    'bank_accounts', v_banks
  );
END;
$$;

REVOKE ALL ON FUNCTION public.daily_financial_summary(uuid, date, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.daily_financial_summary(uuid, date, date, uuid, uuid) TO authenticated, service_role;
