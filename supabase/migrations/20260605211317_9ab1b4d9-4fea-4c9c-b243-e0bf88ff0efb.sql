
-- ============================================================
-- FASE 0+1 — Integridad de flujos y realtime
-- ============================================================

-- 1) process_sale_stock con fallback: si no hay store, usa el tenant como ubicación virtual
CREATE OR REPLACE FUNCTION public.process_sale_stock(
  p_sale_id uuid,
  p_location_type text,
  p_location_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  r record;
  v_prev numeric;
  v_new numeric;
  v_loc_type text;
  v_loc_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM sales WHERE id = p_sale_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Venta no encontrada'; END IF;

  -- Fallback: si no se especifica ubicación, usar tenant como ubicación virtual
  v_loc_type := COALESCE(NULLIF(p_location_type,''), 'tenant');
  v_loc_id := COALESCE(p_location_id, v_tenant);

  FOR r IN
    SELECT si.product_id, si.qty, si.product_name
    FROM sale_items si
    WHERE si.sale_id = p_sale_id AND si.product_id IS NOT NULL
  LOOP
    INSERT INTO product_stock (tenant_id, product_id, location_type, location_id, stock)
      VALUES (v_tenant, r.product_id, v_loc_type, v_loc_id, 0)
    ON CONFLICT (product_id, location_type, location_id) DO NOTHING;

    SELECT stock INTO v_prev FROM product_stock
      WHERE product_id = r.product_id AND location_type = v_loc_type AND location_id = v_loc_id
      FOR UPDATE;

    v_new := COALESCE(v_prev,0) - r.qty;

    UPDATE product_stock SET stock = v_new, updated_at = now()
      WHERE product_id = r.product_id AND location_type = v_loc_type AND location_id = v_loc_id;

    INSERT INTO inventory_movements (
      tenant_id, product_id, movement_type, quantity, previous_stock, new_stock,
      reference_type, reference_id, performed_by, location_type, location_id, reason
    ) VALUES (
      v_tenant, r.product_id, 'sale', r.qty, COALESCE(v_prev,0), v_new,
      'sale', p_sale_id, auth.uid(), v_loc_type, v_loc_id, 'Venta POS'
    );

    -- 1.b) Descuento por receta (BOM): si el producto tiene receta, descuenta ingredientes
    PERFORM public.process_recipe_consumption(
      v_tenant, p_sale_id, r.product_id, r.qty, v_loc_type, v_loc_id
    );
  END LOOP;
END;
$$;

-- 2) Función auxiliar: descuenta ingredientes según product_recipes
CREATE OR REPLACE FUNCTION public.process_recipe_consumption(
  p_tenant_id uuid,
  p_sale_id uuid,
  p_product_id uuid,
  p_qty numeric,
  p_location_type text,
  p_location_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ing record;
  v_prev numeric;
  v_new numeric;
  v_consumed numeric;
BEGIN
  FOR ing IN
    SELECT ingredient_id, quantity
    FROM public.product_recipes
    WHERE product_id = p_product_id AND tenant_id = p_tenant_id
  LOOP
    v_consumed := ing.quantity * p_qty;

    INSERT INTO product_stock (tenant_id, product_id, location_type, location_id, stock)
      VALUES (p_tenant_id, ing.ingredient_id, p_location_type, p_location_id, 0)
    ON CONFLICT (product_id, location_type, location_id) DO NOTHING;

    SELECT stock INTO v_prev FROM product_stock
      WHERE product_id = ing.ingredient_id
        AND location_type = p_location_type
        AND location_id = p_location_id
      FOR UPDATE;

    v_new := COALESCE(v_prev, 0) - v_consumed;

    UPDATE product_stock SET stock = v_new, updated_at = now()
      WHERE product_id = ing.ingredient_id
        AND location_type = p_location_type
        AND location_id = p_location_id;

    INSERT INTO inventory_movements (
      tenant_id, product_id, movement_type, quantity, previous_stock, new_stock,
      reference_type, reference_id, performed_by, location_type, location_id, reason
    ) VALUES (
      p_tenant_id, ing.ingredient_id, 'recipe_consumption', v_consumed,
      COALESCE(v_prev,0), v_new,
      'sale', p_sale_id, auth.uid(), p_location_type, p_location_id,
      'Consumo por receta'
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_recipe_consumption(uuid, uuid, uuid, numeric, text, uuid) TO authenticated;

-- 3) Habilitar Realtime en tablas críticas (idempotente)
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='sales';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.sales; END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='account_payments';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.account_payments; END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='inventory_movements';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_movements; END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='purchases';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.purchases; END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE public.sales REPLICA IDENTITY FULL;
ALTER TABLE public.account_payments REPLICA IDENTITY FULL;
ALTER TABLE public.inventory_movements REPLICA IDENTITY FULL;
ALTER TABLE public.purchases REPLICA IDENTITY FULL;
