ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_user_uidx ON public.customers (tenant_id, user_id) WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.place_online_order(
  p_tenant_id uuid,
  p_items jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text DEFAULT NULL,
  p_delivery_type text DEFAULT 'pickup',
  p_delivery_address text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order_id uuid;
  v_customer_id uuid;
  v_item jsonb;
  v_pid uuid;
  v_qty numeric;
  v_price numeric;
  v_name text;
  v_stock numeric;
  v_is_online boolean;
  v_is_active boolean;
  v_subtotal numeric := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para realizar un pedido';
  END IF;
  IF p_tenant_id IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Datos de pedido inválidos';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := COALESCE((v_item->>'qty')::numeric, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;

    SELECT name, price, online_stock, is_online, is_active
      INTO v_name, v_price, v_stock, v_is_online, v_is_active
      FROM public.products
      WHERE id = v_pid AND tenant_id = p_tenant_id
      FOR UPDATE;

    IF v_name IS NULL THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
    IF NOT COALESCE(v_is_online,false) OR NOT COALESCE(v_is_active,false) THEN
      RAISE EXCEPTION 'Producto % no está disponible online', v_name;
    END IF;
    IF v_stock < v_qty THEN
      RAISE EXCEPTION 'Stock insuficiente para %: disponible %, solicitado %', v_name, v_stock, v_qty;
    END IF;
    v_subtotal := v_subtotal + (v_price * v_qty);
  END LOOP;

  -- El comprador se convierte en cliente del negocio donde compra
  SELECT id INTO v_customer_id
    FROM public.customers
    WHERE tenant_id = p_tenant_id AND user_id = v_uid
    LIMIT 1;

  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (tenant_id, user_id, name, phone, email, address, notes)
    VALUES (
      p_tenant_id, v_uid, trim(p_customer_name), trim(p_customer_phone),
      NULLIF(trim(p_customer_email),''),
      CASE WHEN p_delivery_type = 'delivery' THEN p_delivery_address ELSE NULL END,
      'Cliente registrado desde el marketplace'
    )
    RETURNING id INTO v_customer_id;
  ELSE
    UPDATE public.customers
      SET name = COALESCE(NULLIF(trim(p_customer_name),''), name),
          phone = COALESCE(NULLIF(trim(p_customer_phone),''), phone),
          email = COALESCE(NULLIF(trim(p_customer_email),''), email),
          address = CASE WHEN p_delivery_type = 'delivery' AND p_delivery_address IS NOT NULL
                         THEN p_delivery_address ELSE address END,
          updated_at = now()
      WHERE id = v_customer_id;
  END IF;

  INSERT INTO public.online_orders (
    tenant_id, user_id, customer_id, customer_name, customer_email, customer_phone,
    delivery_type, delivery_address, subtotal, total, notes, status
  ) VALUES (
    p_tenant_id, v_uid, v_customer_id, trim(p_customer_name), NULLIF(trim(p_customer_email),''), trim(p_customer_phone),
    COALESCE(p_delivery_type,'pickup'),
    CASE WHEN p_delivery_type = 'delivery' THEN p_delivery_address ELSE NULL END,
    v_subtotal, v_subtotal, NULLIF(trim(p_notes),''), 'pending'
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::numeric;
    SELECT name, price INTO v_name, v_price FROM public.products WHERE id = v_pid;

    INSERT INTO public.online_order_items (order_id, product_id, product_name, qty, price, total)
    VALUES (v_order_id, v_pid, v_name, v_qty, v_price, v_price * v_qty);

    UPDATE public.products
      SET online_stock = online_stock - v_qty,
          updated_at = now()
      WHERE id = v_pid;
  END LOOP;

  RETURN v_order_id;
END $$;