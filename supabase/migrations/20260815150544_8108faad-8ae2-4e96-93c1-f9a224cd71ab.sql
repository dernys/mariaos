-- 1) Kitchen orders: trazabilidad completa hasta el cobro
ALTER TABLE public.kitchen_orders
  ADD COLUMN IF NOT EXISTS sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shift_id uuid,
  ADD COLUMN IF NOT EXISTS store_id uuid,
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS order_code text;

ALTER TABLE public.kitchen_order_items
  ADD COLUMN IF NOT EXISTS product_id uuid,
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS unit_price numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_kitchen_orders_tenant_status ON public.kitchen_orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_kitchen_orders_sale ON public.kitchen_orders(sale_id);

-- 2) Recetas: metadatos del producto preparado
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS recipe_yield numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS recipe_notes text;

-- 3) Cerrar una orden de cocina al cobrarla
CREATE OR REPLACE FUNCTION public.bill_kitchen_order(p_order_id uuid, p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_table uuid;
BEGIN
  SELECT tenant_id, table_id INTO v_tenant, v_table FROM kitchen_orders WHERE id = p_order_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Orden no encontrada'; END IF;

  IF NOT (is_superadmin(auth.uid()) OR EXISTS (
    SELECT 1 FROM tenant_users WHERE user_id = auth.uid() AND tenant_id = v_tenant
  )) THEN
    RAISE EXCEPTION 'No autorizado en este tenant';
  END IF;

  UPDATE kitchen_orders
  SET status = 'billed', sale_id = p_sale_id, updated_at = now(),
      completed_at = COALESCE(completed_at, now())
  WHERE id = p_order_id;

  IF v_table IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM kitchen_orders
    WHERE table_id = v_table AND id <> p_order_id
      AND status IN ('pending', 'preparing', 'ready', 'delivered')
  ) THEN
    UPDATE restaurant_tables
    SET status = 'available', current_order_id = NULL, occupied_at = NULL
    WHERE id = v_table;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bill_kitchen_order(uuid, uuid) TO authenticated;

-- 4) Venta rápida: turno, tienda, pagos reales e inventario
CREATE OR REPLACE FUNCTION public.create_quick_sale(p_tenant_id uuid, p_customer_id uuid, p_employee_id uuid, p_items jsonb, p_payments jsonb DEFAULT '[]'::jsonb, p_notes text DEFAULT NULL::text, p_tax_rate numeric DEFAULT 0)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sale_id uuid;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_paid numeric := 0;
  v_status text := 'pending';
  v_item jsonb;
  v_pay jsonb;
  v_party_type text;
  v_party_id uuid;
  v_shift_id uuid;
  v_store_id uuid;
  v_has_products boolean := false;
BEGIN
  IF NOT (is_superadmin(auth.uid()) OR EXISTS (
    SELECT 1 FROM tenant_users WHERE user_id = auth.uid() AND tenant_id = p_tenant_id
  )) THEN
    RAISE EXCEPTION 'No autorizado en este tenant';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La venta debe contener al menos un producto';
  END IF;

  -- Turno abierto del usuario (o de la tienda) para vincular la venta
  SELECT id, store_id INTO v_shift_id, v_store_id
  FROM sales_shifts
  WHERE tenant_id = p_tenant_id AND status = 'open' AND user_id = auth.uid()
  ORDER BY opened_at DESC LIMIT 1;

  IF v_shift_id IS NULL THEN
    SELECT id, store_id INTO v_shift_id, v_store_id
    FROM sales_shifts
    WHERE tenant_id = p_tenant_id AND status = 'open'
    ORDER BY opened_at DESC LIMIT 1;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_subtotal := v_subtotal + (COALESCE((v_item->>'qty')::numeric, 1) * COALESCE((v_item->>'price')::numeric, 0));
    IF (v_item->>'product_id') IS NOT NULL THEN v_has_products := true; END IF;
  END LOOP;
  v_tax := round(v_subtotal * (COALESCE(p_tax_rate, 0) / 100.0), 2);
  v_total := v_subtotal + v_tax;

  FOR v_pay IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    v_paid := v_paid + COALESCE((v_pay->>'amount')::numeric, 0) * COALESCE((v_pay->>'exchange_rate')::numeric, 1);
  END LOOP;

  IF v_paid >= v_total THEN v_status := 'paid';
  ELSIF v_paid > 0 THEN v_status := 'partial';
  ELSE v_status := 'pending';
  END IF;

  INSERT INTO sales (tenant_id, customer_id, employee_id, subtotal, tax, total, amount_paid, status, notes, shift_id, store_id)
  VALUES (p_tenant_id, p_customer_id, p_employee_id, v_subtotal, v_tax, v_total, v_paid, v_status, p_notes, v_shift_id, v_store_id)
  RETURNING id INTO v_sale_id;

  INSERT INTO sale_items (sale_id, product_id, product_name, sku, price, qty, total)
  SELECT
    v_sale_id,
    NULLIF(it->>'product_id', '')::uuid,
    (it->>'product_name')::text,
    (it->>'sku')::text,
    COALESCE((it->>'price')::numeric, 0),
    COALESCE((it->>'qty')::integer, 1),
    COALESCE((it->>'qty')::numeric, 1) * COALESCE((it->>'price')::numeric, 0)
  FROM jsonb_array_elements(p_items) it;

  IF v_paid > 0 THEN
    -- Pagos de la venta (visibles en el detalle de la venta y en el turno)
    INSERT INTO sale_payments (sale_id, method, currency, amount, amount_in_base, exchange_rate)
    SELECT
      v_sale_id,
      COALESCE(pay->>'method', 'cash'),
      COALESCE(pay->>'currency', 'CUP'),
      COALESCE((pay->>'amount')::numeric, 0),
      COALESCE((pay->>'amount')::numeric, 0) * COALESCE((pay->>'exchange_rate')::numeric, 1),
      COALESCE((pay->>'exchange_rate')::numeric, 1)
    FROM jsonb_array_elements(p_payments) pay
    WHERE COALESCE((pay->>'amount')::numeric, 0) > 0;

    IF p_customer_id IS NOT NULL THEN v_party_type := 'customer'; v_party_id := p_customer_id;
    ELSIF p_employee_id IS NOT NULL THEN v_party_type := 'employee'; v_party_id := p_employee_id;
    ELSE v_party_type := 'customer'; v_party_id := NULL;
    END IF;

    IF v_party_id IS NOT NULL THEN
      FOR v_pay IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
        INSERT INTO account_payments (
          tenant_id, party_type, party_id, reference_type, reference_id,
          direction, method, currency, amount, amount_in_base, exchange_rate, performed_by
        ) VALUES (
          p_tenant_id, v_party_type, v_party_id, 'sale', v_sale_id,
          'in',
          COALESCE(v_pay->>'method', 'cash'),
          COALESCE(v_pay->>'currency', 'CUP'),
          COALESCE((v_pay->>'amount')::numeric, 0),
          COALESCE((v_pay->>'amount')::numeric, 0) * COALESCE((v_pay->>'exchange_rate')::numeric, 1),
          COALESCE((v_pay->>'exchange_rate')::numeric, 1),
          auth.uid()
        );
      END LOOP;
    END IF;
  END IF;

  -- Inventario: descuenta igual que el POS
  IF v_has_products THEN
    BEGIN
      PERFORM process_sale_stock(
        v_sale_id,
        CASE WHEN v_store_id IS NOT NULL THEN 'store' ELSE 'tenant' END,
        COALESCE(v_store_id, p_tenant_id)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_sale_stock falló para venta %: %', v_sale_id, SQLERRM;
    END;
  END IF;

  RETURN v_sale_id;
END;
$$;