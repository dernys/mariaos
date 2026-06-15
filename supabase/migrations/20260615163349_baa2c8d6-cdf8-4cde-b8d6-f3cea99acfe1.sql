
-- BLOQUE C: Marketplace robusto
-- 1) Exigir user_id autenticado en online_orders (sin invitados)
-- 2) Eliminar cliente fantasma "Marketplace Customer"
-- 3) Función atómica place_online_order con validación de stock real

-- 1) NOT NULL user_id (limpiar nulos previos primero)
DELETE FROM public.online_order_items
  WHERE order_id IN (SELECT id FROM public.online_orders WHERE user_id IS NULL);
DELETE FROM public.online_orders WHERE user_id IS NULL;
ALTER TABLE public.online_orders ALTER COLUMN user_id SET NOT NULL;

-- Policy de INSERT: solo el dueño autenticado
DROP POLICY IF EXISTS "Users can insert their own online orders" ON public.online_orders;
CREATE POLICY "Users can insert their own online orders"
  ON public.online_orders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 2) Trigger reforzado: requiere nombre + teléfono reales, nunca crea "Cliente Marketplace"
CREATE OR REPLACE FUNCTION public.upsert_customer_for_online_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer_id uuid;
BEGIN
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Marketplace requiere usuario autenticado';
  END IF;
  IF NULLIF(trim(COALESCE(NEW.customer_name, '')), '') IS NULL
     OR NULLIF(trim(COALESCE(NEW.customer_phone, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Nombre y teléfono del cliente son obligatorios';
  END IF;

  SELECT id INTO v_customer_id FROM public.customers
    WHERE tenant_id = NEW.tenant_id AND phone = NEW.customer_phone LIMIT 1;
  IF v_customer_id IS NULL AND NEW.customer_email IS NOT NULL AND length(trim(NEW.customer_email)) > 0 THEN
    SELECT id INTO v_customer_id FROM public.customers
      WHERE tenant_id = NEW.tenant_id AND email = NEW.customer_email LIMIT 1;
  END IF;

  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (tenant_id, name, phone, email, address, notes)
    VALUES (
      NEW.tenant_id,
      trim(NEW.customer_name),
      trim(NEW.customer_phone),
      NULLIF(trim(NEW.customer_email), ''),
      NEW.delivery_address,
      'Registrado vía Marketplace'
    ) RETURNING id INTO v_customer_id;
  ELSE
    UPDATE public.customers SET
      visits_count = COALESCE(visits_count, 0) + 1,
      name = COALESCE(NULLIF(trim(NEW.customer_name), ''), name),
      email = COALESCE(NULLIF(trim(NEW.customer_email), ''), email),
      address = COALESCE(NEW.delivery_address, address),
      updated_at = now()
    WHERE id = v_customer_id;
  END IF;

  NEW.customer_id := v_customer_id;
  RETURN NEW;
END $$;

-- 3) Función atómica para crear pedido validando stock real (online_stock) con bloqueo
CREATE OR REPLACE FUNCTION public.place_online_order(
  p_tenant_id uuid,
  p_items jsonb,                       -- [{product_id, qty}]
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_delivery_type text,
  p_delivery_address text,
  p_notes text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order_id uuid;
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

  -- Validar y bloquear filas de producto, calcular subtotal
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

  -- Crear orden
  INSERT INTO public.online_orders (
    tenant_id, user_id, customer_name, customer_email, customer_phone,
    delivery_type, delivery_address, subtotal, total, notes, status
  ) VALUES (
    p_tenant_id, v_uid, trim(p_customer_name), NULLIF(trim(p_customer_email),''), trim(p_customer_phone),
    COALESCE(p_delivery_type,'pickup'),
    CASE WHEN p_delivery_type = 'delivery' THEN p_delivery_address ELSE NULL END,
    v_subtotal, v_subtotal, NULLIF(trim(p_notes),''), 'pending'
  ) RETURNING id INTO v_order_id;

  -- Insertar items y descontar stock
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

GRANT EXECUTE ON FUNCTION public.place_online_order(uuid, jsonb, text, text, text, text, text, text) TO authenticated;
