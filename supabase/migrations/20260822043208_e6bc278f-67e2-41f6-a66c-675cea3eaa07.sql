CREATE OR REPLACE FUNCTION public.close_shift_with_summary(p_shift_id uuid, p_declared_cash numeric, p_notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_summary jsonb;
  v_expected numeric;
  v_diff numeric;
  v_tenant uuid;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  SELECT tenant_id, status INTO v_tenant, v_status FROM sales_shifts WHERE id = p_shift_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Turno no encontrado'; END IF;
  IF NOT (public.is_tenant_member(v_tenant)
          OR (public.is_superadmin(auth.uid()) AND public.sa_active_tenant() = v_tenant)) THEN
    RAISE EXCEPTION 'No autorizado en este negocio';
  END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'El turno ya está cerrado'; END IF;
  IF p_declared_cash IS NULL OR p_declared_cash < 0 OR p_declared_cash >= 1e12 THEN
    RAISE EXCEPTION 'Efectivo declarado inválido';
  END IF;

  v_summary := public.calculate_shift_summary(p_shift_id);
  v_expected := (v_summary->>'expected_cash')::numeric;
  v_diff := p_declared_cash - v_expected;

  UPDATE sales_shifts SET
    status = 'closed',
    closed_at = now(),
    closing_cash = p_declared_cash,
    declared_cash = p_declared_cash,
    expected_cash = v_expected,
    cash_difference = v_diff,
    cash_in_total = (v_summary->>'cash_in')::numeric,
    cash_out_total = (v_summary->>'cash_out')::numeric,
    returns_total = (v_summary->>'returns_cash')::numeric,
    total_sales = (v_summary->>'total_sales')::numeric,
    total_transactions = (v_summary->>'transactions')::int,
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE id = p_shift_id;

  RETURN v_summary || jsonb_build_object('declared_cash', p_declared_cash, 'difference', v_diff);
END; $function$;

GRANT EXECUTE ON FUNCTION public.close_shift_with_summary(uuid, numeric, text) TO authenticated;