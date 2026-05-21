
-- Idempotency keys for offline sync
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS client_uuid uuid;
CREATE UNIQUE INDEX IF NOT EXISTS sales_client_uuid_key ON public.sales(client_uuid) WHERE client_uuid IS NOT NULL;

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS client_uuid uuid;
CREATE UNIQUE INDEX IF NOT EXISTS sale_items_client_uuid_key ON public.sale_items(client_uuid) WHERE client_uuid IS NOT NULL;

ALTER TABLE public.account_payments ADD COLUMN IF NOT EXISTS client_uuid uuid;
CREATE UNIQUE INDEX IF NOT EXISTS account_payments_client_uuid_key ON public.account_payments(client_uuid) WHERE client_uuid IS NOT NULL;

-- Indexes for perf on hot paths
CREATE INDEX IF NOT EXISTS sales_tenant_created_idx ON public.sales(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_tenant_created_idx ON public.inventory_movements(tenant_id, created_at DESC);

-- Sync RPC: receives a full offline sale and upserts atomically
CREATE OR REPLACE FUNCTION public.sync_offline_sale(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_client_uuid uuid;
  v_tenant uuid;
  v_existing uuid;
  v_sale_id uuid;
  v_item jsonb;
  v_pay jsonb;
  v_location_type text;
  v_location_id uuid;
BEGIN
  v_client_uuid := (p_payload->>'client_uuid')::uuid;
  v_tenant := (p_payload->>'tenant_id')::uuid;

  IF v_client_uuid IS NULL THEN
    RAISE EXCEPTION 'client_uuid requerido para sync offline';
  END IF;

  IF NOT (public.is_superadmin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND tenant_id = v_tenant
  )) THEN
    RAISE EXCEPTION 'No autorizado en este tenant';
  END IF;

  -- Idempotencia: si ya existe, devolverla
  SELECT id INTO v_existing FROM public.sales WHERE client_uuid = v_client_uuid;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.sales (
    tenant_id, client_uuid, customer_id, employee_id, shift_id,
    subtotal, tax, total, amount_paid, status, notes,
    ticket_series, created_at
  ) VALUES (
    v_tenant, v_client_uuid,
    NULLIF(p_payload->>'customer_id','')::uuid,
    NULLIF(p_payload->>'employee_id','')::uuid,
    NULLIF(p_payload->>'shift_id','')::uuid,
    COALESCE((p_payload->>'subtotal')::numeric, 0),
    COALESCE((p_payload->>'tax')::numeric, 0),
    COALESCE((p_payload->>'total')::numeric, 0),
    COALESCE((p_payload->>'amount_paid')::numeric, 0),
    COALESCE(p_payload->>'status', 'pending'),
    p_payload->>'notes',
    COALESCE(p_payload->>'ticket_series', 'T'),
    COALESCE((p_payload->>'created_at')::timestamptz, now())
  )
  RETURNING id INTO v_sale_id;

  -- Items
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'items', '[]'::jsonb)) LOOP
    INSERT INTO public.sale_items (
      sale_id, client_uuid, product_id, product_name, sku, price, qty, total
    ) VALUES (
      v_sale_id,
      NULLIF(v_item->>'client_uuid','')::uuid,
      NULLIF(v_item->>'product_id','')::uuid,
      v_item->>'product_name',
      v_item->>'sku',
      COALESCE((v_item->>'price')::numeric, 0),
      COALESCE((v_item->>'qty')::numeric, 1),
      COALESCE((v_item->>'total')::numeric, 0)
    ) ON CONFLICT DO NOTHING;
  END LOOP;

  -- Stock
  v_location_type := COALESCE(p_payload->>'location_type', 'store');
  v_location_id := NULLIF(p_payload->>'location_id','')::uuid;
  IF v_location_id IS NOT NULL THEN
    PERFORM public.process_sale_stock(v_sale_id, v_location_type, v_location_id);
  END IF;

  -- Pagos
  FOR v_pay IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'payments', '[]'::jsonb)) LOOP
    INSERT INTO public.account_payments (
      tenant_id, client_uuid, party_type, party_id,
      reference_type, reference_id, direction, method, currency,
      amount, amount_in_base, exchange_rate, performed_by
    ) VALUES (
      v_tenant,
      NULLIF(v_pay->>'client_uuid','')::uuid,
      COALESCE(v_pay->>'party_type', 'customer'),
      NULLIF(v_pay->>'party_id','')::uuid,
      'sale', v_sale_id, 'in',
      COALESCE(v_pay->>'method','cash'),
      COALESCE(v_pay->>'currency','CUP'),
      COALESCE((v_pay->>'amount')::numeric, 0),
      COALESCE((v_pay->>'amount_in_base')::numeric, (v_pay->>'amount')::numeric),
      COALESCE((v_pay->>'exchange_rate')::numeric, 1),
      auth.uid()
    ) ON CONFLICT DO NOTHING;
  END LOOP;

  INSERT INTO public.activity_log (entity_type, entity_id, action, description, tenant_id, performed_by)
  VALUES ('sale', v_sale_id, 'Sincronización offline',
          'Venta creada desde cola offline (client_uuid=' || v_client_uuid::text || ')',
          v_tenant, auth.uid());

  RETURN v_sale_id;
END;
$$;
