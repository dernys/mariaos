CREATE TABLE IF NOT EXISTS public.marketplace_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

GRANT SELECT, INSERT, DELETE ON public.marketplace_favorites TO authenticated;
GRANT ALL ON public.marketplace_favorites TO service_role;

ALTER TABLE public.marketplace_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers manage their own favorites"
  ON public.marketplace_favorites FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS marketplace_favorites_user_idx ON public.marketplace_favorites (user_id);

-- Cálculo previo del pedido (mismos precios y reglas que place_order_group)
CREATE OR REPLACE FUNCTION public.marketplace_quote(
  p_items jsonb,
  p_delivery_type text DEFAULT 'pickup',
  p_zone_ids jsonb DEFAULT '{}'::jsonb,
  p_coupon_codes jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
  v_pid uuid; v_qty numeric; v_price numeric; v_tax_rate numeric; v_stock numeric;
  v_name text; v_is_online boolean; v_is_active boolean;
  v_subtotal numeric; v_tax numeric; v_fee numeric; v_discount numeric;
  v_issues jsonb;
  v_code text; v_coupon coupons%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RETURN jsonb_build_object('tenants','[]'::jsonb); END IF;

  FOR v_tenant IN SELECT DISTINCT (i->>'tenant_id')::uuid FROM jsonb_array_elements(p_items) i LOOP
    PERFORM public.assert_public_tenant(v_tenant);
    v_subtotal := 0; v_tax := 0; v_fee := 0; v_discount := 0; v_issues := '[]'::jsonb;

    IF COALESCE(p_delivery_type,'pickup') = 'delivery' THEN
      IF NULLIF(p_zone_ids->>v_tenant::text,'') IS NOT NULL THEN
        SELECT COALESCE(fee,0) INTO v_fee FROM delivery_zones
         WHERE id = (p_zone_ids->>v_tenant::text)::uuid AND tenant_id = v_tenant AND is_active;
      ELSE
        SELECT COALESCE(min(fee),0) INTO v_fee FROM delivery_zones WHERE tenant_id = v_tenant AND is_active;
      END IF;
      v_fee := COALESCE(v_fee,0);
    END IF;

    FOR v_item IN SELECT i FROM jsonb_array_elements(p_items) i WHERE (i->>'tenant_id')::uuid = v_tenant LOOP
      v_pid := (v_item->>'product_id')::uuid;
      v_qty := COALESCE((v_item->>'qty')::numeric,0);
      SELECT p.name, p.online_stock, p.is_online, p.is_active,
             COALESCE((SELECT tr.rate FROM tax_rates tr WHERE tr.id = p.default_tax_rate_id AND tr.is_active),0)
        INTO v_name, v_stock, v_is_online, v_is_active, v_tax_rate
        FROM products p WHERE p.id = v_pid AND p.tenant_id = v_tenant;

      IF v_name IS NULL OR NOT COALESCE(v_is_online,false) OR NOT COALESCE(v_is_active,false) THEN
        v_issues := v_issues || jsonb_build_object('product_id', v_pid, 'reason', 'unavailable');
        CONTINUE;
      END IF;
      IF v_stock < v_qty THEN
        v_issues := v_issues || jsonb_build_object('product_id', v_pid, 'reason', 'stock', 'available', v_stock);
      END IF;

      v_price := public.marketplace_effective_price(v_pid);
      v_subtotal := v_subtotal + v_price * v_qty;
      v_tax := v_tax + v_price * v_qty * COALESCE(v_tax_rate,0) / 100.0;
    END LOOP;

    v_code := NULLIF(btrim(COALESCE(p_coupon_codes->>v_tenant::text,'')),'');
    IF v_code IS NOT NULL THEN
      SELECT * INTO v_coupon FROM coupons
       WHERE tenant_id = v_tenant AND upper(code) = upper(v_code) AND is_active
         AND (valid_from IS NULL OR valid_from <= current_date)
         AND (valid_until IS NULL OR valid_until >= current_date);
      IF v_coupon.id IS NULL OR COALESCE(v_coupon.min_amount,0) > v_subtotal
         OR (v_coupon.max_uses IS NOT NULL AND COALESCE(v_coupon.uses_count,0) >= v_coupon.max_uses) THEN
        v_issues := v_issues || jsonb_build_object('coupon', v_code, 'reason', 'coupon_invalid');
      ELSE
        v_discount := CASE WHEN v_coupon.discount_type = 'percentage'
          THEN v_subtotal * COALESCE(v_coupon.discount_value,0)/100.0
          ELSE LEAST(COALESCE(v_coupon.discount_value,0), v_subtotal) END;
      END IF;
    END IF;

    v_out := v_out || jsonb_build_object(
      'tenant_id', v_tenant, 'subtotal', v_subtotal, 'discount', v_discount,
      'tax', v_tax, 'delivery_fee', v_fee,
      'total', GREATEST(v_subtotal - v_discount,0) + v_tax + v_fee,
      'issues', v_issues);
  END LOOP;

  RETURN jsonb_build_object('tenants', v_out);
END $$;

REVOKE ALL ON FUNCTION public.marketplace_quote(jsonb, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_quote(jsonb, text, jsonb, jsonb) TO authenticated;