
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_semi_finished boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_combo boolean NOT NULL DEFAULT false;

ALTER TABLE public.product_recipes
  ADD COLUMN IF NOT EXISTS waste_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS note text;

CREATE TABLE IF NOT EXISTS public.combo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  combo_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  child_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
  is_optional boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.combo_items TO authenticated;
GRANT ALL ON public.combo_items TO service_role;

ALTER TABLE public.combo_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "combo_items tenant access" ON public.combo_items
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_combo_items_combo ON public.combo_items(combo_product_id);
CREATE INDEX IF NOT EXISTS idx_combo_items_tenant ON public.combo_items(tenant_id);

DROP TRIGGER IF EXISTS audit_combo_items ON public.combo_items;
CREATE TRIGGER audit_combo_items
  AFTER INSERT OR UPDATE OR DELETE ON public.combo_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE OR REPLACE FUNCTION public.process_recipe_consumption(
  p_tenant_id uuid, p_sale_id uuid, p_product_id uuid, p_qty numeric,
  p_location_type text, p_location_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  child record;
  ing record;
  v_prev numeric;
  v_new numeric;
  v_consumed numeric;
  v_is_combo boolean;
  v_is_semi boolean;
  v_has_recipe boolean;
BEGIN
  SELECT is_combo, is_semi_finished INTO v_is_combo, v_is_semi
    FROM products WHERE id = p_product_id AND tenant_id = p_tenant_id;

  IF COALESCE(v_is_combo, false) THEN
    FOR child IN
      SELECT child_product_id, quantity
      FROM combo_items
      WHERE combo_product_id = p_product_id AND tenant_id = p_tenant_id
        AND is_optional = false
    LOOP
      PERFORM process_recipe_consumption(
        p_tenant_id, p_sale_id, child.child_product_id,
        child.quantity * p_qty, p_location_type, p_location_id
      );
    END LOOP;
    RETURN;
  END IF;

  FOR ing IN
    SELECT ingredient_id, quantity, waste_pct
    FROM product_recipes
    WHERE product_id = p_product_id AND tenant_id = p_tenant_id
  LOOP
    v_consumed := ing.quantity * p_qty * (1 + COALESCE(ing.waste_pct,0)/100.0);

    SELECT EXISTS (
      SELECT 1 FROM product_recipes pr
      JOIN products p ON p.id = pr.product_id
      WHERE pr.product_id = ing.ingredient_id
        AND pr.tenant_id = p_tenant_id
        AND COALESCE(p.is_semi_finished,false) = true
    ) INTO v_has_recipe;

    IF v_has_recipe THEN
      PERFORM process_recipe_consumption(
        p_tenant_id, p_sale_id, ing.ingredient_id,
        v_consumed, p_location_type, p_location_id
      );
    ELSE
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
        'Consumo por receta (waste ' || COALESCE(ing.waste_pct,0)::text || '%)'
      );
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE VIEW public.recipe_costing
WITH (security_invoker = true)
AS
WITH RECURSIVE expand AS (
  SELECT
    p.tenant_id, p.id AS product_id, p.name, p.price,
    ci.child_product_id AS leaf_id,
    ci.quantity AS qty,
    0::numeric AS waste_pct
  FROM products p
  JOIN combo_items ci ON ci.combo_product_id = p.id
  WHERE p.is_combo = true

  UNION ALL

  SELECT
    p.tenant_id, p.id AS product_id, p.name, p.price,
    pr.ingredient_id AS leaf_id,
    pr.quantity AS qty,
    COALESCE(pr.waste_pct,0) AS waste_pct
  FROM products p
  JOIN product_recipes pr ON pr.product_id = p.id
  WHERE p.is_combo = false

  UNION ALL

  SELECT
    e.tenant_id, e.product_id, e.name, e.price,
    COALESCE(pr2.ingredient_id, ci2.child_product_id) AS leaf_id,
    e.qty * COALESCE(pr2.quantity, ci2.quantity) AS qty,
    COALESCE(pr2.waste_pct, 0) AS waste_pct
  FROM expand e
  JOIN products lp ON lp.id = e.leaf_id
  LEFT JOIN product_recipes pr2 ON pr2.product_id = lp.id AND lp.is_semi_finished = true
  LEFT JOIN combo_items ci2 ON ci2.combo_product_id = lp.id AND lp.is_combo = true
  WHERE (pr2.ingredient_id IS NOT NULL OR ci2.child_product_id IS NOT NULL)
)
SELECT
  e.tenant_id,
  e.product_id,
  e.name,
  e.price,
  sum(e.qty * (1 + e.waste_pct/100.0) * COALESCE(lp.cost,0)) AS unit_cost,
  e.price - sum(e.qty * (1 + e.waste_pct/100.0) * COALESCE(lp.cost,0)) AS margin,
  CASE WHEN e.price > 0
    THEN ((e.price - sum(e.qty * (1 + e.waste_pct/100.0) * COALESCE(lp.cost,0))) / e.price) * 100
    ELSE 0
  END AS margin_pct
FROM expand e
JOIN products lp ON lp.id = e.leaf_id
WHERE COALESCE(lp.is_semi_finished, false) = false
  AND COALESCE(lp.is_combo, false) = false
GROUP BY e.tenant_id, e.product_id, e.name, e.price;

GRANT SELECT ON public.recipe_costing TO authenticated;

COMMENT ON VIEW public.recipe_costing IS
'Escandallo recursivo: costo unitario (recetas + combos + semi-elaborados + mermas) y margen %.';
