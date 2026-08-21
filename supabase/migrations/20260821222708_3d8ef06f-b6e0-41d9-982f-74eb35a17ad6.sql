-- 1. Estructura: idempotencia, agrupación y descuentos
ALTER TABLE public.online_orders
  ADD COLUMN IF NOT EXISTS order_group_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_code text;

CREATE UNIQUE INDEX IF NOT EXISTS online_orders_idempotency_uidx
  ON public.online_orders (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS online_orders_group_idx ON public.online_orders (order_group_id);

-- 2. Frontera de escritura: el comprador nunca inserta pedidos directamente
DROP POLICY IF EXISTS "Authenticated users can create own orders" ON public.online_orders;
DROP POLICY IF EXISTS "Users can insert their own online orders" ON public.online_orders;
DROP POLICY IF EXISTS "Users can insert own order items" ON public.online_order_items;
REVOKE INSERT, UPDATE, DELETE ON public.online_orders FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.online_order_items FROM authenticated;
GRANT SELECT ON public.online_orders TO authenticated;
GRANT SELECT ON public.online_order_items TO authenticated;
GRANT UPDATE ON public.online_orders TO authenticated; -- staff edita estados vía políticas de tenant
GRANT ALL ON public.online_orders TO service_role;
GRANT ALL ON public.online_order_items TO service_role;

-- 3. Precio efectivo de un producto con promociones activas
CREATE OR REPLACE FUNCTION public.marketplace_effective_price(_product_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_price numeric; v_tenant uuid; v_cat text; v_best numeric;
BEGIN
  SELECT price, tenant_id, category INTO v_price, v_tenant, v_cat
    FROM products WHERE id = _product_id;
  IF v_price IS NULL THEN RETURN NULL; END IF;

  SELECT max(
    CASE
      WHEN pr.promo_type = 'percentage' THEN v_price * (COALESCE(pr.discount_value,0) / 100.0)
      WHEN pr.promo_type = 'fixed' THEN LEAST(COALESCE(pr.discount_value,0), v_price)
      ELSE 0
    END)
  INTO v_best
  FROM promotions pr
  WHERE pr.tenant_id = v_tenant
    AND pr.is_active
    AND (pr.valid_from IS NULL OR pr.valid_from <= current_date)
    AND (pr.valid_until IS NULL OR pr.valid_until >= current_date)
    AND (
      pr.scope = 'all'
      OR (pr.scope = 'product' AND pr.scope_id = _product_id)
      OR (pr.scope = 'category' AND (pr.scope_value = v_cat OR pr.scope_id IN (
            SELECT c.id FROM product_categories c WHERE c.tenant_id = v_tenant AND c.name = v_cat)))
    );

  RETURN GREATEST(v_price - COALESCE(v_best, 0), 0);
END $$;

REVOKE ALL ON FUNCTION public.marketplace_effective_price(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_effective_price(uuid) TO authenticated, anon;

-- 4. Pedido multi-negocio, transaccional e idempotente
CREATE OR REPLACE FUNCTION public.place_order_group(
  p_idempotency_key text,
  p_items jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text DEFAULT NULL,
  p_delivery_type text DEFAULT 'pickup',
  p_delivery_address text DEFAULT NULL,
  p_delivery_instructions text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_zone_ids jsonb DEFAULT '{}'::jsonb,
  p_coupon_codes jsonb DEFAULT '{}'::jsonb,
  p_delivery_lat numeric DEFAULT NULL,
  p_delivery_lng numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_group uuid;
  v_tenant uuid;
  v_existing jsonb;
  v_result jsonb := '[]'::jsonb;
  v_item jsonb;
  v_order_id uuid;
  v_customer_id uuid;
  v_store uuid;
  v_zone uuid;
  v_fee numeric;
  v_subtotal numeric;
  v_discount numeric;
  v_tax numeric;
  v_total numeric;
  v_code text;
  v_coupon coupons%ROWTYPE;
  v_pid uuid; v_qty numeric; v_name text; v_price numeric; v_stock numeric;
  v_is_online boolean; v_is_active boolean; v_tax_rate numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión para realizar un pedido'; END IF;
  IF COALESCE(btrim(p_idempotency_key),'') = '' THEN RAISE EXCEPTION 'Clave de operación requerida'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El carrito está vacío';
  END IF;
  IF COALESCE(p_delivery_type,'pickup') NOT IN ('pickup','delivery') THEN
    RAISE EXCEPTION 'Modalidad de entrega inválida';
  END IF;
  IF p_delivery_type = 'delivery' AND COALESCE(btrim(p_delivery_address),'') = '' THEN
    RAISE EXCEPTION 'La dirección de entrega es obligatoria';
  END IF;
  IF COALESCE(btrim(p_customer_name),'') = '' OR COALESCE(btrim(p_customer_phone),'') = '' THEN
    RAISE EXCEPTION 'Nombre y teléfono son obligatorios';
  END IF;

  -- Idempotencia: reintento devuelve el mismo grupo
  SELECT jsonb_agg(jsonb_build_object('order_id', id, 'tenant_id', tenant_id, 'total', total)),
         min(order_group_id)
    INTO v_existing, v_group
    FROM online_orders
   WHERE user_id = v_uid AND idempotency_key = btrim(p_idempotency_key);

  IF v_group IS NOT NULL THEN
    RETURN jsonb_build_object('group_id', v_group, 'orders', COALESCE(v_existing,'[]'::jsonb), 'duplicate', true);
  END IF;

  v_group := gen_random_uuid();

  FOR v_tenant IN
    SELECT DISTINCT (i->>'tenant_id')::uuid FROM jsonb_array_elements(p_items) i
  LOOP
    PERFORM public.assert_public_tenant(v_tenant);
    v_subtotal := 0; v_discount := 0; v_tax := 0; v_fee := 0;

    SELECT id INTO v_store FROM stores
      WHERE tenant_id = v_tenant AND is_active ORDER BY created_at LIMIT 1;

    v_zone := NULLIF(p_zone_ids->>v_tenant::text, '')::uuid;
    IF COALESCE(p_delivery_type,'pickup') = 'delivery' THEN
      IF v_zone IS NOT NULL THEN
        SELECT COALESCE(fee,0) INTO v_fee FROM delivery_zones
          WHERE id = v_zone AND tenant_id = v_tenant AND is_active;
        IF v_fee IS NULL THEN RAISE EXCEPTION 'Zona de reparto inválida'; END IF;
      ELSE
        SELECT COALESCE(min(fee),0) INTO v_fee FROM delivery_zones
          WHERE tenant_id = v_tenant AND is_active;
        v_fee := COALESCE(v_fee, 0);
      END IF;
    END IF;

    -- Cliente del negocio vinculado a la cuenta del comprador
    SELECT id INTO v_customer_id FROM customers
      WHERE tenant_id = v_tenant AND user_id = v_uid LIMIT 1;
    IF v_customer_id IS NULL THEN
      INSERT INTO customers (tenant_id, user_id, name, phone, email, address, notes)
      VALUES (v_tenant, v_uid, btrim(p_customer_name), btrim(p_customer_phone),
              NULLIF(btrim(p_customer_email),''),
              CASE WHEN p_delivery_type='delivery' THEN p_delivery_address END,
              'Cliente registrado desde el marketplace')
      RETURNING id INTO v_customer_id;
    ELSE
      UPDATE customers SET
        name = COALESCE(NULLIF(btrim(p_customer_name),''), name),
        phone = COALESCE(NULLIF(btrim(p_customer_phone),''), phone),
        email = COALESCE(NULLIF(btrim(p_customer_email),''), email),
        updated_at = now()
      WHERE id = v_customer_id;
    END IF;

    INSERT INTO online_orders (
      tenant_id, user_id, customer_id, customer_name, customer_email, customer_phone,
      delivery_type, delivery_address, delivery_instructions, subtotal, tax, discount, total,
      notes, status, store_id, payment_method, delivery_fee, zone_id,
      delivery_lat, delivery_lng, order_group_id, idempotency_key
    ) VALUES (
      v_tenant, v_uid, v_customer_id, btrim(p_customer_name), NULLIF(btrim(p_customer_email),''),
      btrim(p_customer_phone), COALESCE(p_delivery_type,'pickup'),
      CASE WHEN p_delivery_type='delivery' THEN btrim(p_delivery_address) END,
      NULLIF(btrim(p_delivery_instructions),''),
      0, 0, 0, 0, NULLIF(btrim(p_notes),''), 'pending', v_store,
      'cash_on_delivery', v_fee, v_zone, p_delivery_lat, p_delivery_lng,
      v_group, btrim(p_idempotency_key)
    ) RETURNING id INTO v_order_id;

    FOR v_item IN
      SELECT i FROM jsonb_array_elements(p_items) i WHERE (i->>'tenant_id')::uuid = v_tenant
    LOOP
      v_pid := (v_item->>'product_id')::uuid;
      v_qty := COALESCE((v_item->>'qty')::numeric, 0);
      IF v_qty <= 0 OR v_qty <> floor(v_qty) THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;

      SELECT p.name, p.online_stock, p.is_online, p.is_active,
             COALESCE((SELECT tr.rate FROM tax_rates tr WHERE tr.id = p.default_tax_rate_id AND tr.is_active), 0)
        INTO v_name, v_stock, v_is_online, v_is_active, v_tax_rate
        FROM products p WHERE p.id = v_pid AND p.tenant_id = v_tenant FOR UPDATE;

      IF v_name IS NULL THEN RAISE EXCEPTION 'Producto no encontrado en este negocio'; END IF;
      IF NOT COALESCE(v_is_online,false) OR NOT COALESCE(v_is_active,false) THEN
        RAISE EXCEPTION 'El producto % no está disponible online', v_name;
      END IF;
      IF v_stock < v_qty THEN
        RAISE EXCEPTION 'Stock insuficiente para %: disponible %, solicitado %', v_name, v_stock, v_qty;
      END IF;

      v_price := public.marketplace_effective_price(v_pid);
      v_subtotal := v_subtotal + (v_price * v_qty);
      v_tax := v_tax + (v_price * v_qty * COALESCE(v_tax_rate,0) / 100.0);

      INSERT INTO online_order_items (order_id, product_id, product_name, qty, price, total)
      VALUES (v_order_id, v_pid, v_name, v_qty::integer, v_price, v_price * v_qty);

      UPDATE products SET online_stock = online_stock - v_qty, updated_at = now() WHERE id = v_pid;
    END LOOP;

    -- Cupón opcional del negocio
    v_code := NULLIF(btrim(COALESCE(p_coupon_codes->>v_tenant::text, '')), '');
    IF v_code IS NOT NULL THEN
      SELECT * INTO v_coupon FROM coupons
       WHERE tenant_id = v_tenant AND upper(code) = upper(v_code) AND is_active
         AND (valid_from IS NULL OR valid_from <= current_date)
         AND (valid_until IS NULL OR valid_until >= current_date)
       FOR UPDATE;
      IF v_coupon.id IS NULL THEN RAISE EXCEPTION 'Cupón % no válido', v_code; END IF;
      IF v_coupon.max_uses IS NOT NULL AND COALESCE(v_coupon.uses_count,0) >= v_coupon.max_uses THEN
        RAISE EXCEPTION 'El cupón % ya alcanzó su límite de usos', v_code;
      END IF;
      IF COALESCE(v_coupon.min_amount,0) > v_subtotal THEN
        RAISE EXCEPTION 'El cupón % requiere un mínimo de %', v_code, v_coupon.min_amount;
      END IF;
      v_discount := CASE
        WHEN v_coupon.discount_type = 'percentage' THEN v_subtotal * COALESCE(v_coupon.discount_value,0) / 100.0
        ELSE LEAST(COALESCE(v_coupon.discount_value,0), v_subtotal)
      END;
      UPDATE coupons SET uses_count = COALESCE(uses_count,0) + 1, updated_at = now() WHERE id = v_coupon.id;
      INSERT INTO coupon_redemptions (tenant_id, coupon_id, customer_id, discount_applied)
      VALUES (v_tenant, v_coupon.id, v_customer_id, v_discount);
    END IF;

    v_total := GREATEST(v_subtotal - v_discount, 0) + v_tax + COALESCE(v_fee,0);

    UPDATE online_orders SET
      subtotal = v_subtotal, discount = v_discount, tax = v_tax,
      total = v_total, coupon_code = v_code, updated_at = now()
    WHERE id = v_order_id;

    PERFORM log_online_order_event(v_order_id, 'created', NULL, 'pending', 'Pedido creado desde el marketplace');

    v_result := v_result || jsonb_build_object('order_id', v_order_id, 'tenant_id', v_tenant, 'total', v_total);
  END LOOP;

  RETURN jsonb_build_object('group_id', v_group, 'orders', v_result, 'duplicate', false);
END $$;

REVOKE ALL ON FUNCTION public.place_order_group(text, jsonb, text, text, text, text, text, text, text, jsonb, jsonb, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order_group(text, jsonb, text, text, text, text, text, text, text, jsonb, jsonb, numeric, numeric) TO authenticated;

-- 5. Cancelación por el comprador (devuelve stock)
CREATE OR REPLACE FUNCTION public.cancel_my_online_order(p_order_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_o online_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_o FROM online_orders WHERE id = p_order_id FOR UPDATE;
  IF v_o.id IS NULL THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF v_o.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF v_o.status NOT IN ('pending','confirmed') THEN
    RAISE EXCEPTION 'El pedido ya está en preparación y no puede cancelarse desde tu cuenta';
  END IF;
  IF v_o.sale_id IS NOT NULL THEN RAISE EXCEPTION 'El pedido ya fue facturado por el negocio'; END IF;

  UPDATE online_orders SET status = 'cancelled', cancelled_at = now(),
    cancel_reason = COALESCE(NULLIF(btrim(p_reason),''), 'Cancelado por el comprador'), updated_at = now()
  WHERE id = p_order_id;

  UPDATE products p SET online_stock = p.online_stock + oi.qty
    FROM online_order_items oi WHERE oi.order_id = p_order_id AND oi.product_id = p.id;

  UPDATE delivery_assignments SET status = 'cancelled', cancelled_at = now(),
    cancel_reason = 'Pedido cancelado por el comprador'
  WHERE online_order_id = p_order_id AND status NOT IN ('delivered','cancelled');

  PERFORM log_online_order_event(p_order_id, 'cancelled', v_o.status, 'cancelled',
    COALESCE(NULLIF(btrim(p_reason),''), 'Cancelado por el comprador'));
END $$;

REVOKE ALL ON FUNCTION public.cancel_my_online_order(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_my_online_order(uuid, text) TO authenticated;

-- 6. La RPC antigua deja de estar disponible para el cliente
REVOKE ALL ON FUNCTION public.place_online_order(p_tenant_id uuid, p_items jsonb, p_customer_name text, p_customer_phone text, p_customer_email text, p_delivery_type text, p_delivery_address text, p_notes text, p_payment_method text, p_store_id uuid, p_zone_id uuid, p_delivery_lat numeric, p_delivery_lng numeric, p_delivery_instructions text) FROM PUBLIC, anon, authenticated;