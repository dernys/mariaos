-- Ubicación por defecto del negocio: primera tienda activa, si no primer almacén, si no nivel negocio
CREATE OR REPLACE FUNCTION public.default_stock_location(p_tenant uuid)
RETURNS TABLE(location_type text, location_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT x.lt, x.lid FROM (
    (SELECT 'store'::text AS lt, s.id AS lid, 1 AS pr, s.created_at FROM public.stores s
       WHERE s.tenant_id = p_tenant AND s.is_active ORDER BY s.created_at LIMIT 1)
    UNION ALL
    (SELECT 'warehouse', w.id, 2, w.created_at FROM public.warehouses w
       WHERE w.tenant_id = p_tenant ORDER BY w.created_at LIMIT 1)
    UNION ALL
    SELECT 'tenant', p_tenant, 3, now()
  ) x ORDER BY x.pr LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.default_stock_location(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.default_stock_location(uuid) TO authenticated, service_role;

-- Movimiento manual de inventario con ubicación obligatoria (atómico e idempotente)
CREATE OR REPLACE FUNCTION public.register_inventory_movement(
  p_product_id uuid, p_type text, p_quantity numeric,
  p_location_type text DEFAULT NULL, p_location_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL, p_client_uuid uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid; v_lt text := p_location_type; v_lid uuid := p_location_id;
  v_prev numeric; v_new numeric; v_qty numeric := trunc(coalesce(p_quantity,0));
  v_mov uuid; v_existing record;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.products WHERE id = p_product_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
  IF NOT public.is_tenant_member(v_tenant) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_type NOT IN ('entry','exit','adjustment') THEN RAISE EXCEPTION 'Tipo de movimiento inválido'; END IF;
  IF p_type <> 'adjustment' AND v_qty <= 0 THEN RAISE EXCEPTION 'qtyGtZero'; END IF;
  IF p_type = 'adjustment' AND v_qty < 0 THEN RAISE EXCEPTION 'notEnoughStock'; END IF;

  IF p_client_uuid IS NOT NULL THEN
    SELECT id, previous_stock, new_stock, location_type, location_id INTO v_existing
      FROM public.inventory_movements WHERE client_uuid = p_client_uuid;
    IF FOUND THEN
      RETURN jsonb_build_object('movement_id', v_existing.id, 'previous_stock', v_existing.previous_stock,
        'new_stock', v_existing.new_stock, 'location_type', v_existing.location_type,
        'location_id', v_existing.location_id, 'replayed', true);
    END IF;
  END IF;

  IF v_lid IS NULL THEN
    SELECT d.location_type, d.location_id INTO v_lt, v_lid FROM public.default_stock_location(v_tenant) d;
  END IF;
  IF v_lt = 'store' THEN
    PERFORM 1 FROM public.stores WHERE id = v_lid AND tenant_id = v_tenant;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tienda no pertenece al negocio'; END IF;
  ELSIF v_lt = 'warehouse' THEN
    PERFORM 1 FROM public.warehouses WHERE id = v_lid AND tenant_id = v_tenant;
    IF NOT FOUND THEN RAISE EXCEPTION 'Almacén no pertenece al negocio'; END IF;
  ELSIF v_lt = 'tenant' THEN
    IF v_lid <> v_tenant THEN RAISE EXCEPTION 'Ubicación inválida'; END IF;
  ELSE RAISE EXCEPTION 'Tipo de ubicación inválido';
  END IF;

  INSERT INTO public.product_stock (tenant_id, product_id, location_type, location_id, stock)
    VALUES (v_tenant, p_product_id, v_lt, v_lid, 0)
  ON CONFLICT (product_id, location_type, location_id) DO NOTHING;
  SELECT stock INTO v_prev FROM public.product_stock
    WHERE product_id = p_product_id AND location_type = v_lt AND location_id = v_lid FOR UPDATE;
  v_prev := coalesce(v_prev, 0);
  v_new := CASE p_type WHEN 'entry' THEN v_prev + v_qty WHEN 'exit' THEN v_prev - v_qty ELSE v_qty END;
  IF v_new < 0 THEN RAISE EXCEPTION 'notEnoughStock'; END IF;

  UPDATE public.product_stock SET stock = v_new, updated_at = now()
    WHERE product_id = p_product_id AND location_type = v_lt AND location_id = v_lid;

  INSERT INTO public.inventory_movements (tenant_id, product_id, movement_type, quantity, previous_stock, new_stock,
    reason, reference_type, performed_by, location_type, location_id, warehouse_id, client_uuid)
  VALUES (v_tenant, p_product_id, p_type, abs(v_new - v_prev)::int, v_prev::int, v_new::int,
    nullif(trim(coalesce(p_reason,'')),''), 'manual', auth.uid(), v_lt, v_lid,
    CASE WHEN v_lt = 'warehouse' THEN v_lid END, p_client_uuid)
  RETURNING id INTO v_mov;

  RETURN jsonb_build_object('movement_id', v_mov, 'previous_stock', v_prev, 'new_stock', v_new,
    'location_type', v_lt, 'location_id', v_lid, 'replayed', false);
END $$;
REVOKE EXECUTE ON FUNCTION public.register_inventory_movement(uuid,text,numeric,text,uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_inventory_movement(uuid,text,numeric,text,uuid,text,uuid) TO authenticated, service_role;

-- Regularización única (antes de activar la protección): solo negocios no demo
DO $$
DECLARE r record; v_lt text; v_lid uuid; v_prev numeric;
BEGIN
  FOR r IN
    WITH located AS (
      SELECT p.id, p.tenant_id, p.stock AS total,
             coalesce((SELECT sum(ps.stock) FROM public.product_stock ps WHERE ps.product_id = p.id), 0) AS loc_sum,
             coalesce((SELECT sum(CASE m.movement_type WHEN 'entry' THEN m.quantity WHEN 'exit' THEN -m.quantity ELSE 0 END)
                FROM public.inventory_movements m WHERE m.product_id = p.id AND m.location_id IS NULL), 0) AS orphan_net
      FROM public.products p JOIN public.tenants t ON t.id = p.tenant_id
      WHERE coalesce(t.is_demo, false) = false
    )
    SELECT id, tenant_id,
      CASE WHEN total <> loc_sum THEN total - loc_sum ELSE orphan_net END AS delta
    FROM located
    WHERE total <> loc_sum OR orphan_net <> 0
  LOOP
    CONTINUE WHEN r.delta = 0;
    SELECT d.location_type, d.location_id INTO v_lt, v_lid FROM public.default_stock_location(r.tenant_id) d;
    INSERT INTO public.product_stock (tenant_id, product_id, location_type, location_id, stock)
      VALUES (r.tenant_id, r.id, v_lt, v_lid, 0)
    ON CONFLICT (product_id, location_type, location_id) DO NOTHING;
    SELECT stock INTO v_prev FROM public.product_stock
      WHERE product_id = r.id AND location_type = v_lt AND location_id = v_lid FOR UPDATE;
    UPDATE public.product_stock SET stock = coalesce(v_prev,0) + r.delta, updated_at = now()
      WHERE product_id = r.id AND location_type = v_lt AND location_id = v_lid;
    INSERT INTO public.inventory_movements (tenant_id, product_id, movement_type, quantity, previous_stock, new_stock,
      reason, reference_type, location_type, location_id)
    VALUES (r.tenant_id, r.id, 'adjust', abs(r.delta)::int, coalesce(v_prev,0)::int, (coalesce(v_prev,0) + r.delta)::int,
      'Regularización: stock registrado sin tienda/almacén', 'regularization', v_lt, v_lid);
  END LOOP;
END $$;

-- products.stock es agregado: escrituras directas se ignoran (solo el trigger de product_stock lo mantiene)
CREATE OR REPLACE FUNCTION public.guard_product_total_stock()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() <= 1 THEN NEW.stock := OLD.stock; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_product_total_stock ON public.products;
CREATE TRIGGER trg_guard_product_total_stock BEFORE UPDATE OF stock ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.guard_product_total_stock();

-- Stock inicial al crear producto: se ubica en su almacén o en la ubicación por defecto
CREATE OR REPLACE FUNCTION public.place_initial_product_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lt text; v_lid uuid; v_qty numeric := coalesce(NEW.stock, 0);
BEGIN
  IF v_qty = 0 OR NEW.tenant_id IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.product_stock WHERE product_id = NEW.id) THEN RETURN NULL; END IF;
  IF NEW.warehouse_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.warehouses WHERE id = NEW.warehouse_id AND tenant_id = NEW.tenant_id) THEN
    v_lt := 'warehouse'; v_lid := NEW.warehouse_id;
  ELSE
    SELECT d.location_type, d.location_id INTO v_lt, v_lid FROM public.default_stock_location(NEW.tenant_id) d;
  END IF;
  INSERT INTO public.product_stock (tenant_id, product_id, location_type, location_id, stock)
    VALUES (NEW.tenant_id, NEW.id, v_lt, v_lid, v_qty)
  ON CONFLICT (product_id, location_type, location_id) DO NOTHING;
  INSERT INTO public.inventory_movements (tenant_id, product_id, movement_type, quantity, previous_stock, new_stock,
    reason, reference_type, performed_by, location_type, location_id, warehouse_id)
  VALUES (NEW.tenant_id, NEW.id, 'entry', abs(v_qty)::int, 0, v_qty::int, 'initial_stock', 'initial',
    auth.uid(), v_lt, v_lid, CASE WHEN v_lt = 'warehouse' THEN v_lid END);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_place_initial_product_stock ON public.products;
CREATE TRIGGER trg_place_initial_product_stock AFTER INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.place_initial_product_stock();
REVOKE EXECUTE ON FUNCTION public.place_initial_product_stock() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_product_total_stock() FROM PUBLIC, anon, authenticated;