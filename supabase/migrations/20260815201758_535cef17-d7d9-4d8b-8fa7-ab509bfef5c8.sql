DROP FUNCTION IF EXISTS public.place_online_order(uuid, jsonb, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.confirm_online_order(
  p_order_id uuid,
  p_payments jsonb DEFAULT '[]'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_o online_orders%ROWTYPE;
  v_sale_id uuid;
  v_paid numeric := 0;
  v_status text;
  v_shift uuid;
  v_store stores%ROWTYPE;
BEGIN
  SELECT * INTO v_o FROM online_orders WHERE id = p_order_id FOR UPDATE;
  IF v_o.id IS NULL THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF NOT (is_superadmin(auth.uid()) OR is_tenant_member(v_o.tenant_id)) THEN
    RAISE EXCEPTION 'No autorizado en este negocio';
  END IF;
  IF v_o.sale_id IS NOT NULL THEN RETURN v_o.sale_id; END IF;
  IF v_o.status = 'cancelled' THEN RAISE EXCEPTION 'El pedido está cancelado'; END IF;

  SELECT COALESCE(sum(COALESCE((p->>'amount')::numeric,0) * COALESCE((p->>'exchange_rate')::numeric,1)),0)
    INTO v_paid FROM jsonb_array_elements(p_payments) p;

  v_status := CASE WHEN v_paid >= v_o.total THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'pending' END;

  SELECT id INTO v_shift FROM sales_shifts
   WHERE tenant_id = v_o.tenant_id AND status = 'open'
     AND (v_o.store_id IS NULL OR store_id = v_o.store_id)
   ORDER BY opened_at DESC LIMIT 1;

  INSERT INTO sales (tenant_id, customer_id, subtotal, tax, total, amount_paid, status,
                     notes, store_id, shift_id, channel, fulfillment, online_order_id)
  VALUES (v_o.tenant_id, v_o.customer_id, v_o.subtotal + COALESCE(v_o.delivery_fee,0),
          COALESCE(v_o.tax,0), v_o.total, v_paid, v_status,
          v_o.notes, v_o.store_id, v_shift, 'online',
          CASE WHEN v_o.delivery_type = 'delivery' THEN 'delivery' ELSE 'pickup' END, v_o.id)
  RETURNING id INTO v_sale_id;

  INSERT INTO sale_items (sale_id, product_id, product_name, price, qty, total)
  SELECT v_sale_id, oi.product_id, oi.product_name, oi.price, oi.qty::integer, oi.total
  FROM online_order_items oi WHERE oi.order_id = v_o.id;

  IF v_paid > 0 THEN
    INSERT INTO sale_payments (sale_id, method, currency, amount, amount_in_base, exchange_rate)
    SELECT v_sale_id, COALESCE(p->>'method', v_o.payment_method, 'cash'),
           COALESCE(p->>'currency','CUP'),
           COALESCE((p->>'amount')::numeric,0),
           COALESCE((p->>'amount')::numeric,0) * COALESCE((p->>'exchange_rate')::numeric,1),
           COALESCE((p->>'exchange_rate')::numeric,1)
    FROM jsonb_array_elements(p_payments) p
    WHERE COALESCE((p->>'amount')::numeric,0) > 0;

    IF v_o.customer_id IS NOT NULL THEN
      INSERT INTO account_payments (tenant_id, party_type, party_id, reference_type, reference_id,
        direction, method, currency, amount, amount_in_base, exchange_rate, performed_by)
      SELECT v_o.tenant_id, 'customer', v_o.customer_id, 'sale', v_sale_id, 'in',
             COALESCE(p->>'method', v_o.payment_method,'cash'), COALESCE(p->>'currency','CUP'),
             COALESCE((p->>'amount')::numeric,0),
             COALESCE((p->>'amount')::numeric,0) * COALESCE((p->>'exchange_rate')::numeric,1),
             COALESCE((p->>'exchange_rate')::numeric,1), auth.uid()
      FROM jsonb_array_elements(p_payments) p
      WHERE COALESCE((p->>'amount')::numeric,0) > 0;
    END IF;
  END IF;

  BEGIN
    PERFORM process_sale_stock(v_sale_id,
      CASE WHEN v_o.store_id IS NOT NULL THEN 'store' ELSE 'tenant' END,
      COALESCE(v_o.store_id, v_o.tenant_id));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'process_sale_stock falló para venta online %: %', v_sale_id, SQLERRM;
  END;

  UPDATE online_orders
     SET sale_id = v_sale_id, status = 'confirmed', confirmed_at = now(), updated_at = now()
   WHERE id = v_o.id;

  IF v_o.delivery_type = 'delivery'
     AND NOT EXISTS (SELECT 1 FROM delivery_assignments
                     WHERE online_order_id = v_o.id AND status NOT IN ('cancelled','rejected')) THEN
    SELECT * INTO v_store FROM stores
     WHERE id = v_o.store_id
        OR (v_o.store_id IS NULL AND tenant_id = v_o.tenant_id)
     ORDER BY created_at LIMIT 1;

    INSERT INTO delivery_assignments (tenant_id, online_order_id, zone_id, status,
      pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
      instructions, requested_at)
    VALUES (v_o.tenant_id, v_o.id, v_o.zone_id, 'pending',
      v_store.address, COALESCE(v_store.latitude, v_store.geo_lat), COALESCE(v_store.longitude, v_store.geo_lng),
      v_o.delivery_address, v_o.delivery_lat, v_o.delivery_lng, v_o.delivery_instructions, now());
  END IF;

  RETURN v_sale_id;
END $function$;
