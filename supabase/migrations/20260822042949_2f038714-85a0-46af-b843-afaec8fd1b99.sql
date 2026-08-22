CREATE OR REPLACE FUNCTION public.cqo_purchase_items_insert(p_purchase_id uuid, p_tenant_id uuid, p_items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE it jsonb; v_pid uuid; v_p record; v_name text; v_sku text; v_unit text; v_qty numeric; v_cost numeric;
BEGIN
  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := NULLIF(it->>'product_id','')::uuid;
    v_qty := COALESCE((it->>'qty')::numeric, 1);
    v_cost := COALESCE((it->>'cost')::numeric, (it->>'price')::numeric, 0);
    IF v_qty <= 0 OR v_qty > 1000000 THEN RAISE EXCEPTION 'Cantidad inválida en la línea de compra'; END IF;
    IF v_cost < 0 OR v_cost >= 1e12 THEN RAISE EXCEPTION 'Costo inválido en la línea de compra'; END IF;
    v_name := NULLIF(it->>'product_name',''); v_sku := NULLIF(it->>'sku',''); v_unit := NULLIF(it->>'unit','');
    IF v_pid IS NOT NULL THEN
      SELECT p.name, p.sku, p.unit INTO v_p FROM products p WHERE p.id = v_pid AND p.tenant_id = p_tenant_id;
      IF v_p.name IS NULL THEN RAISE EXCEPTION 'Producto no pertenece a este negocio'; END IF;
      v_name := COALESCE(v_name, v_p.name);
      v_sku := COALESCE(v_sku, v_p.sku);
      v_unit := COALESCE(v_unit, v_p.unit);
    END IF;
    IF v_name IS NULL THEN RAISE EXCEPTION 'La línea de compra requiere producto o descripción'; END IF;
    INSERT INTO purchase_items (purchase_id, product_id, product_name, sku, qty, cost, total, unit)
    VALUES (p_purchase_id, v_pid, v_name, v_sku, v_qty, v_cost, round(v_qty * v_cost, 2), v_unit);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.cqo_purchase_items_insert(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;