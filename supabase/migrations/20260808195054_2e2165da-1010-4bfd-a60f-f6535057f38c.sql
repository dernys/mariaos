CREATE OR REPLACE FUNCTION public.calculate_shift_summary(p_shift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_shift record;
  v_cash_sales numeric := 0;
  v_card numeric := 0;
  v_transfer numeric := 0;
  v_other_pay numeric := 0;
  v_total_sales numeric := 0;
  v_credit numeric := 0;
  v_tx int := 0;
  v_in numeric := 0;
  v_out numeric := 0;
  v_returns numeric := 0;
  v_expected numeric := 0;
  v_by_cat jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_shift FROM public.sales_shifts WHERE id = p_shift_id;
  IF v_shift IS NULL THEN RAISE EXCEPTION 'Turno no encontrado'; END IF;

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

  v_expected := COALESCE(v_shift.opening_cash,0) + v_cash_sales + v_in - v_out - v_returns;

  RETURN jsonb_build_object(
    'opening_cash', COALESCE(v_shift.opening_cash,0),
    'cash_sales', v_cash_sales,
    'card_sales', v_card,
    'transfer_sales', v_transfer,
    'other_payments', v_other_pay,
    'total_sales', v_total_sales,
    'credit_sales', v_credit,
    'transactions', v_tx,
    'cash_in', v_in,
    'cash_out', v_out,
    'returns_cash', v_returns,
    'expected_cash', v_expected,
    'movements_by_category', v_by_cat
  );
END $function$;