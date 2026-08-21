-- ===== Cobros/pagos de cuentas: autorización + vínculo con el turno =====
CREATE OR REPLACE FUNCTION public.register_account_payment(
  p_party_type text, p_party_id uuid, p_amount numeric,
  p_method text DEFAULT 'cash', p_currency text DEFAULT 'CUP', p_exchange_rate numeric DEFAULT 1,
  p_reference_type text DEFAULT NULL, p_reference_id uuid DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tenant uuid; v_dir text; v_id uuid; v_fx numeric;
  v_shift uuid; v_store uuid;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Monto debe ser mayor a 0'; END IF;

  IF p_party_type = 'customer' THEN
    SELECT tenant_id INTO v_tenant FROM customers WHERE id = p_party_id; v_dir := 'in';
  ELSIF p_party_type = 'employee' THEN
    SELECT tenant_id INTO v_tenant FROM employees WHERE id = p_party_id; v_dir := 'in';
  ELSIF p_party_type = 'supplier' THEN
    SELECT tenant_id INTO v_tenant FROM suppliers WHERE id = p_party_id; v_dir := 'out';
  ELSE
    RAISE EXCEPTION 'party_type inválido';
  END IF;

  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Entidad no encontrada'; END IF;

  IF NOT (EXISTS (SELECT 1 FROM tenant_users WHERE user_id = auth.uid() AND tenant_id = v_tenant)
          OR (public.is_superadmin(auth.uid()) AND public.sa_active_tenant() = v_tenant)) THEN
    RAISE EXCEPTION 'No autorizado en este negocio';
  END IF;

  -- La tasa la fija la configuración del negocio
  SELECT exchange_rate INTO v_fx FROM currencies
   WHERE tenant_id = v_tenant AND code = COALESCE(p_currency,'CUP') AND is_active = true;
  v_fx := COALESCE(v_fx, p_exchange_rate, 1);

  SELECT r.shift_id, r.store_id INTO v_shift, v_store FROM public.resolve_open_shift(v_tenant) r;

  INSERT INTO account_payments (
    tenant_id, party_type, party_id, reference_type, reference_id,
    direction, method, currency, amount, amount_in_base, exchange_rate, notes, performed_by,
    shift_id, store_id
  ) VALUES (
    v_tenant, p_party_type, p_party_id, p_reference_type, p_reference_id,
    v_dir, COALESCE(p_method,'cash'), COALESCE(p_currency,'CUP'), p_amount,
    round(p_amount * v_fx, 2), v_fx, p_notes, auth.uid(), v_shift, v_store
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.register_account_payment(text,uuid,numeric,text,text,numeric,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_account_payment(text,uuid,numeric,text,text,numeric,text,uuid,text) TO authenticated;

-- ===== Resumen del turno: ventas vs cobros de deuda vs otros movimientos =====
CREATE OR REPLACE FUNCTION public.calculate_shift_summary(p_shift_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_shift record;
  v_cash_sales numeric := 0; v_card numeric := 0; v_transfer numeric := 0; v_other_pay numeric := 0;
  v_total_sales numeric := 0; v_credit numeric := 0; v_tx int := 0;
  v_in numeric := 0; v_out numeric := 0; v_returns numeric := 0; v_expected numeric := 0;
  v_by_cat jsonb := '[]'::jsonb;
  v_col_cash numeric := 0; v_col_other numeric := 0; v_col_total numeric := 0; v_col_count int := 0;
  v_pay_cash numeric := 0; v_pay_other numeric := 0; v_pay_total numeric := 0;
  v_collections jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_shift FROM public.sales_shifts WHERE id = p_shift_id;
  IF v_shift IS NULL THEN RAISE EXCEPTION 'Turno no encontrado'; END IF;
  IF NOT public.assert_tenant_access(v_shift.tenant_id) THEN
    RAISE EXCEPTION 'No autorizado en este negocio';
  END IF;

  SELECT COALESCE(SUM(sp.amount_in_base) FILTER (WHERE sp.method = 'cash'),0),
         COALESCE(SUM(sp.amount_in_base) FILTER (WHERE sp.method = 'card'),0),
         COALESCE(SUM(sp.amount_in_base) FILTER (WHERE sp.method IN ('transfer','qr')),0),
         COALESCE(SUM(sp.amount_in_base) FILTER (WHERE sp.method NOT IN ('cash','card','transfer','qr')),0)
    INTO v_cash_sales, v_card, v_transfer, v_other_pay
    FROM public.sale_payments sp JOIN public.sales s ON s.id = sp.sale_id
    WHERE s.shift_id = p_shift_id AND COALESCE(s.status,'') <> 'cancelled';

  SELECT COALESCE(SUM(total),0), COUNT(*), COALESCE(SUM(GREATEST(0, COALESCE(total,0) - COALESCE(amount_paid,0))),0)
    INTO v_total_sales, v_tx, v_credit
    FROM public.sales
    WHERE shift_id = p_shift_id AND COALESCE(status,'') <> 'cancelled';

  -- Cobros de deuda (NO son ventas nuevas) y pagos a proveedores del turno
  SELECT COALESCE(SUM(COALESCE(amount_in_base, amount)) FILTER (WHERE direction='in' AND method='cash'),0),
         COALESCE(SUM(COALESCE(amount_in_base, amount)) FILTER (WHERE direction='in' AND method<>'cash'),0),
         COALESCE(SUM(COALESCE(amount_in_base, amount)) FILTER (WHERE direction='in'),0),
         COUNT(*) FILTER (WHERE direction='in'),
         COALESCE(SUM(COALESCE(amount_in_base, amount)) FILTER (WHERE direction='out' AND method='cash'),0),
         COALESCE(SUM(COALESCE(amount_in_base, amount)) FILTER (WHERE direction='out' AND method<>'cash'),0),
         COALESCE(SUM(COALESCE(amount_in_base, amount)) FILTER (WHERE direction='out'),0)
    INTO v_col_cash, v_col_other, v_col_total, v_col_count, v_pay_cash, v_pay_other, v_pay_total
    FROM public.account_payments
    WHERE shift_id = p_shift_id AND COALESCE(reference_type,'') <> 'sale';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', ap.id, 'direction', ap.direction, 'party_type', ap.party_type,
           'party_name', COALESCE(c.name, e.name, s.name), 'method', ap.method,
           'currency', ap.currency, 'amount', ap.amount,
           'amount_in_base', COALESCE(ap.amount_in_base, ap.amount),
           'created_at', ap.created_at) ORDER BY ap.created_at DESC), '[]'::jsonb)
    INTO v_collections
    FROM public.account_payments ap
    LEFT JOIN public.customers c ON ap.party_type='customer' AND c.id = ap.party_id
    LEFT JOIN public.employees e ON ap.party_type='employee' AND e.id = ap.party_id
    LEFT JOIN public.suppliers s ON ap.party_type='supplier' AND s.id = ap.party_id
    WHERE ap.shift_id = p_shift_id AND COALESCE(ap.reference_type,'') <> 'sale';

  SELECT COALESCE(SUM(COALESCE(amount_in_base, amount)) FILTER (WHERE movement_type='in'),0),
         COALESCE(SUM(COALESCE(amount_in_base, amount)) FILTER (WHERE movement_type='out'),0)
    INTO v_in, v_out
    FROM public.shift_cash_movements WHERE shift_id = p_shift_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('category', category, 'movement_type', movement_type, 'total', total) ORDER BY total DESC), '[]'::jsonb)
    INTO v_by_cat
    FROM (
      SELECT category, movement_type, SUM(COALESCE(amount_in_base, amount)) AS total
      FROM public.shift_cash_movements WHERE shift_id = p_shift_id
      GROUP BY category, movement_type
    ) q;

  SELECT COALESCE(SUM(sr.total),0) INTO v_returns
    FROM public.sale_returns sr JOIN public.sales s ON s.id = sr.sale_id
    WHERE s.shift_id = p_shift_id AND sr.refund_method = 'cash';

  v_expected := COALESCE(v_shift.opening_cash,0) + v_cash_sales + v_col_cash + v_in
                - v_out - v_pay_cash - v_returns;

  RETURN jsonb_build_object(
    'opening_cash', COALESCE(v_shift.opening_cash,0),
    'cash_sales', v_cash_sales,
    'card_sales', v_card,
    'transfer_sales', v_transfer,
    'other_payments', v_other_pay,
    'total_sales', v_total_sales,
    'credit_sales', v_credit,
    'transactions', v_tx,
    'collections_cash', v_col_cash,
    'collections_other', v_col_other,
    'collections_total', v_col_total,
    'collections_count', v_col_count,
    'supplier_payments_cash', v_pay_cash,
    'supplier_payments_other', v_pay_other,
    'supplier_payments_total', v_pay_total,
    'collections', v_collections,
    'cash_in', v_in,
    'cash_out', v_out,
    'returns_cash', v_returns,
    'expected_cash', v_expected,
    'movements_by_category', v_by_cat
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.calculate_shift_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_shift_summary(uuid) TO authenticated;