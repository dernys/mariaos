-- ============ 1. PEDIDO ONLINE (v2) ============
CREATE OR REPLACE FUNCTION public.place_online_order(
  p_tenant_id uuid,
  p_items jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text DEFAULT NULL,
  p_delivery_type text DEFAULT 'pickup',
  p_delivery_address text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_payment_method text DEFAULT 'cash_on_delivery',
  p_store_id uuid DEFAULT NULL,
  p_zone_id uuid DEFAULT NULL,
  p_delivery_lat numeric DEFAULT NULL,
  p_delivery_lng numeric DEFAULT NULL,
  p_delivery_instructions text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_order_id uuid;
  v_customer_id uuid;
  v_item jsonb;
  v_pid uuid; v_qty numeric; v_price numeric; v_name text; v_stock numeric;
  v_is_online boolean; v_is_active boolean;
  v_subtotal numeric := 0; v_fee numeric := 0; v_store uuid := p_store_id;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión para realizar un pedido'; END IF;
  IF p_tenant_id IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'Datos de pedido inválidos'; END IF;
  IF p_delivery_type = 'delivery' AND COALESCE(trim(p_delivery_address),'') = '' THEN
    RAISE EXCEPTION 'La dirección de entrega es obligatoria';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := COALESCE((v_item->>'qty')::numeric, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
    SELECT name, price, online_stock, is_online, is_active
      INTO v_name, v_price, v_stock, v_is_online, v_is_active
      FROM products WHERE id = v_pid AND tenant_id = p_tenant_id FOR UPDATE;
    IF v_name IS NULL THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
    IF NOT COALESCE(v_is_online,false) OR NOT COALESCE(v_is_active,false) THEN
      RAISE EXCEPTION 'Producto % no está disponible online', v_name;
    END IF;
    IF v_stock < v_qty THEN
      RAISE EXCEPTION 'Stock insuficiente para %: disponible %, solicitado %', v_name, v_stock, v_qty;
    END IF;
    v_subtotal := v_subtotal + (v_price * v_qty);
  END LOOP;

  IF v_store IS NULL THEN
    SELECT id INTO v_store FROM stores
     WHERE tenant_id = p_tenant_id AND is_active
     ORDER BY created_at LIMIT 1;
  END IF;

  IF p_delivery_type = 'delivery' AND p_zone_id IS NOT NULL THEN
    SELECT COALESCE(fee,0) INTO v_fee FROM delivery_zones WHERE id = p_zone_id AND tenant_id = p_tenant_id;
  END IF;
  v_fee := COALESCE(v_fee, 0);

  SELECT id INTO v_customer_id FROM customers
   WHERE tenant_id = p_tenant_id AND user_id = v_uid LIMIT 1;

  IF v_customer_id IS NULL THEN
    INSERT INTO customers (tenant_id, user_id, name, phone, email, address, notes)
    VALUES (p_tenant_id, v_uid, trim(p_customer_name), trim(p_customer_phone),
            NULLIF(trim(p_customer_email),''),
            CASE WHEN p_delivery_type = 'delivery' THEN p_delivery_address END,
            'Cliente registrado desde el marketplace')
    RETURNING id INTO v_customer_id;
  ELSE
    UPDATE customers SET
      name = COALESCE(NULLIF(trim(p_customer_name),''), name),
      phone = COALESCE(NULLIF(trim(p_customer_phone),''), phone),
      email = COALESCE(NULLIF(trim(p_customer_email),''), email),
      address = CASE WHEN p_delivery_type='delivery' AND p_delivery_address IS NOT NULL THEN p_delivery_address ELSE address END,
      updated_at = now()
    WHERE id = v_customer_id;
  END IF;

  INSERT INTO online_orders (
    tenant_id, user_id, customer_id, customer_name, customer_email, customer_phone,
    delivery_type, delivery_address, subtotal, total, notes, status, store_id,
    payment_method, delivery_fee, zone_id, delivery_lat, delivery_lng, delivery_instructions
  ) VALUES (
    p_tenant_id, v_uid, v_customer_id, trim(p_customer_name), NULLIF(trim(p_customer_email),''), trim(p_customer_phone),
    COALESCE(p_delivery_type,'pickup'),
    CASE WHEN p_delivery_type='delivery' THEN p_delivery_address END,
    v_subtotal, v_subtotal + v_fee, NULLIF(trim(p_notes),''), 'pending', v_store,
    COALESCE(p_payment_method,'cash_on_delivery'), v_fee, p_zone_id, p_delivery_lat, p_delivery_lng,
    NULLIF(trim(p_delivery_instructions),'')
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::numeric;
    SELECT name, price INTO v_name, v_price FROM products WHERE id = v_pid;
    INSERT INTO online_order_items (order_id, product_id, product_name, qty, price, total)
    VALUES (v_order_id, v_pid, v_name, v_qty, v_price, v_price * v_qty);
    UPDATE products SET online_stock = online_stock - v_qty, updated_at = now() WHERE id = v_pid;
  END LOOP;

  RETURN v_order_id;
END $function$;

-- ============ 2. CONFIRMACIÓN → VENTA ONLINE ============
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
  v_pay jsonb;
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
     AND (store_id = v_o.store_id OR v_o.store_id IS NULL)
   ORDER BY opened_at DESC LIMIT 1;

  INSERT INTO sales (tenant_id, customer_id, subtotal, tax, total, amount_paid, status,
                     notes, store_id, shift_id, channel, fulfillment, online_order_id)
  VALUES (v_o.tenant_id, v_o.customer_id, v_o.subtotal + COALESCE(v_o.delivery_fee,0),
          COALESCE(v_o.tax,0), v_o.total, v_paid, v_status,
          COALESCE(v_o.notes,'') , v_o.store_id, v_shift, 'online',
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

  IF v_o.delivery_type = 'delivery' THEN
    INSERT INTO delivery_assignments (tenant_id, online_order_id, zone_id, status,
      pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
      instructions, requested_at)
    SELECT v_o.tenant_id, v_o.id, v_o.zone_id, 'pending',
           s.address, COALESCE(s.latitude, s.geo_lat), COALESCE(s.longitude, s.geo_lng),
           v_o.delivery_address, v_o.delivery_lat, v_o.delivery_lng,
           v_o.delivery_instructions, now()
    FROM (SELECT * FROM stores WHERE id = v_o.store_id
          UNION ALL SELECT * FROM stores WHERE v_o.store_id IS NULL AND tenant_id = v_o.tenant_id LIMIT 1) s
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_sale_id;
END $function$;

-- ============ 3. ESTADOS DEL PEDIDO ============
CREATE OR REPLACE FUNCTION public.set_online_order_status(
  p_order_id uuid, p_status text, p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_o online_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_o FROM online_orders WHERE id = p_order_id FOR UPDATE;
  IF v_o.id IS NULL THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF NOT (is_superadmin(auth.uid()) OR is_tenant_member(v_o.tenant_id)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF p_status NOT IN ('pending','confirmed','preparing','ready','rider_assigned','in_transit','delivered','cancelled') THEN
    RAISE EXCEPTION 'Estado inválido: %', p_status;
  END IF;

  UPDATE online_orders SET
    status = p_status,
    ready_at = CASE WHEN p_status='ready' THEN now() ELSE ready_at END,
    delivered_at = CASE WHEN p_status='delivered' THEN now() ELSE delivered_at END,
    cancelled_at = CASE WHEN p_status='cancelled' THEN now() ELSE cancelled_at END,
    cancel_reason = CASE WHEN p_status='cancelled' THEN p_reason ELSE cancel_reason END,
    updated_at = now()
  WHERE id = p_order_id;

  IF p_status = 'cancelled' THEN
    UPDATE products p SET online_stock = p.online_stock + oi.qty
      FROM online_order_items oi WHERE oi.order_id = p_order_id AND oi.product_id = p.id;
    UPDATE delivery_assignments SET status='cancelled', cancelled_at = now(), cancel_reason = p_reason
      WHERE online_order_id = p_order_id AND status NOT IN ('delivered','cancelled');
  END IF;
END $function$;

-- ============ 4. REPARTIDORES ============
CREATE OR REPLACE FUNCTION public.apply_as_rider(
  p_full_name text, p_phone text, p_vehicle_type text,
  p_email text DEFAULT NULL, p_document_id text DEFAULT NULL,
  p_vehicle_plate text DEFAULT NULL, p_vehicle_details text DEFAULT NULL,
  p_experience_years numeric DEFAULT 0, p_preferred_zone text DEFAULT NULL,
  p_bio text DEFAULT NULL, p_avatar_url text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión'; END IF;
  INSERT INTO rider_profiles (user_id, full_name, phone, email, avatar_url, document_id,
    vehicle_type, vehicle_plate, vehicle_details, experience_years, preferred_zone, bio, status)
  VALUES (v_uid, trim(p_full_name), trim(p_phone), NULLIF(trim(p_email),''), p_avatar_url, p_document_id,
    COALESCE(p_vehicle_type,'bike'), p_vehicle_plate, p_vehicle_details,
    COALESCE(p_experience_years,0), p_preferred_zone, p_bio, 'pending')
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, email = EXCLUDED.email,
    avatar_url = COALESCE(EXCLUDED.avatar_url, rider_profiles.avatar_url),
    document_id = EXCLUDED.document_id, vehicle_type = EXCLUDED.vehicle_type,
    vehicle_plate = EXCLUDED.vehicle_plate, vehicle_details = EXCLUDED.vehicle_details,
    experience_years = EXCLUDED.experience_years, preferred_zone = EXCLUDED.preferred_zone,
    bio = EXCLUDED.bio,
    status = CASE WHEN rider_profiles.status IN ('rejected','pending') THEN 'pending' ELSE rider_profiles.status END,
    updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.review_rider_application(
  p_rider_id uuid, p_status text, p_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (is_superadmin(auth.uid()) OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gerente')) THEN
    RAISE EXCEPTION 'No autorizado para revisar solicitudes';
  END IF;
  IF p_status NOT IN ('pending','reviewing','approved','rejected','suspended') THEN
    RAISE EXCEPTION 'Estado inválido';
  END IF;
  UPDATE rider_profiles SET
    status = p_status,
    availability = CASE WHEN p_status <> 'approved' THEN 'unavailable' ELSE availability END,
    reviewed_by = auth.uid(), reviewed_at = now(), review_notes = p_notes, updated_at = now()
  WHERE id = p_rider_id;
END $function$;

CREATE OR REPLACE FUNCTION public.set_rider_availability(p_availability text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_status text;
BEGIN
  IF p_availability NOT IN ('available','unavailable','busy','paused') THEN
    RAISE EXCEPTION 'Disponibilidad inválida';
  END IF;
  SELECT status INTO v_status FROM rider_profiles WHERE user_id = auth.uid();
  IF v_status IS NULL THEN RAISE EXCEPTION 'No tienes perfil de repartidor'; END IF;
  IF v_status <> 'approved' AND p_availability = 'available' THEN
    RAISE EXCEPTION 'Tu perfil debe estar aprobado para estar disponible';
  END IF;
  UPDATE rider_profiles SET availability = p_availability, updated_at = now() WHERE user_id = auth.uid();
END $function$;

CREATE OR REPLACE FUNCTION public.update_rider_location(
  p_lat numeric, p_lng numeric, p_heading numeric DEFAULT NULL,
  p_speed numeric DEFAULT NULL, p_accuracy numeric DEFAULT NULL, p_battery numeric DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_rider rider_profiles%ROWTYPE; v_assignment uuid; v_tenant uuid;
BEGIN
  SELECT * INTO v_rider FROM rider_profiles WHERE user_id = auth.uid();
  IF v_rider.id IS NULL THEN RAISE EXCEPTION 'No tienes perfil de repartidor'; END IF;

  UPDATE rider_profiles SET current_lat = p_lat, current_lng = p_lng,
    location_updated_at = now(), updated_at = now() WHERE id = v_rider.id;

  SELECT id, tenant_id INTO v_assignment, v_tenant FROM delivery_assignments
   WHERE rider_profile_id = v_rider.id AND status IN ('accepted','picked_up','in_transit')
   ORDER BY assigned_at DESC LIMIT 1;

  IF v_assignment IS NOT NULL THEN
    INSERT INTO driver_locations (tenant_id, rider_id, assignment_id, latitude, longitude,
      accuracy, heading, speed, battery, recorded_at)
    VALUES (v_tenant, NULL, v_assignment, p_lat, p_lng, p_accuracy, p_heading, p_speed, p_battery, now());
  END IF;
END $function$;

-- ============ 5. RECOMENDACIONES ============
CREATE OR REPLACE FUNCTION public.recommend_riders_for_order(p_order_id uuid, p_limit integer DEFAULT 5)
RETURNS TABLE (
  rider_profile_id uuid, full_name text, avatar_url text, vehicle_type text,
  rating_avg numeric, deliveries_completed integer, acceptance_rate numeric,
  punctuality numeric, distance_km numeric, active_deliveries integer,
  score numeric, reasons jsonb
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_o online_orders%ROWTYPE; v_plat numeric; v_plng numeric;
BEGIN
  SELECT * INTO v_o FROM online_orders WHERE id = p_order_id;
  IF v_o.id IS NULL THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF NOT (is_superadmin(auth.uid()) OR is_tenant_member(v_o.tenant_id)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT COALESCE(s.latitude, s.geo_lat), COALESCE(s.longitude, s.geo_lng)
    INTO v_plat, v_plng FROM stores s WHERE s.id = v_o.store_id;

  RETURN QUERY
  WITH candidates AS (
    SELECT r.*,
      (SELECT count(*) FROM delivery_assignments da
        WHERE da.rider_profile_id = r.id AND da.status IN ('assigned','accepted','picked_up','in_transit')) AS active_cnt,
      CASE WHEN v_plat IS NOT NULL AND r.current_lat IS NOT NULL
           THEN distance_km(r.current_lat, r.current_lng, v_plat, v_plng) END AS dist_pickup,
      CASE WHEN v_o.delivery_lat IS NOT NULL AND r.current_lat IS NOT NULL
           THEN distance_km(r.current_lat, r.current_lng, v_o.delivery_lat, v_o.delivery_lng) END AS dist_drop
    FROM rider_profiles r
    WHERE r.status = 'approved' AND r.availability = 'available'
  ), scored AS (
    SELECT c.*,
      CASE WHEN c.offers_received > 0 THEN round(c.offers_accepted::numeric / c.offers_received * 100, 1) ELSE 100 END AS acc_rate,
      CASE WHEN c.deliveries_completed > 0 THEN round(c.on_time_deliveries::numeric / c.deliveries_completed * 100, 1) ELSE 100 END AS punct,
      round(
        (CASE WHEN c.dist_pickup IS NULL THEN 20 ELSE greatest(0, 40 - least(c.dist_pickup, 20) * 2) END)
        + (CASE WHEN c.dist_drop IS NULL THEN 5 ELSE greatest(0, 15 - least(c.dist_drop, 15)) END)
        + least(c.rating_avg, 5) * 4
        + least(c.deliveries_completed, 200) * 0.05
        + least(c.experience_years, 5) * 1
        + greatest(0, (c.max_active_deliveries - c.active_cnt)) * 3
        + CASE WHEN v_o.delivery_address IS NOT NULL AND c.preferred_zone IS NOT NULL
                    AND v_o.delivery_address ILIKE '%' || c.preferred_zone || '%' THEN 10 ELSE 0 END
      , 1) AS raw_score
    FROM candidates c
    WHERE c.active_cnt < c.max_active_deliveries
  )
  SELECT s.id, s.full_name, s.avatar_url, s.vehicle_type, s.rating_avg, s.deliveries_completed,
    s.acc_rate, s.punct, round(s.dist_pickup, 2), s.active_cnt::integer,
    least(s.raw_score, 100),
    jsonb_build_object(
      'distance_pickup_km', round(COALESCE(s.dist_pickup, -1), 2),
      'distance_dropoff_km', round(COALESCE(s.dist_drop, -1), 2),
      'active_deliveries', s.active_cnt,
      'rating', s.rating_avg,
      'completed', s.deliveries_completed,
      'acceptance_rate', s.acc_rate,
      'punctuality', s.punct,
      'zone_match', (v_o.delivery_address IS NOT NULL AND s.preferred_zone IS NOT NULL
                     AND v_o.delivery_address ILIKE '%' || s.preferred_zone || '%'),
      'available', true
    )
  FROM scored s
  ORDER BY least(s.raw_score, 100) DESC NULLS LAST
  LIMIT COALESCE(p_limit, 5);
END $function$;

CREATE OR REPLACE FUNCTION public.recommend_orders_for_rider(p_limit integer DEFAULT 10)
RETURNS TABLE (
  assignment_id uuid, online_order_id uuid, tenant_id uuid, business_name text,
  pickup_address text, dropoff_address text, total numeric, delivery_fee numeric,
  distance_to_pickup numeric, extra_distance numeric, score numeric, reasons jsonb
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_r rider_profiles%ROWTYPE; v_active integer;
BEGIN
  SELECT * INTO v_r FROM rider_profiles WHERE user_id = auth.uid();
  IF v_r.id IS NULL OR v_r.status <> 'approved' THEN RETURN; END IF;
  IF v_r.availability NOT IN ('available','busy') THEN RETURN; END IF;

  SELECT count(*) INTO v_active FROM delivery_assignments
   WHERE rider_profile_id = v_r.id AND status IN ('assigned','accepted','picked_up','in_transit');
  IF v_active >= v_r.max_active_deliveries THEN RETURN; END IF;

  RETURN QUERY
  WITH open_jobs AS (
    SELECT da.id, da.online_order_id, da.tenant_id, t.name AS biz,
           da.pickup_address, da.dropoff_address, o.total, o.delivery_fee,
           CASE WHEN v_r.current_lat IS NOT NULL AND da.pickup_lat IS NOT NULL
                THEN distance_km(v_r.current_lat, v_r.current_lng, da.pickup_lat, da.pickup_lng) END AS d_pick,
           CASE WHEN da.pickup_lat IS NOT NULL AND da.dropoff_lat IS NOT NULL
                THEN distance_km(da.pickup_lat, da.pickup_lng, da.dropoff_lat, da.dropoff_lng) END AS d_leg
    FROM delivery_assignments da
    JOIN online_orders o ON o.id = da.online_order_id
    JOIN tenants t ON t.id = da.tenant_id
    WHERE (da.status = 'pending' OR (da.status = 'assigned' AND da.rider_profile_id = v_r.id))
      AND o.status NOT IN ('cancelled','delivered')
  )
  SELECT j.id, j.online_order_id, j.tenant_id, j.biz, j.pickup_address, j.dropoff_address,
         j.total, j.delivery_fee, round(j.d_pick, 2), round(COALESCE(j.d_leg,0), 2),
         round(least(100, greatest(0, 60 - COALESCE(j.d_pick, 10) * 4)
               + greatest(0, 25 - COALESCE(j.d_leg, 5) * 2)
               + least(COALESCE(j.delivery_fee,0), 200) * 0.05), 1),
         jsonb_build_object(
           'distance_to_pickup_km', round(COALESCE(j.d_pick,-1),2),
           'leg_distance_km', round(COALESCE(j.d_leg,-1),2),
           'active_deliveries', v_active,
           'fee', COALESCE(j.delivery_fee,0)
         )
  FROM open_jobs j
  ORDER BY 11 DESC NULLS LAST
  LIMIT COALESCE(p_limit, 10);
END $function$;

-- ============ 6. ASIGNACIÓN Y SEGUIMIENTO ============
CREATE OR REPLACE FUNCTION public.request_delivery_assignment(
  p_order_id uuid, p_rider_profile_id uuid,
  p_score numeric DEFAULT NULL, p_reasons jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_o online_orders%ROWTYPE; v_a delivery_assignments%ROWTYPE; v_rider rider_profiles%ROWTYPE; v_id uuid;
BEGIN
  SELECT * INTO v_o FROM online_orders WHERE id = p_order_id;
  IF v_o.id IS NULL THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF NOT (is_superadmin(auth.uid()) OR is_tenant_member(v_o.tenant_id)) THEN RAISE EXCEPTION 'No autorizado'; END IF;

  SELECT * INTO v_rider FROM rider_profiles WHERE id = p_rider_profile_id;
  IF v_rider.id IS NULL OR v_rider.status <> 'approved' THEN RAISE EXCEPTION 'El repartidor no está aprobado'; END IF;
  IF v_rider.availability NOT IN ('available','busy') THEN RAISE EXCEPTION 'El repartidor no está disponible'; END IF;
  IF (SELECT count(*) FROM delivery_assignments WHERE rider_profile_id = v_rider.id
       AND status IN ('assigned','accepted','picked_up','in_transit')) >= v_rider.max_active_deliveries THEN
    RAISE EXCEPTION 'El repartidor alcanzó su capacidad máxima';
  END IF;

  SELECT * INTO v_a FROM delivery_assignments
   WHERE online_order_id = p_order_id AND status NOT IN ('cancelled','rejected') FOR UPDATE;

  IF v_a.id IS NULL THEN
    INSERT INTO delivery_assignments (tenant_id, online_order_id, zone_id, status, rider_profile_id,
      pickup_address, dropoff_address, dropoff_lat, dropoff_lng, instructions,
      requested_at, assigned_at, recommendation_score, recommendation_reasons)
    VALUES (v_o.tenant_id, v_o.id, v_o.zone_id, 'assigned', p_rider_profile_id,
      (SELECT address FROM stores WHERE id = v_o.store_id),
      v_o.delivery_address, v_o.delivery_lat, v_o.delivery_lng, v_o.delivery_instructions,
      now(), now(), p_score, p_reasons)
    RETURNING id INTO v_id;
  ELSE
    IF v_a.status IN ('accepted','picked_up','in_transit','delivered') THEN
      RAISE EXCEPTION 'La entrega ya tiene un repartidor activo';
    END IF;
    UPDATE delivery_assignments SET rider_profile_id = p_rider_profile_id, status = 'assigned',
      assigned_at = now(), recommendation_score = p_score, recommendation_reasons = p_reasons
     WHERE id = v_a.id RETURNING id INTO v_id;
  END IF;

  UPDATE rider_profiles SET offers_received = offers_received + 1, updated_at = now() WHERE id = p_rider_profile_id;
  UPDATE online_orders SET status = 'rider_assigned', updated_at = now()
   WHERE id = p_order_id AND status IN ('pending','confirmed','preparing','ready');

  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.rider_respond_assignment(p_assignment_id uuid, p_accept boolean, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_rider rider_profiles%ROWTYPE; v_a delivery_assignments%ROWTYPE;
BEGIN
  SELECT * INTO v_rider FROM rider_profiles WHERE user_id = auth.uid();
  IF v_rider.id IS NULL THEN RAISE EXCEPTION 'No tienes perfil de repartidor'; END IF;

  SELECT * INTO v_a FROM delivery_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF v_a.id IS NULL THEN RAISE EXCEPTION 'Entrega no encontrada'; END IF;
  IF v_a.rider_profile_id IS DISTINCT FROM v_rider.id THEN RAISE EXCEPTION 'Esta entrega no está asignada a ti'; END IF;
  IF v_a.status <> 'assigned' THEN RAISE EXCEPTION 'La entrega ya no puede aceptarse'; END IF;

  IF p_accept THEN
    UPDATE delivery_assignments SET status='accepted', accepted_at = now() WHERE id = p_assignment_id;
    UPDATE rider_profiles SET offers_accepted = offers_accepted + 1, availability = 'busy', updated_at = now()
      WHERE id = v_rider.id;
  ELSE
    UPDATE delivery_assignments SET status='rejected', rejected_at = now(), cancel_reason = p_reason,
      rider_profile_id = NULL WHERE id = p_assignment_id;
    UPDATE online_orders SET status = 'ready', updated_at = now()
      WHERE id = v_a.online_order_id AND status = 'rider_assigned';
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.rider_advance_delivery(p_assignment_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_rider rider_profiles%ROWTYPE; v_a delivery_assignments%ROWTYPE; v_minutes integer;
BEGIN
  SELECT * INTO v_rider FROM rider_profiles WHERE user_id = auth.uid();
  SELECT * INTO v_a FROM delivery_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF v_a.id IS NULL THEN RAISE EXCEPTION 'Entrega no encontrada'; END IF;
  IF NOT (is_superadmin(auth.uid()) OR is_tenant_member(v_a.tenant_id)
          OR (v_rider.id IS NOT NULL AND v_a.rider_profile_id = v_rider.id)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF p_status NOT IN ('picked_up','in_transit','delivered','cancelled') THEN RAISE EXCEPTION 'Estado inválido'; END IF;

  IF p_status = 'delivered' THEN
    v_minutes := GREATEST(1, EXTRACT(EPOCH FROM (now() - COALESCE(v_a.accepted_at, v_a.assigned_at)))/60)::integer;
    UPDATE delivery_assignments SET status='delivered', delivered_at = now(), actual_minutes = v_minutes
      WHERE id = p_assignment_id;
    UPDATE online_orders SET status='delivered', delivered_at = now(), updated_at = now()
      WHERE id = v_a.online_order_id;
    UPDATE rider_profiles SET deliveries_completed = deliveries_completed + 1,
      on_time_deliveries = on_time_deliveries + CASE WHEN v_a.estimated_minutes IS NULL OR v_minutes <= v_a.estimated_minutes THEN 1 ELSE 0 END,
      availability = 'available', updated_at = now()
      WHERE id = v_a.rider_profile_id;
  ELSIF p_status = 'cancelled' THEN
    UPDATE delivery_assignments SET status='cancelled', cancelled_at = now() WHERE id = p_assignment_id;
    UPDATE rider_profiles SET deliveries_cancelled = deliveries_cancelled + 1,
      availability = 'available', updated_at = now() WHERE id = v_a.rider_profile_id;
    UPDATE online_orders SET status='ready', updated_at = now()
      WHERE id = v_a.online_order_id AND status IN ('rider_assigned','in_transit');
  ELSE
    UPDATE delivery_assignments SET status = p_status,
      picked_up_at = CASE WHEN p_status='picked_up' THEN now() ELSE picked_up_at END
      WHERE id = p_assignment_id;
    UPDATE online_orders SET status = CASE WHEN p_status='in_transit' THEN 'in_transit' ELSE status END,
      updated_at = now() WHERE id = v_a.online_order_id;
  END IF;
END $function$;

-- ============ 7. VALORACIONES ============
CREATE OR REPLACE FUNCTION public.rate_delivery(
  p_order_id uuid, p_rater_role text, p_ratee_role text, p_stars numeric,
  p_criteria jsonb DEFAULT '{}'::jsonb, p_comment text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_o online_orders%ROWTYPE; v_a delivery_assignments%ROWTYPE; v_id uuid; v_rider uuid;
BEGIN
  SELECT * INTO v_o FROM online_orders WHERE id = p_order_id;
  IF v_o.id IS NULL THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF v_o.status <> 'delivered' THEN RAISE EXCEPTION 'Sólo puedes valorar pedidos entregados'; END IF;

  SELECT * INTO v_a FROM delivery_assignments WHERE online_order_id = p_order_id AND status='delivered'
   ORDER BY delivered_at DESC LIMIT 1;

  IF p_rater_role = 'customer' THEN
    IF v_o.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'No participaste en esta compra'; END IF;
  ELSIF p_rater_role = 'business' THEN
    IF NOT (is_superadmin(auth.uid()) OR is_tenant_member(v_o.tenant_id)) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  ELSIF p_rater_role = 'rider' THEN
    SELECT id INTO v_rider FROM rider_profiles WHERE user_id = auth.uid();
    IF v_rider IS NULL OR v_a.rider_profile_id IS DISTINCT FROM v_rider THEN
      RAISE EXCEPTION 'No realizaste esta entrega';
    END IF;
  ELSE
    RAISE EXCEPTION 'Rol inválido';
  END IF;

  IF p_ratee_role = 'rider' AND v_a.rider_profile_id IS NULL THEN
    RAISE EXCEPTION 'Este pedido no tuvo repartidor';
  END IF;

  INSERT INTO delivery_ratings (tenant_id, online_order_id, assignment_id, rider_profile_id,
    rater_role, ratee_role, rater_user_id, stars, criteria, comment)
  VALUES (v_o.tenant_id, v_o.id, v_a.id,
    CASE WHEN p_ratee_role='rider' THEN v_a.rider_profile_id END,
    p_rater_role, p_ratee_role, auth.uid(), p_stars, COALESCE(p_criteria,'{}'::jsonb), p_comment)
  RETURNING id INTO v_id;

  IF p_ratee_role = 'rider' THEN
    UPDATE rider_profiles r SET
      rating_avg = sub.avg_stars, ratings_count = sub.cnt, updated_at = now()
    FROM (SELECT round(avg(stars),2) avg_stars, count(*)::integer cnt
          FROM delivery_ratings WHERE rider_profile_id = v_a.rider_profile_id AND ratee_role='rider') sub
    WHERE r.id = v_a.rider_profile_id;
  END IF;

  RETURN v_id;
END $function$;

-- ============ 8. REPORTES POR CANAL ============
CREATE OR REPLACE FUNCTION public.sales_channel_summary(
  p_tenant_id uuid, p_from timestamptz DEFAULT now() - interval '30 days', p_to timestamptz DEFAULT now()
) RETURNS TABLE (
  channel text, fulfillment text, sales_count bigint, amount numeric,
  avg_ticket numeric, customers bigint, returns_count bigint, returns_amount numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT s.channel, s.fulfillment, count(*)::bigint, COALESCE(sum(s.total),0),
         round(COALESCE(avg(s.total),0),2), count(DISTINCT s.customer_id)::bigint,
         COALESCE((SELECT count(*) FROM sale_returns sr WHERE sr.sale_id IN (
            SELECT id FROM sales x WHERE x.tenant_id = p_tenant_id AND x.channel = s.channel AND x.fulfillment = s.fulfillment
              AND x.created_at BETWEEN p_from AND p_to)),0)::bigint,
         COALESCE((SELECT sum(sr.total) FROM sale_returns sr WHERE sr.sale_id IN (
            SELECT id FROM sales x WHERE x.tenant_id = p_tenant_id AND x.channel = s.channel AND x.fulfillment = s.fulfillment
              AND x.created_at BETWEEN p_from AND p_to)),0)
  FROM sales s
  WHERE s.tenant_id = p_tenant_id
    AND s.created_at BETWEEN p_from AND p_to
    AND s.status <> 'cancelled'
    AND (is_superadmin(auth.uid()) OR is_tenant_member(p_tenant_id))
  GROUP BY s.channel, s.fulfillment;
$function$;
