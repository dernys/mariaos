-- Operación rápida unificada: venta (CxC) o compra (CxP), multi-pago, impuesto configurable.
CREATE OR REPLACE FUNCTION public.create_quick_operation(
  p_tenant_id uuid,
  p_kind text,                     -- 'sale' | 'purchase'
  p_party_type text,               -- 'customer' | 'employee' | 'supplier'
  p_party_id uuid,
  p_items jsonb,
  p_payments jsonb DEFAULT '[]'::jsonb,
  p_notes text DEFAULT NULL,
  p_tax_rate_id uuid DEFAULT NULL,
  p_tax_rate numeric DEFAULT 0,
  p_due_date date DEFAULT NULL,
  p_issue_invoice boolean DEFAULT false,
  p_idempotency_key text DEFAULT NULL,
  p_correlation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_found boolean := false;
  v_prev uuid;
  v_rate numeric;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_paid numeric := 0;
  v_pending numeric := 0;
  v_sale_id uuid;
  v_purchase_id uuid;
  v_invoice_id uuid;
  v_item jsonb;
  v_pay jsonb;
  v_store_id uuid;
  v_number text;
BEGIN
  IF NOT (public.is_superadmin(auth.uid()) OR EXISTS (
    SELECT 1 FROM tenant_users WHERE user_id = auth.uid() AND tenant_id = p_tenant_id
  )) THEN
    RAISE EXCEPTION 'No autorizado en este tenant';
  END IF;

  IF p_kind NOT IN ('sale', 'purchase') THEN
    RAISE EXCEPTION 'Tipo de operación inválido: %', p_kind;
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La operación debe contener al menos una línea';
  END IF;
  IF p_kind = 'purchase' AND (p_party_type <> 'supplier' OR p_party_id IS NULL) THEN
    RAISE EXCEPTION 'Las compras rápidas requieren un proveedor';
  END IF;
  IF p_kind = 'sale' AND p_party_type NOT IN ('customer', 'employee') THEN
    RAISE EXCEPTION 'Las ventas rápidas solo admiten cliente o empleado';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT c.found, c.result_id INTO v_found, v_prev
    FROM public.claim_operation(p_tenant_id, 'create_quick_operation', p_idempotency_key, p_correlation_id) c;
    IF v_found THEN
      RETURN jsonb_build_object('kind', p_kind, 'id', v_prev, 'idempotent', true);
    END IF;
  END IF;

  -- Tasa de impuesto: la configurada gana sobre el valor libre.
  IF p_tax_rate_id IS NOT NULL THEN
    SELECT rate INTO v_rate FROM tax_rates
     WHERE id = p_tax_rate_id AND tenant_id = p_tenant_id AND is_active = true;
  END IF;
  v_rate := COALESCE(v_rate, p_tax_rate, 0);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_subtotal := v_subtotal
      + COALESCE((v_item->>'qty')::numeric, 1)
      * COALESCE((v_item->>'price')::numeric, (v_item->>'cost')::numeric, 0);
  END LOOP;
  v_tax := round(v_subtotal * (v_rate / 100.0), 2);
  v_total := round(v_subtotal + v_tax, 2);

  FOR v_pay IN SELECT * FROM jsonb_array_elements(COALESCE(p_payments, '[]'::jsonb)) LOOP
    v_paid := v_paid + COALESCE((v_pay->>'amount')::numeric, 0) * COALESCE((v_pay->>'exchange_rate')::numeric, 1);
  END LOOP;
  v_paid := round(v_paid, 2);
  v_pending := round(v_total - v_paid, 2);

  IF v_pending > 0.01 AND p_party_id IS NULL THEN
    RAISE EXCEPTION 'No se puede dejar fiado sin cliente, empleado o proveedor asociado';
  END IF;

  IF p_kind = 'sale' THEN
    v_sale_id := public.create_quick_sale(
      p_tenant_id,
      CASE WHEN p_party_type = 'customer' THEN p_party_id ELSE NULL END,
      CASE WHEN p_party_type = 'employee' THEN p_party_id ELSE NULL END,
      p_items,
      COALESCE(p_payments, '[]'::jsonb),
      p_notes,
      v_rate
    );

    UPDATE sales SET tax_rate_id = p_tax_rate_id, updated_at = now() WHERE id = v_sale_id;

    IF p_issue_invoice THEN
      v_invoice_id := public.issue_invoice(v_sale_id, NULL);
      UPDATE invoices SET tax_rate_id = p_tax_rate_id, updated_at = now() WHERE id = v_invoice_id;
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
      UPDATE public.operation_idempotency SET result_id = v_sale_id
       WHERE operation = 'create_quick_operation' AND idempotency_key = p_idempotency_key
         AND coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
             = coalesce(p_tenant_id, '00000000-0000-0000-0000-000000000000'::uuid);
    END IF;

    RETURN jsonb_build_object(
      'kind', 'sale', 'id', v_sale_id, 'invoice_id', v_invoice_id,
      'total', v_total, 'paid', v_paid, 'pending', GREATEST(v_pending, 0)
    );
  END IF;

  -- ===== Compra rápida =====
  SELECT id INTO v_store_id FROM stores
   WHERE tenant_id = p_tenant_id AND COALESCE(is_active, true) = true
   ORDER BY created_at LIMIT 1;

  v_number := 'CR-' || to_char(now(), 'YYMMDD') || '-' || lpad((
    SELECT count(*) + 1 FROM purchases WHERE tenant_id = p_tenant_id AND created_at::date = current_date
  )::text, 4, '0');

  INSERT INTO purchases (
    tenant_id, supplier_id, purchase_number, destination_type, destination_id,
    status, subtotal, tax, total, amount_paid, notes, created_by, tax_rate_id
  ) VALUES (
    p_tenant_id, p_party_id, v_number,
    CASE WHEN v_store_id IS NOT NULL THEN 'store' ELSE 'tenant' END,
    COALESCE(v_store_id, p_tenant_id),
    'pending', v_subtotal, v_tax, v_total, v_paid, p_notes, auth.uid(), p_tax_rate_id
  ) RETURNING id INTO v_purchase_id;

  INSERT INTO purchase_items (purchase_id, product_id, product_name, sku, qty, cost, total, unit)
  SELECT
    v_purchase_id,
    NULLIF(it->>'product_id', '')::uuid,
    (it->>'product_name')::text,
    (it->>'sku')::text,
    COALESCE((it->>'qty')::numeric, 1),
    COALESCE((it->>'cost')::numeric, (it->>'price')::numeric, 0),
    COALESCE((it->>'qty')::numeric, 1) * COALESCE((it->>'cost')::numeric, (it->>'price')::numeric, 0),
    NULLIF(it->>'unit', '')
  FROM jsonb_array_elements(p_items) it;

  -- Recepción inmediata: entra al inventario y genera el asiento de la compra.
  PERFORM public.receive_purchase(v_purchase_id);

  -- Pagos registrados en el historial de cuentas del proveedor (baja el saldo vía trigger).
  IF v_paid > 0 THEN
    INSERT INTO account_payments (
      tenant_id, party_type, party_id, reference_type, reference_id,
      direction, method, currency, amount, amount_in_base, exchange_rate, performed_by, notes
    )
    SELECT
      p_tenant_id, 'supplier', p_party_id, 'purchase', v_purchase_id,
      'out',
      COALESCE(pay->>'method', 'cash'),
      COALESCE(pay->>'currency', 'CUP'),
      COALESCE((pay->>'amount')::numeric, 0),
      COALESCE((pay->>'amount')::numeric, 0) * COALESCE((pay->>'exchange_rate')::numeric, 1),
      COALESCE((pay->>'exchange_rate')::numeric, 1),
      auth.uid(),
      'Compra rápida ' || v_number
    FROM jsonb_array_elements(COALESCE(p_payments, '[]'::jsonb)) pay
    WHERE COALESCE((pay->>'amount')::numeric, 0) > 0;
  END IF;

  -- Cuenta por pagar por el saldo fiado.
  IF v_pending > 0.01 THEN
    INSERT INTO accounts_payable (
      tenant_id, party_type, party_id, source_type, source_id,
      description, amount, amount_paid, due_date, status, currency, exchange_rate
    ) VALUES (
      p_tenant_id, 'supplier', p_party_id, 'purchase', v_purchase_id,
      'Compra rápida ' || v_number, v_pending, 0,
      COALESCE(p_due_date, current_date + 30), 'pending', 'CUP', 1
    );
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    UPDATE public.operation_idempotency SET result_id = v_purchase_id
     WHERE operation = 'create_quick_operation' AND idempotency_key = p_idempotency_key
       AND coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = coalesce(p_tenant_id, '00000000-0000-0000-0000-000000000000'::uuid);
  END IF;

  RETURN jsonb_build_object(
    'kind', 'purchase', 'id', v_purchase_id, 'number', v_number,
    'total', v_total, 'paid', v_paid, 'pending', GREATEST(v_pending, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_quick_operation(uuid, text, text, uuid, jsonb, jsonb, text, uuid, numeric, date, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_quick_operation(uuid, text, text, uuid, jsonb, jsonb, text, uuid, numeric, date, boolean, text, text) TO authenticated, service_role;