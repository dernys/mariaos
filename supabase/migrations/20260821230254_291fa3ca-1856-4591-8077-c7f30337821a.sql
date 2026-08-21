CREATE OR REPLACE FUNCTION public.pos_checkout(
  p_tenant_id uuid,
  p_items jsonb,
  p_payments jsonb DEFAULT '[]'::jsonb,
  p_party_type text DEFAULT NULL,
  p_party_id uuid DEFAULT NULL,
  p_allow_credit boolean DEFAULT false,
  p_shift_id uuid DEFAULT NULL,
  p_tax_rate_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_kitchen_order_id uuid DEFAULT NULL,
  p_client_uuid uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_correlation_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
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
  v_paid numeric := 0; v_pending numeric := 0;
  v_rate numeric; v_fx numeric; v_amount numeric; v_method text; v_curr text;
  v_status text; v_sale_id uuid;
  v_party_type text; v_balance numeric; v_limit numeric;
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
    IF v_prev IS NOT NULL THEN
      RETURN jsonb_build_object('sale_id', v_prev, 'idempotent', true);
    END IF;
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
    SELECT rate INTO v_rate FROM tax_rates
     WHERE id = p_tax_rate_id AND tenant_id = p_tenant_id AND is_active = true;
  END IF;
  IF v_rate IS NULL THEN
    SELECT rate INTO v_rate FROM tax_rates
     WHERE tenant_id = p_tenant_id AND is_active = true AND is_default = true LIMIT 1;
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
    IF v_qty <= 0 THEN RAISE EXCEPTION 'Cantidad inválida en la línea'; END IF;
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
        IF v_stock IS NOT NULL AND v_stock < v_qty THEN
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
    v_subtotal := v_subtotal + v_line;

    INSERT INTO sale_items (sale_id, product_id, product_name, sku, price, qty, total, notes)
    VALUES (v_sale_id, v_pid, v_name, v_sku, v_price, v_qty, v_line, v_item->>'notes');
  END LOOP;

  v_subtotal := round(v_subtotal, 2);
  v_tax := round(v_subtotal * (v_rate/100.0), 2);
  v_total := round(v_subtotal + v_tax, 2);

  FOR v_pay IN SELECT * FROM jsonb_array_elements(COALESCE(p_payments, '[]'::jsonb)) LOOP
    v_amount := COALESCE((v_pay->>'amount')::numeric, 0);
    IF v_amount <= 0 THEN CONTINUE; END IF;
    v_method := COALESCE(NULLIF(v_pay->>'method',''), 'cash');
    v_curr := COALESCE(NULLIF(v_pay->>'currency',''), 'CUP');
    SELECT exchange_rate INTO v_fx FROM currencies
     WHERE tenant_id = p_tenant_id AND code = v_curr AND is_active = true;
    v_fx := COALESCE(v_fx, 1);

    INSERT INTO sale_payments (sale_id, method, currency, amount, amount_in_base, exchange_rate,
                               card_last_four, card_holder, card_description)
    VALUES (v_sale_id, v_method, v_curr, v_amount, round(v_amount * v_fx, 2), v_fx,
            NULLIF(v_pay->>'card_last_four',''), NULLIF(v_pay->>'card_holder',''), NULLIF(v_pay->>'card_description',''));

    v_paid := v_paid + round(v_amount * v_fx, 2);
  END LOOP;

  v_paid := round(v_paid, 2);
  IF v_paid > v_total + 0.01 THEN v_paid := v_total; END IF;
  v_pending := round(v_total - v_paid, 2);

  IF v_pending > 0.01 THEN
    IF NOT p_allow_credit THEN RAISE EXCEPTION 'El pago no cubre el total de la venta'; END IF;
    IF p_party_id IS NULL OR p_party_type NOT IN ('customer','employee') THEN
      RAISE EXCEPTION 'No se puede dejar fiado sin cliente o empleado asociado';
    END IF;
    IF p_party_type = 'customer' THEN
      SELECT balance, credit_limit INTO v_balance, v_limit FROM customers
       WHERE id = p_party_id AND tenant_id = p_tenant_id;
    ELSE
      SELECT balance, credit_limit INTO v_balance, v_limit FROM employees
       WHERE id = p_party_id AND tenant_id = p_tenant_id;
    END IF;
    IF v_balance IS NULL AND v_limit IS NULL THEN
      RAISE EXCEPTION 'Contraparte no pertenece a este negocio';
    END IF;
    IF COALESCE(v_limit,0) > 0 AND COALESCE(v_balance,0) + v_pending > v_limit THEN
      RAISE EXCEPTION 'Límite de crédito excedido (saldo % + % > límite %)', COALESCE(v_balance,0), v_pending, v_limit;
    END IF;
  END IF;

  v_status := CASE WHEN v_pending <= 0.01 THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'pending' END;

  UPDATE sales SET subtotal = v_subtotal, tax = v_tax, total = v_total,
                   amount_paid = v_paid, status = v_status, updated_at = now()
   WHERE id = v_sale_id;

  IF v_paid > 0 AND p_party_id IS NOT NULL AND p_party_type IN ('customer','employee') THEN
    v_party_type := p_party_type;
    INSERT INTO account_payments (
      tenant_id, party_type, party_id, reference_type, reference_id, direction,
      method, currency, amount, amount_in_base, exchange_rate, performed_by, shift_id, store_id
    )
    SELECT p_tenant_id, v_party_type, p_party_id, 'sale', v_sale_id, 'in',
           sp.method, sp.currency, sp.amount, sp.amount_in_base, sp.exchange_rate,
           auth.uid(), v_shift_id, v_store_id
    FROM sale_payments sp WHERE sp.sale_id = v_sale_id;
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
    'paid', v_paid, 'pending', GREATEST(v_pending, 0), 'shift_id', v_shift_id, 'store_id', v_store_id
  );
END;
$fn$;