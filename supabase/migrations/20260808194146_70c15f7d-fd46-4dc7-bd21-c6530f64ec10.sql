-- 1. Normalizar y enriquecer movimientos de caja del turno
ALTER TABLE public.shift_cash_movements
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS exchange_rate numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS amount_in_base numeric,
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;

UPDATE public.shift_cash_movements SET movement_type = 'in'  WHERE movement_type IN ('cash_in','IN','ingreso');
UPDATE public.shift_cash_movements SET movement_type = 'out' WHERE movement_type IN ('cash_out','OUT','egreso');
UPDATE public.shift_cash_movements SET amount_in_base = COALESCE(amount_in_base, amount * COALESCE(exchange_rate,1));

ALTER TABLE public.shift_cash_movements DROP CONSTRAINT IF EXISTS shift_cash_movements_type_chk;
ALTER TABLE public.shift_cash_movements
  ADD CONSTRAINT shift_cash_movements_type_chk CHECK (movement_type IN ('in','out'));
ALTER TABLE public.shift_cash_movements DROP CONSTRAINT IF EXISTS shift_cash_movements_amount_chk;
ALTER TABLE public.shift_cash_movements
  ADD CONSTRAINT shift_cash_movements_amount_chk CHECK (amount > 0);

CREATE INDEX IF NOT EXISTS idx_shift_cash_movements_shift ON public.shift_cash_movements(shift_id, created_at DESC);

-- 2. Resolver cuenta por tipo (fallback genérico para contrapartidas de caja)
CREATE OR REPLACE FUNCTION public.resolve_account_by_type(p_tenant uuid, p_type text, p_codes text[] DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid; v_pat text;
BEGIN
  IF p_codes IS NOT NULL THEN
    FOREACH v_pat IN ARRAY p_codes LOOP
      SELECT id INTO v_id FROM public.accounting_accounts
        WHERE tenant_id = p_tenant AND is_postable = true AND code LIKE v_pat || '%'
        ORDER BY length(code) DESC, code LIMIT 1;
      IF v_id IS NOT NULL THEN RETURN v_id; END IF;
    END LOOP;
  END IF;
  SELECT id INTO v_id FROM public.accounting_accounts
    WHERE tenant_id = p_tenant AND is_postable = true AND type = p_type
    ORDER BY length(code) DESC, code LIMIT 1;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.resolve_cash_counterpart(p_tenant uuid, p_category text)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN CASE p_category
    WHEN 'bank_deposit'       THEN public.resolve_account_by_role(p_tenant, 'bank')
    WHEN 'bank_withdrawal'    THEN public.resolve_account_by_role(p_tenant, 'bank')
    WHEN 'supplier_payment'   THEN public.resolve_account_by_role(p_tenant, 'payables')
    WHEN 'customer_collection' THEN public.resolve_account_by_role(p_tenant, 'receivables')
    WHEN 'expense'            THEN public.resolve_account_by_type(p_tenant, 'expense')
    WHEN 'owner_draw'         THEN public.resolve_account_by_type(p_tenant, 'equity')
    WHEN 'owner_contribution' THEN public.resolve_account_by_type(p_tenant, 'equity')
    WHEN 'other_income'       THEN public.resolve_account_by_type(p_tenant, 'income')
    ELSE COALESCE(public.resolve_account_by_type(p_tenant, 'expense'), public.resolve_account_by_type(p_tenant, 'equity'))
  END;
END $$;

-- 3. Registrar movimiento de caja con asiento contable real
CREATE OR REPLACE FUNCTION public.register_shift_cash_movement(
  p_shift_id uuid,
  p_movement_type text,
  p_amount numeric,
  p_category text DEFAULT 'other',
  p_reason text DEFAULT NULL,
  p_currency text DEFAULT 'CUP',
  p_exchange_rate numeric DEFAULT 1
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_shift record;
  v_summary jsonb;
  v_base numeric;
  v_acc_cash uuid;
  v_acc_other uuid;
  v_entry_id uuid;
  v_mov_id uuid;
BEGIN
  IF p_movement_type NOT IN ('in','out') THEN RAISE EXCEPTION 'Tipo de movimiento inválido'; END IF;
  IF COALESCE(p_amount,0) <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor que cero'; END IF;

  SELECT * INTO v_shift FROM public.sales_shifts WHERE id = p_shift_id FOR UPDATE;
  IF v_shift IS NULL THEN RAISE EXCEPTION 'Turno no encontrado'; END IF;
  IF NOT public.is_tenant_member(v_shift.tenant_id) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF v_shift.status <> 'open' OR v_shift.locked THEN RAISE EXCEPTION 'El turno está cerrado: no admite movimientos de caja'; END IF;

  v_base := ROUND(p_amount * COALESCE(NULLIF(p_exchange_rate,0),1), 2);

  IF p_movement_type = 'out' THEN
    v_summary := public.calculate_shift_summary(p_shift_id);
    IF COALESCE((v_summary->>'expected_cash')::numeric,0) < v_base - 0.01 THEN
      RAISE EXCEPTION 'Efectivo insuficiente en caja: disponible %', COALESCE((v_summary->>'expected_cash')::numeric,0);
    END IF;
  END IF;

  PERFORM public.ensure_default_accounts(v_shift.tenant_id);
  v_acc_cash  := public.resolve_account_by_role(v_shift.tenant_id, 'cash');
  v_acc_other := public.resolve_cash_counterpart(v_shift.tenant_id, p_category);

  IF v_acc_cash IS NOT NULL AND v_acc_other IS NOT NULL THEN
    INSERT INTO public.journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, status, created_by)
    VALUES (v_shift.tenant_id, 'CJ-'||substr(p_shift_id::text,1,8)||'-'||to_char(now(),'HH24MISS'), CURRENT_DATE,
            CASE WHEN p_movement_type = 'in' THEN 'Ingreso de caja' ELSE 'Egreso de caja' END
              ||' ('||p_category||')'||COALESCE(' · '||p_reason,''),
            'shift_cash_movement', p_shift_id, 'draft', auth.uid())
    RETURNING id INTO v_entry_id;

    IF p_movement_type = 'in' THEN
      INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description)
      VALUES (v_entry_id, v_acc_cash, v_base, 0, 'Entrada de efectivo'),
             (v_entry_id, v_acc_other, 0, v_base, COALESCE(p_reason, p_category));
    ELSE
      INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description)
      VALUES (v_entry_id, v_acc_other, v_base, 0, COALESCE(p_reason, p_category)),
             (v_entry_id, v_acc_cash, 0, v_base, 'Salida de efectivo');
    END IF;

    PERFORM public.post_journal_entry(v_entry_id);
  END IF;

  INSERT INTO public.shift_cash_movements
    (tenant_id, shift_id, movement_type, category, amount, currency, exchange_rate, amount_in_base, reason, performed_by, journal_entry_id)
  VALUES (v_shift.tenant_id, p_shift_id, p_movement_type, COALESCE(p_category,'other'), p_amount,
          COALESCE(p_currency,'CUP'), COALESCE(NULLIF(p_exchange_rate,0),1), v_base, p_reason, auth.uid(), v_entry_id)
  RETURNING id INTO v_mov_id;

  UPDATE public.sales_shifts SET
    cash_in_total  = COALESCE(cash_in_total,0)  + CASE WHEN p_movement_type='in'  THEN v_base ELSE 0 END,
    cash_out_total = COALESCE(cash_out_total,0) + CASE WHEN p_movement_type='out' THEN v_base ELSE 0 END,
    updated_at = now()
  WHERE id = p_shift_id;

  RETURN jsonb_build_object('movement_id', v_mov_id, 'journal_entry_id', v_entry_id, 'amount_in_base', v_base);
END $$;

-- 4. Resumen de turno enriquecido
CREATE OR REPLACE FUNCTION public.calculate_shift_summary(p_shift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
    WHERE s.shift_id = p_shift_id AND s.status <> 'cancelled';

  SELECT COALESCE(SUM(total),0), COUNT(*), COALESCE(SUM(GREATEST(0, COALESCE(total,0) - COALESCE(amount_paid,0))),0)
    INTO v_total_sales, v_tx, v_credit
    FROM public.sales WHERE shift_id = p_shift_id AND status IN ('paid','partial','pending');

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
END $$;

-- 5. Cierre Z: sin duplicar ventas, contabiliza faltante/sobrante
CREATE OR REPLACE FUNCTION public.close_shift_z(p_shift_id uuid, p_counted_cash numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_shift record;
  v_summary jsonb;
  v_expected numeric := 0;
  v_diff numeric := 0;
  v_entry_id uuid;
  v_acc_cash uuid; v_acc_loss uuid; v_acc_gain uuid;
BEGIN
  SELECT * INTO v_shift FROM public.sales_shifts WHERE id = p_shift_id FOR UPDATE;
  IF v_shift IS NULL THEN RAISE EXCEPTION 'Turno no encontrado'; END IF;
  IF NOT public.is_tenant_member(v_shift.tenant_id) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF v_shift.locked THEN RAISE EXCEPTION 'El turno ya está bloqueado por cierre Z'; END IF;

  v_summary := public.calculate_shift_summary(p_shift_id);
  v_expected := COALESCE((v_summary->>'expected_cash')::numeric, 0);
  v_diff := ROUND(COALESCE(p_counted_cash, v_expected) - v_expected, 2);

  IF ABS(v_diff) >= 0.01 THEN
    PERFORM public.ensure_default_accounts(v_shift.tenant_id);
    v_acc_cash := public.resolve_account_by_role(v_shift.tenant_id, 'cash');
    v_acc_loss := public.resolve_account_by_type(v_shift.tenant_id, 'expense');
    v_acc_gain := public.resolve_account_by_type(v_shift.tenant_id, 'income');

    IF v_acc_cash IS NOT NULL AND v_acc_loss IS NOT NULL AND v_acc_gain IS NOT NULL THEN
      INSERT INTO public.journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, status, created_by)
      VALUES (v_shift.tenant_id, 'Z-'||substr(p_shift_id::text,1,8), CURRENT_DATE,
              CASE WHEN v_diff < 0 THEN 'Faltante de caja · Cierre Z' ELSE 'Sobrante de caja · Cierre Z' END,
              'shift_z', p_shift_id, 'draft', auth.uid())
      RETURNING id INTO v_entry_id;

      IF v_diff < 0 THEN
        INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description)
        VALUES (v_entry_id, v_acc_loss, ABS(v_diff), 0, 'Faltante de caja'),
               (v_entry_id, v_acc_cash, 0, ABS(v_diff), 'Ajuste de caja');
      ELSE
        INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description)
        VALUES (v_entry_id, v_acc_cash, v_diff, 0, 'Ajuste de caja'),
               (v_entry_id, v_acc_gain, 0, v_diff, 'Sobrante de caja');
      END IF;

      PERFORM public.post_journal_entry(v_entry_id);
    END IF;
  END IF;

  v_summary := v_summary || jsonb_build_object(
    'counted_cash', COALESCE(p_counted_cash, v_expected),
    'cash_difference', v_diff,
    'journal_entry_id', v_entry_id,
    'closed_at', now()
  );

  UPDATE public.sales_shifts SET
    status = 'closed',
    closed_at = now(),
    closing_cash = COALESCE(p_counted_cash, v_expected),
    declared_cash = COALESCE(p_counted_cash, v_expected),
    expected_cash = v_expected,
    cash_difference = v_diff,
    cash_in_total = COALESCE((v_summary->>'cash_in')::numeric,0),
    cash_out_total = COALESCE((v_summary->>'cash_out')::numeric,0),
    returns_total = COALESCE((v_summary->>'returns_cash')::numeric,0),
    total_sales = COALESCE((v_summary->>'total_sales')::numeric,0),
    total_transactions = COALESCE((v_summary->>'transactions')::int,0),
    z_journal_entry_id = v_entry_id,
    z_summary = v_summary,
    z_closed_at = now(),
    locked = true,
    updated_at = now()
  WHERE id = p_shift_id;

  RETURN v_summary;
END $$;

GRANT EXECUTE ON FUNCTION public.register_shift_cash_movement(uuid, text, numeric, text, text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_account_by_type(uuid, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_cash_counterpart(uuid, text) TO authenticated;