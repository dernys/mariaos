-- ============================================================
-- P1 PAYMENT CORE (Cuba) — sobre el núcleo P0 existente
-- ============================================================

-- 1) Esquema: intento de pago vs pago confirmado
ALTER TABLE public.sale_payments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PAID',
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS provider_transaction_id text,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.sale_payments SET status = 'PAID' WHERE status IS NULL OR status = '';
UPDATE public.sale_payments SET confirmed_at = created_at WHERE status = 'PAID' AND confirmed_at IS NULL;

DO $$ BEGIN
  ALTER TABLE public.sale_payments ADD CONSTRAINT sale_payments_status_chk
    CHECK (status IN ('CREATED','PENDING','PAID','FAILED','CANCELLED','REFUNDED','REVERSED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_sale_payments_status ON public.sale_payments(sale_id, status);

DROP TRIGGER IF EXISTS trg_touch_sale_payments ON public.sale_payments;
CREATE TRIGGER trg_touch_sale_payments BEFORE UPDATE ON public.sale_payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Normalización de medios de pago (Cuba) y clasificación contable
CREATE OR REPLACE FUNCTION public.payment_method_norm(p_method text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE lower(coalesce(nullif(p_method,''),'cash'))
    WHEN 'cash' THEN 'CASH'
    WHEN 'efectivo' THEN 'CASH'
    WHEN 'card' THEN 'CARD_POS'
    WHEN 'card_pos' THEN 'CARD_POS'
    WHEN 'tarjeta' THEN 'CARD_POS'
    WHEN 'pos' THEN 'CARD_POS'
    WHEN 'transfer' THEN 'BANK_TRANSFER'
    WHEN 'transferencia' THEN 'BANK_TRANSFER'
    WHEN 'bank_transfer' THEN 'BANK_TRANSFER'
    WHEN 'transfermovil' THEN 'TRANSFERMOVIL'
    WHEN 'enzona' THEN 'ENZONA'
    WHEN 'qr' THEN 'TRANSFERMOVIL'
    WHEN 'credit' THEN 'CREDIT'
    WHEN 'fiado' THEN 'CREDIT'
    ELSE upper(p_method)
  END;
$$;

-- cash | bank | digital | credit
CREATE OR REPLACE FUNCTION public.payment_method_class(p_method text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE public.payment_method_norm(p_method)
    WHEN 'CASH' THEN 'cash'
    WHEN 'CREDIT' THEN 'credit'
    WHEN 'TRANSFERMOVIL' THEN 'digital'
    WHEN 'ENZONA' THEN 'digital'
    ELSE 'bank'
  END;
$$;

-- Los medios que NO puede confirmar el frontend (requieren verificación real)
CREATE OR REPLACE FUNCTION public.payment_requires_confirmation(p_method text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT public.payment_method_norm(p_method) IN ('BANK_TRANSFER','TRANSFERMOVIL','ENZONA');
$$;

-- Clave del maestro de cuentas por medio y contexto ('sale' | 'payment')
CREATE OR REPLACE FUNCTION public.payment_account_role(p_method text, p_context text DEFAULT 'sale')
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN public.payment_method_class(p_method) = 'cash'
      THEN CASE WHEN p_context = 'payment' THEN 'payment_cash' ELSE 'sale_cash' END
    ELSE CASE WHEN p_context = 'payment' THEN 'payment_bank' ELSE 'sale_bank' END
  END;
$$;

REVOKE ALL ON FUNCTION public.payment_method_norm(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_method_class(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_requires_confirmation(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_account_role(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payment_method_norm(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payment_method_class(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payment_requires_confirmation(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payment_account_role(text, text) TO authenticated, service_role;

-- 3) Asiento de venta: reparte el débito por medio real y sólo pagos confirmados
CREATE OR REPLACE FUNCTION public.post_sale_journal_entry(p_sale_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_sale record;
  v_entry_id uuid;
  v_cash_total numeric := 0;
  v_bank_total numeric := 0;
  v_pending numeric := 0;
  v_cogs_total numeric := 0;
  v_acc_caja uuid; v_acc_banco uuid; v_acc_cxc uuid;
  v_acc_ventas uuid; v_acc_iva uuid;
  v_acc_cogs uuid; v_acc_inv uuid;
  v_cc uuid;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF v_sale IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE reference_type='sale' AND reference_id=p_sale_id) THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sale_items WHERE sale_id = p_sale_id) THEN RETURN NULL; END IF;

  PERFORM ensure_default_accounts(v_sale.tenant_id);
  v_acc_caja   := resolve_account_by_role(v_sale.tenant_id, 'sale_cash');
  v_acc_banco  := resolve_account_by_role(v_sale.tenant_id, 'sale_bank');
  v_acc_cxc    := resolve_account_by_role(v_sale.tenant_id, 'receivables');
  v_acc_ventas := resolve_account_by_role(v_sale.tenant_id, 'sales');
  v_acc_iva    := resolve_account_by_role(v_sale.tenant_id, 'tax_output');
  v_acc_cogs   := resolve_account_by_role(v_sale.tenant_id, 'cogs');
  v_acc_inv    := resolve_account_by_role(v_sale.tenant_id, 'inventory');
  v_cc         := v_sale.cost_center_id;

  SELECT COALESCE(SUM(amount_in_base) FILTER (WHERE public.payment_method_class(method) = 'cash'),0),
         COALESCE(SUM(amount_in_base) FILTER (WHERE public.payment_method_class(method) IN ('bank','digital')),0)
    INTO v_cash_total, v_bank_total
    FROM sale_payments WHERE sale_id = p_sale_id AND status = 'PAID';

  v_pending := GREATEST(0, round(COALESCE(v_sale.total,0) - (v_cash_total + v_bank_total), 2));

  SELECT COALESCE(SUM(si.qty * COALESCE(p.cost,0)), 0) INTO v_cogs_total
    FROM sale_items si LEFT JOIN products p ON p.id = si.product_id
    WHERE si.sale_id = p_sale_id;

  INSERT INTO journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, status, created_by)
  VALUES (v_sale.tenant_id, 'V-'||substr(p_sale_id::text,1,8), CURRENT_DATE,
          'Venta '||COALESCE(v_sale.ticket_number, p_sale_id::text), 'sale', p_sale_id, 'posted', auth.uid())
  RETURNING id INTO v_entry_id;

  IF v_cash_total > 0 AND v_acc_caja IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_caja, v_cash_total, 0, 'Cobro efectivo', v_cc);
  END IF;
  IF v_bank_total > 0 AND v_acc_banco IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_banco, v_bank_total, 0, 'Cobro bancario/digital', v_cc);
  END IF;
  IF v_pending > 0 AND v_acc_cxc IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_cxc, v_pending, 0, 'Saldo a cobrar / pagos por confirmar', v_cc);
  END IF;

  IF v_acc_ventas IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_ventas, 0, COALESCE(v_sale.subtotal,0), 'Ingreso por venta', v_cc);
  END IF;
  IF COALESCE(v_sale.tax,0) > 0 AND v_acc_iva IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_iva, 0, v_sale.tax, 'Impuestos cobrados', v_cc);
  END IF;

  IF v_cogs_total > 0 AND v_acc_cogs IS NOT NULL AND v_acc_inv IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_cogs, v_cogs_total, 0, 'Costo de ventas', v_cc);
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_inv, 0, v_cogs_total, 'Salida de inventario', v_cc);
  END IF;

  RETURN v_entry_id;
END; $function$;

-- 4) Cobro/pago de cuentas: cuenta según clase del medio
CREATE OR REPLACE FUNCTION public.post_payment_journal_entry(p_payment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_pay record; v_entry_id uuid; v_cash_acc uuid; v_party_acc uuid; v_amount numeric;
BEGIN
  SELECT * INTO v_pay FROM account_payments WHERE id = p_payment_id;
  IF v_pay IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE reference_type='payment' AND reference_id=p_payment_id) THEN
    RETURN NULL;
  END IF;

  IF v_pay.reference_type IN ('sale','purchase') THEN
    IF NOT EXISTS (
      SELECT 1 FROM journal_entries
      WHERE reference_type = v_pay.reference_type
        AND reference_id = v_pay.reference_id
        AND created_at < v_pay.created_at - interval '5 seconds'
    ) THEN
      RETURN NULL;
    END IF;
  END IF;

  PERFORM ensure_default_accounts(v_pay.tenant_id);
  v_amount := COALESCE(v_pay.amount_in_base, v_pay.amount);

  v_cash_acc := resolve_account_by_role(v_pay.tenant_id, public.payment_account_role(v_pay.method, 'payment'));
  IF v_pay.party_type = 'supplier' THEN
    v_party_acc := resolve_account_by_role(v_pay.tenant_id, 'payables');
  ELSE
    v_party_acc := resolve_account_by_role(v_pay.tenant_id, 'receivables');
  END IF;
  IF v_cash_acc IS NULL OR v_party_acc IS NULL THEN RETURN NULL; END IF;

  INSERT INTO journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, status, created_by)
  VALUES (v_pay.tenant_id, 'P-'||substr(p_payment_id::text,1,8), CURRENT_DATE,
          CASE WHEN v_pay.direction = 'in' THEN 'Cobro ' ELSE 'Pago ' END ||
          v_pay.party_type || ' ' || COALESCE(public.payment_method_norm(v_pay.method),''),
          'payment', p_payment_id, 'posted', auth.uid())
  RETURNING id INTO v_entry_id;

  IF v_pay.direction = 'in' THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
    VALUES (v_entry_id, v_cash_acc, v_amount, 0, 'Cobro ' || public.payment_method_norm(v_pay.method));
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
    VALUES (v_entry_id, v_party_acc, 0, v_amount, 'Liquidación CxC');
  ELSE
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
    VALUES (v_entry_id, v_party_acc, v_amount, 0, 'Liquidación CxP');
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
    VALUES (v_entry_id, v_cash_acc, 0, v_amount, 'Pago ' || public.payment_method_norm(v_pay.method));
  END IF;

  RETURN v_entry_id;
END; $function$;

-- 5) POS checkout multi-medio con estados y sin doble conteo
CREATE OR REPLACE FUNCTION public.pos_checkout(
  p_tenant_id uuid, p_items jsonb, p_payments jsonb DEFAULT '[]'::jsonb,
  p_party_type text DEFAULT NULL, p_party_id uuid DEFAULT NULL,
  p_allow_credit boolean DEFAULT false, p_shift_id uuid DEFAULT NULL,
  p_tax_rate_id uuid DEFAULT NULL, p_notes text DEFAULT NULL,
  p_kitchen_order_id uuid DEFAULT NULL, p_client_uuid uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL, p_correlation_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_found boolean := false;
  v_prev uuid;
  v_is_sa boolean := false;
  v_member boolean := false;
  v_shift_id uuid; v_store_id uuid;
  v_loc_type text; v_loc_id uuid;
  v_item jsonb; v_pay jsonb;
  v_product record;
  v_price numeric; v_qty numeric; v_disc numeric; v_line numeric;
  v_name text; v_sku text; v_pid uuid;
  v_subtotal numeric := 0; v_tax numeric := 0; v_total numeric := 0;
  v_paid numeric := 0; v_declared numeric := 0; v_committed numeric := 0;
  v_uncovered numeric := 0; v_change numeric := 0;
  v_rate numeric; v_fx numeric; v_amount numeric; v_base numeric; v_allowed numeric;
  v_method text; v_curr text; v_status_pay text; v_pend_pay numeric := 0;
  v_status text; v_sale_id uuid;
  v_balance numeric; v_limit numeric; v_debt numeric := 0;
  v_stock numeric; v_has_recipe boolean;
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'Negocio no especificado'; END IF;

  SELECT public.is_superadmin(auth.uid()) INTO v_is_sa;
  SELECT EXISTS(SELECT 1 FROM tenant_users WHERE user_id = auth.uid() AND tenant_id = p_tenant_id) INTO v_member;
  IF NOT (v_member OR (v_is_sa AND public.sa_active_tenant() = p_tenant_id)) THEN
    RAISE EXCEPTION 'No autorizado en este negocio';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La venta debe contener al menos una línea';
  END IF;

  IF p_client_uuid IS NOT NULL THEN
    SELECT id INTO v_prev FROM sales WHERE tenant_id = p_tenant_id AND client_uuid = p_client_uuid;
    IF v_prev IS NOT NULL THEN RETURN jsonb_build_object('sale_id', v_prev, 'idempotent', true); END IF;
  END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT c.found, c.result_id INTO v_found, v_prev
    FROM public.claim_operation(p_tenant_id, 'pos_checkout', p_idempotency_key, p_correlation_id) c;
    IF v_found THEN RETURN jsonb_build_object('sale_id', v_prev, 'idempotent', true); END IF;
  END IF;

  IF p_shift_id IS NOT NULL THEN
    SELECT id, store_id INTO v_shift_id, v_store_id FROM sales_shifts
     WHERE id = p_shift_id AND tenant_id = p_tenant_id AND status = 'open';
  END IF;
  IF v_shift_id IS NULL THEN
    SELECT r.shift_id, r.store_id INTO v_shift_id, v_store_id FROM public.resolve_open_shift(p_tenant_id) r;
  END IF;
  IF v_shift_id IS NULL THEN RAISE EXCEPTION 'No hay un turno abierto en este negocio'; END IF;

  v_loc_type := CASE WHEN v_store_id IS NOT NULL THEN 'store' ELSE 'tenant' END;
  v_loc_id := COALESCE(v_store_id, p_tenant_id);

  IF p_tax_rate_id IS NOT NULL THEN
    SELECT rate INTO v_rate FROM tax_rates WHERE id = p_tax_rate_id AND tenant_id = p_tenant_id AND is_active = true;
  END IF;
  IF v_rate IS NULL THEN
    SELECT rate INTO v_rate FROM tax_rates WHERE tenant_id = p_tenant_id AND is_active = true AND is_default = true LIMIT 1;
  END IF;
  v_rate := COALESCE(v_rate, 0);

  INSERT INTO sales (
    tenant_id, customer_id, employee_id, subtotal, tax, total, amount_paid,
    status, notes, shift_id, store_id, tax_rate_id, client_uuid, channel
  ) VALUES (
    p_tenant_id,
    CASE WHEN p_party_type = 'customer' THEN p_party_id END,
    CASE WHEN p_party_type = 'employee' THEN p_party_id END,
    0, 0, 0, 0, 'pending', p_notes, v_shift_id, v_store_id, p_tax_rate_id, p_client_uuid, 'presencial'
  ) RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := NULLIF(v_item->>'product_id','')::uuid;
    v_qty := COALESCE((v_item->>'qty')::numeric, 1);
    IF v_qty <= 0 OR v_qty > 1000000 THEN RAISE EXCEPTION 'Cantidad inválida en la línea'; END IF;
    v_disc := LEAST(GREATEST(COALESCE((v_item->>'discount_pct')::numeric, 0), 0), 100);

    IF v_pid IS NOT NULL THEN
      SELECT p.id, p.name, p.sku, p.price INTO v_product
        FROM products p WHERE p.id = v_pid AND p.tenant_id = p_tenant_id;
      IF v_product.id IS NULL THEN RAISE EXCEPTION 'Producto no pertenece a este negocio'; END IF;
      v_name := v_product.name; v_sku := v_product.sku; v_price := COALESCE(v_product.price, 0);

      SELECT EXISTS(SELECT 1 FROM product_recipes WHERE product_id = v_pid) INTO v_has_recipe;
      IF NOT v_has_recipe THEN
        SELECT stock INTO v_stock FROM product_stock
         WHERE product_id = v_pid AND location_type = v_loc_type AND location_id = v_loc_id;
        IF v_stock IS NULL THEN SELECT COALESCE(p.stock,0) INTO v_stock FROM products p WHERE p.id = v_pid; END IF;
        IF COALESCE(v_stock,0) < v_qty THEN
          RAISE EXCEPTION 'Existencias insuficientes de % (disponible %, solicitado %)', v_name, v_stock, v_qty;
        END IF;
      END IF;
    ELSE
      v_name := COALESCE(v_item->>'product_name', 'Ítem');
      v_sku := v_item->>'sku';
      v_price := COALESCE((v_item->>'price')::numeric, 0);
    END IF;

    v_price := round(v_price * (1 - v_disc/100.0), 2);
    v_line := round(v_price * v_qty, 2);
    IF v_line >= 1e12 THEN RAISE EXCEPTION 'Importe de línea fuera de rango'; END IF;
    v_subtotal := v_subtotal + v_line;

    INSERT INTO sale_items (sale_id, product_id, product_name, sku, price, qty, total, notes)
    VALUES (v_sale_id, v_pid, v_name, v_sku, v_price, v_qty, v_line, v_item->>'notes');
  END LOOP;

  v_subtotal := round(v_subtotal, 2);
  v_tax := round(v_subtotal * (v_rate/100.0), 2);
  v_total := round(v_subtotal + v_tax, 2);

  -- Pagos: tasa del servidor; digital/transferencia queda PENDING (no lo confirma el frontend)
  FOR v_pay IN SELECT * FROM jsonb_array_elements(COALESCE(p_payments, '[]'::jsonb)) LOOP
    v_amount := COALESCE((v_pay->>'amount')::numeric, 0);
    IF v_amount <= 0 THEN CONTINUE; END IF;
    IF v_amount >= 1e12 THEN RAISE EXCEPTION 'Importe de pago fuera de rango'; END IF;
    v_method := public.payment_method_norm(v_pay->>'method');
    IF v_method = 'CREDIT' THEN CONTINUE; END IF;
    v_curr := COALESCE(NULLIF(v_pay->>'currency',''), 'CUP');
    SELECT exchange_rate INTO v_fx FROM currencies
     WHERE tenant_id = p_tenant_id AND code = v_curr AND is_active = true;
    v_fx := COALESCE(v_fx, 1);

    v_base := round(v_amount * v_fx, 2);
    v_allowed := round(v_total - v_committed, 2);
    IF v_allowed <= 0 THEN
      IF public.payment_method_class(v_method) = 'cash' THEN v_change := v_change + v_base; END IF;
      CONTINUE;
    END IF;
    IF v_base > v_allowed THEN
      IF public.payment_method_class(v_method) = 'cash' THEN v_change := v_change + (v_base - v_allowed); END IF;
      v_base := v_allowed;
      v_amount := round(v_base / NULLIF(v_fx,0), 2);
    END IF;

    v_status_pay := CASE WHEN public.payment_requires_confirmation(v_method) THEN 'PENDING' ELSE 'PAID' END;
    IF v_status_pay = 'PENDING' AND COALESCE(NULLIF(v_pay->>'reference',''), NULL) IS NULL
       AND public.payment_method_norm(v_method) = 'BANK_TRANSFER' THEN
      RAISE EXCEPTION 'La transferencia bancaria requiere número de referencia';
    END IF;

    INSERT INTO sale_payments (sale_id, method, currency, amount, amount_in_base, exchange_rate,
                               card_last_four, card_holder, card_description,
                               status, provider, channel, reference, provider_transaction_id,
                               confirmed_at, notes)
    VALUES (v_sale_id, v_method, v_curr, v_amount, v_base, v_fx,
            NULLIF(v_pay->>'card_last_four',''), NULLIF(v_pay->>'card_holder',''), NULLIF(v_pay->>'card_description',''),
            v_status_pay, NULLIF(v_pay->>'provider',''), NULLIF(v_pay->>'channel',''),
            NULLIF(v_pay->>'reference',''), NULLIF(v_pay->>'provider_transaction_id',''),
            CASE WHEN v_status_pay = 'PAID' THEN now() END, NULLIF(v_pay->>'notes',''));

    v_committed := v_committed + v_base;
    IF v_status_pay = 'PAID' THEN v_paid := v_paid + v_base; ELSE v_declared := v_declared + v_base; END IF;
  END LOOP;

  v_paid := round(v_paid, 2);
  v_declared := round(v_declared, 2);
  v_uncovered := round(v_total - v_paid - v_declared, 2);

  IF v_uncovered > 0.01 THEN
    IF NOT p_allow_credit THEN RAISE EXCEPTION 'El pago no cubre el total de la venta'; END IF;
    IF p_party_id IS NULL OR p_party_type NOT IN ('customer','employee') THEN
      RAISE EXCEPTION 'No se puede dejar fiado sin cliente o empleado asociado';
    END IF;
    IF p_party_type = 'customer' THEN
      SELECT balance, credit_limit INTO v_balance, v_limit FROM customers WHERE id = p_party_id AND tenant_id = p_tenant_id;
    ELSE
      SELECT balance, credit_limit INTO v_balance, v_limit FROM employees WHERE id = p_party_id AND tenant_id = p_tenant_id;
    END IF;
    IF v_balance IS NULL AND v_limit IS NULL THEN
      RAISE EXCEPTION 'Contraparte no pertenece a este negocio';
    END IF;
    IF COALESCE(v_limit,0) > 0 AND COALESCE(v_balance,0) + v_uncovered > v_limit THEN
      RAISE EXCEPTION 'Límite de crédito excedido (saldo % + % > límite %)', COALESCE(v_balance,0), v_uncovered, v_limit;
    END IF;
  END IF;

  v_pend_pay := v_declared;
  v_status := CASE
    WHEN v_total - v_paid <= 0.01 THEN 'paid'
    WHEN v_paid > 0 OR v_declared > 0 THEN 'partial'
    ELSE 'pending' END;

  UPDATE sales SET subtotal = v_subtotal, tax = v_tax, total = v_total,
                   amount_paid = v_paid, status = v_status, updated_at = now()
   WHERE id = v_sale_id;

  -- Deuda real de la contraparte = lo no cobrado en firme (incluye pagos por confirmar)
  v_debt := round(v_total - v_paid, 2);
  IF v_debt > 0.01 AND p_party_id IS NOT NULL AND p_party_type IN ('customer','employee') THEN
    IF p_party_type = 'customer' THEN
      UPDATE customers SET balance = COALESCE(balance,0) + v_debt, updated_at = now() WHERE id = p_party_id;
    ELSE
      UPDATE employees SET balance = COALESCE(balance,0) + v_debt, updated_at = now() WHERE id = p_party_id;
    END IF;
  END IF;

  PERFORM public.process_sale_stock(v_sale_id, v_loc_type, v_loc_id);

  IF p_kitchen_order_id IS NOT NULL THEN
    UPDATE kitchen_orders SET status = 'billed', sale_id = v_sale_id, updated_at = now()
     WHERE id = p_kitchen_order_id AND tenant_id = p_tenant_id;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    UPDATE public.operation_idempotency SET result_id = v_sale_id
     WHERE operation = 'pos_checkout' AND idempotency_key = p_idempotency_key
       AND coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid)
           = coalesce(p_tenant_id,'00000000-0000-0000-0000-000000000000'::uuid);
  END IF;

  RETURN jsonb_build_object(
    'sale_id', v_sale_id, 'idempotent', false, 'status', v_status,
    'subtotal', v_subtotal, 'tax', v_tax, 'total', v_total,
    'paid', v_paid, 'pending_confirmation', v_pend_pay,
    'pending', GREATEST(round(v_total - v_paid - v_declared, 2), 0),
    'change', round(v_change, 2),
    'shift_id', v_shift_id, 'store_id', v_store_id
  );
END; $function$;

-- 6) Confirmación / rechazo real de un pago (nunca desde una bandera del frontend)
CREATE OR REPLACE FUNCTION public.confirm_sale_payment(
  p_payment_id uuid, p_status text, p_reference text DEFAULT NULL,
  p_provider_transaction_id text DEFAULT NULL, p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL, p_correlation_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_pay record; v_sale record; v_new text; v_entry_id uuid;
  v_acc uuid; v_cxc uuid; v_paid numeric;
BEGIN
  v_new := upper(coalesce(p_status,''));
  IF v_new NOT IN ('PAID','FAILED','CANCELLED') THEN
    RAISE EXCEPTION 'Estado de pago no permitido: %', v_new;
  END IF;

  SELECT sp.* INTO v_pay FROM sale_payments sp WHERE sp.id = p_payment_id;
  IF v_pay IS NULL THEN RAISE EXCEPTION 'Pago no encontrado'; END IF;
  SELECT * INTO v_sale FROM sales WHERE id = v_pay.sale_id;
  IF v_sale IS NULL THEN RAISE EXCEPTION 'Venta no encontrada'; END IF;
  IF NOT public.assert_tenant_access(v_sale.tenant_id) THEN
    RAISE EXCEPTION 'No autorizado en este negocio';
  END IF;

  IF v_pay.status = v_new THEN
    RETURN jsonb_build_object('payment_id', p_payment_id, 'status', v_new, 'idempotent', true);
  END IF;
  IF v_pay.status NOT IN ('CREATED','PENDING') THEN
    RAISE EXCEPTION 'El pago ya está en estado % y no admite esta transición', v_pay.status;
  END IF;

  UPDATE sale_payments SET
    status = v_new,
    reference = COALESCE(NULLIF(p_reference,''), reference),
    provider_transaction_id = COALESCE(NULLIF(p_provider_transaction_id,''), provider_transaction_id),
    notes = COALESCE(NULLIF(p_notes,''), notes),
    confirmed_at = CASE WHEN v_new = 'PAID' THEN now() ELSE confirmed_at END,
    failed_at = CASE WHEN v_new <> 'PAID' THEN now() ELSE failed_at END,
    verified_by = auth.uid(), verified_at = now()
  WHERE id = p_payment_id;

  IF v_new <> 'PAID' THEN
    RETURN jsonb_build_object('payment_id', p_payment_id, 'status', v_new, 'idempotent', false);
  END IF;

  -- Asiento: Dr medio recibido / Cr CxC (la venta ya reconoció el ingreso)
  PERFORM ensure_default_accounts(v_sale.tenant_id);
  v_acc := resolve_account_by_role(v_sale.tenant_id, public.payment_account_role(v_pay.method, 'payment'));
  v_cxc := resolve_account_by_role(v_sale.tenant_id, 'receivables');

  IF v_acc IS NOT NULL AND v_cxc IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM journal_entries WHERE reference_type='sale_payment' AND reference_id=p_payment_id) THEN
    INSERT INTO journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, status, created_by)
    VALUES (v_sale.tenant_id, 'C-'||substr(p_payment_id::text,1,8), CURRENT_DATE,
            'Confirmación cobro '||public.payment_method_norm(v_pay.method)||' venta '||COALESCE(v_sale.ticket_number, v_sale.id::text),
            'sale_payment', p_payment_id, 'posted', auth.uid())
    RETURNING id INTO v_entry_id;
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc, v_pay.amount_in_base, 0, 'Cobro '||public.payment_method_norm(v_pay.method), v_sale.cost_center_id);
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_cxc, 0, v_pay.amount_in_base, 'Liquidación CxC', v_sale.cost_center_id);
  END IF;

  v_paid := round(COALESCE(v_sale.amount_paid,0) + v_pay.amount_in_base, 2);
  UPDATE sales SET amount_paid = v_paid,
                   status = CASE WHEN v_paid >= COALESCE(total,0) - 0.01 THEN 'paid' ELSE 'partial' END,
                   updated_at = now()
   WHERE id = v_sale.id;

  IF v_sale.customer_id IS NOT NULL THEN
    UPDATE customers SET balance = COALESCE(balance,0) - v_pay.amount_in_base, updated_at = now() WHERE id = v_sale.customer_id;
  ELSIF v_sale.employee_id IS NOT NULL THEN
    UPDATE employees SET balance = COALESCE(balance,0) - v_pay.amount_in_base, updated_at = now() WHERE id = v_sale.employee_id;
  END IF;

  RETURN jsonb_build_object('payment_id', p_payment_id, 'status', 'PAID', 'sale_id', v_sale.id,
                            'entry_id', v_entry_id, 'amount_in_base', v_pay.amount_in_base, 'idempotent', false);
END; $function$;

REVOKE ALL ON FUNCTION public.confirm_sale_payment(uuid, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_sale_payment(uuid, text, text, text, text, text, text) TO authenticated, service_role;

-- 7) Arqueo de turno: efectivo real vs digital/bancario
CREATE OR REPLACE FUNCTION public.calculate_shift_summary(p_shift_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_shift record;
  v_cash_sales numeric := 0; v_card numeric := 0; v_transfer numeric := 0; v_other_pay numeric := 0;
  v_digital_pending numeric := 0;
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

  SELECT COALESCE(SUM(sp.amount_in_base) FILTER (WHERE sp.status='PAID' AND public.payment_method_class(sp.method)='cash'),0),
         COALESCE(SUM(sp.amount_in_base) FILTER (WHERE sp.status='PAID' AND public.payment_method_norm(sp.method)='CARD_POS'),0),
         COALESCE(SUM(sp.amount_in_base) FILTER (WHERE sp.status='PAID' AND public.payment_method_class(sp.method) IN ('bank','digital') AND public.payment_method_norm(sp.method)<>'CARD_POS'),0),
         0,
         COALESCE(SUM(sp.amount_in_base) FILTER (WHERE sp.status IN ('PENDING','CREATED')),0)
    INTO v_cash_sales, v_card, v_transfer, v_other_pay, v_digital_pending
    FROM public.sale_payments sp JOIN public.sales s ON s.id = sp.sale_id
    WHERE s.shift_id = p_shift_id AND COALESCE(s.status,'') <> 'cancelled';

  SELECT COALESCE(SUM(total),0), COUNT(*), COALESCE(SUM(GREATEST(0, COALESCE(total,0) - COALESCE(amount_paid,0))),0)
    INTO v_total_sales, v_tx, v_credit
    FROM public.sales
    WHERE shift_id = p_shift_id AND COALESCE(status,'') <> 'cancelled';

  SELECT COALESCE(SUM(COALESCE(amount_in_base, amount)) FILTER (WHERE direction='in' AND public.payment_method_class(method)='cash'),0),
         COALESCE(SUM(COALESCE(amount_in_base, amount)) FILTER (WHERE direction='in' AND public.payment_method_class(method)<>'cash'),0),
         COALESCE(SUM(COALESCE(amount_in_base, amount)) FILTER (WHERE direction='in'),0),
         COUNT(*) FILTER (WHERE direction='in'),
         COALESCE(SUM(COALESCE(amount_in_base, amount)) FILTER (WHERE direction='out' AND public.payment_method_class(method)='cash'),0),
         COALESCE(SUM(COALESCE(amount_in_base, amount)) FILTER (WHERE direction='out' AND public.payment_method_class(method)<>'cash'),0),
         COALESCE(SUM(COALESCE(amount_in_base, amount)) FILTER (WHERE direction='out'),0)
    INTO v_col_cash, v_col_other, v_col_total, v_col_count, v_pay_cash, v_pay_other, v_pay_total
    FROM public.account_payments
    WHERE shift_id = p_shift_id AND COALESCE(reference_type,'') <> 'sale';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', ap.id, 'direction', ap.direction, 'party_type', ap.party_type,
           'party_name', COALESCE(c.name, e.name, s.name), 'method', public.payment_method_norm(ap.method),
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
    WHERE s.shift_id = p_shift_id AND public.payment_method_class(sr.refund_method) = 'cash';

  v_expected := COALESCE(v_shift.opening_cash,0) + v_cash_sales + v_col_cash + v_in
                - v_out - v_pay_cash - v_returns;

  RETURN jsonb_build_object(
    'opening_cash', COALESCE(v_shift.opening_cash,0),
    'cash_sales', v_cash_sales,
    'card_sales', v_card,
    'transfer_sales', v_transfer,
    'other_payments', v_other_pay,
    'digital_pending', v_digital_pending,
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
END; $function$;

-- 8) Reporte de medios de pago (ventas + cobros de deuda), tenant-scoped
CREATE OR REPLACE FUNCTION public.report_payments_by_method(
  p_tenant uuid, p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (source text, method text, class text, status text, payments bigint, total_base numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NOT public.assert_tenant_access(p_tenant) THEN
    RAISE EXCEPTION 'No autorizado en este negocio';
  END IF;
  RETURN QUERY
  SELECT 'sale'::text, public.payment_method_norm(sp.method), public.payment_method_class(sp.method), sp.status,
         COUNT(*)::bigint, COALESCE(SUM(sp.amount_in_base),0)
    FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
   WHERE s.tenant_id = p_tenant
     AND COALESCE(s.status,'') <> 'cancelled'
     AND (p_from IS NULL OR sp.created_at::date >= p_from)
     AND (p_to IS NULL OR sp.created_at::date <= p_to)
   GROUP BY 2,3,4
  UNION ALL
  SELECT 'collection'::text, public.payment_method_norm(ap.method), public.payment_method_class(ap.method), 'PAID',
         COUNT(*)::bigint, COALESCE(SUM(COALESCE(ap.amount_in_base, ap.amount)),0)
    FROM account_payments ap
   WHERE ap.tenant_id = p_tenant AND ap.direction = 'in' AND COALESCE(ap.reference_type,'') <> 'sale'
     AND (p_from IS NULL OR ap.created_at::date >= p_from)
     AND (p_to IS NULL OR ap.created_at::date <= p_to)
   GROUP BY 2,3;
END; $function$;

REVOKE ALL ON FUNCTION public.report_payments_by_method(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_payments_by_method(uuid, date, date) TO authenticated, service_role;
