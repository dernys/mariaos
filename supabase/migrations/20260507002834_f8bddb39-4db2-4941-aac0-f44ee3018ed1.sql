
-- Customer loyalty fields
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS loyalty_points numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_tier text NOT NULL DEFAULT 'bronze',
  ADD COLUMN IF NOT EXISTS total_spent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visits_count integer NOT NULL DEFAULT 0;

-- Loyalty settings (one per tenant)
CREATE TABLE public.loyalty_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  points_per_unit numeric NOT NULL DEFAULT 1, -- 1 punto por unidad monetaria
  value_per_point numeric NOT NULL DEFAULT 0.01, -- 1 punto = 0.01
  silver_threshold numeric NOT NULL DEFAULT 1000,
  gold_threshold numeric NOT NULL DEFAULT 5000,
  platinum_threshold numeric NOT NULL DEFAULT 20000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.loyalty_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant view loyalty_settings" ON public.loyalty_settings FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()) OR is_superadmin(auth.uid()));
CREATE POLICY "tenant manage loyalty_settings" ON public.loyalty_settings FOR ALL
USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()) OR is_superadmin(auth.uid()))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()) OR is_superadmin(auth.uid()));

-- Loyalty movements (audit)
CREATE TABLE public.loyalty_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  movement_type text NOT NULL, -- 'earn' | 'redeem' | 'adjust' | 'expire'
  points numeric NOT NULL,
  reference_type text,
  reference_id uuid,
  notes text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_loyalty_mv_customer ON public.loyalty_movements(customer_id, created_at DESC);
ALTER TABLE public.loyalty_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant view loyalty_movements" ON public.loyalty_movements FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()) OR is_superadmin(auth.uid()));
CREATE POLICY "tenant insert loyalty_movements" ON public.loyalty_movements FOR INSERT
WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()) OR is_superadmin(auth.uid()));

-- Coupons
CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  description text,
  discount_type text NOT NULL DEFAULT 'percent', -- 'percent' | 'amount'
  discount_value numeric NOT NULL DEFAULT 0,
  min_amount numeric NOT NULL DEFAULT 0,
  max_uses integer,
  uses_count integer NOT NULL DEFAULT 0,
  max_uses_per_customer integer,
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant view coupons" ON public.coupons FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()) OR is_superadmin(auth.uid()));
CREATE POLICY "tenant manage coupons" ON public.coupons FOR ALL
USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()) OR is_superadmin(auth.uid()))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()) OR is_superadmin(auth.uid()));

CREATE TABLE public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  sale_id uuid,
  customer_id uuid,
  discount_applied numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant view coupon_redemptions" ON public.coupon_redemptions FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()) OR is_superadmin(auth.uid()));
CREATE POLICY "tenant insert coupon_redemptions" ON public.coupon_redemptions FOR INSERT
WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()) OR is_superadmin(auth.uid()));

-- Promotions
CREATE TABLE public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  promo_type text NOT NULL DEFAULT 'percent_off', -- 'percent_off'|'amount_off'|'2x1'|'bundle'
  discount_value numeric NOT NULL DEFAULT 0,
  scope text NOT NULL DEFAULT 'all', -- 'all'|'category'|'product'
  scope_id uuid,
  scope_value text,
  min_qty integer NOT NULL DEFAULT 1,
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant view promotions" ON public.promotions FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()) OR is_superadmin(auth.uid()));
CREATE POLICY "tenant manage promotions" ON public.promotions FOR ALL
USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()) OR is_superadmin(auth.uid()))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()) OR is_superadmin(auth.uid()));

-- RPC: award loyalty points on paid sale
CREATE OR REPLACE FUNCTION public.award_loyalty_points(p_sale_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sale record;
  v_settings record;
  v_points numeric := 0;
  v_new_total numeric;
  v_new_tier text;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF v_sale IS NULL OR v_sale.customer_id IS NULL THEN RETURN 0; END IF;

  SELECT * INTO v_settings FROM loyalty_settings WHERE tenant_id = v_sale.tenant_id;
  IF v_settings IS NULL OR NOT v_settings.enabled THEN RETURN 0; END IF;

  -- skip if already awarded
  IF EXISTS (SELECT 1 FROM loyalty_movements WHERE reference_type='sale' AND reference_id = p_sale_id AND movement_type='earn') THEN
    RETURN 0;
  END IF;

  v_points := floor(v_sale.total * v_settings.points_per_unit);
  IF v_points <= 0 THEN RETURN 0; END IF;

  INSERT INTO loyalty_movements (tenant_id, customer_id, movement_type, points, reference_type, reference_id, performed_by, notes)
  VALUES (v_sale.tenant_id, v_sale.customer_id, 'earn', v_points, 'sale', p_sale_id, auth.uid(), 'Compra ' || COALESCE(v_sale.ticket_number,''));

  UPDATE customers SET
    loyalty_points = loyalty_points + v_points,
    total_spent = total_spent + v_sale.total,
    visits_count = visits_count + 1,
    updated_at = now()
  WHERE id = v_sale.customer_id
  RETURNING total_spent INTO v_new_total;

  v_new_tier := CASE
    WHEN v_new_total >= v_settings.platinum_threshold THEN 'platinum'
    WHEN v_new_total >= v_settings.gold_threshold THEN 'gold'
    WHEN v_new_total >= v_settings.silver_threshold THEN 'silver'
    ELSE 'bronze' END;
  UPDATE customers SET loyalty_tier = v_new_tier WHERE id = v_sale.customer_id AND loyalty_tier <> v_new_tier;

  RETURN v_points;
END; $$;

-- RPC: redeem loyalty points
CREATE OR REPLACE FUNCTION public.redeem_loyalty_points(p_customer_id uuid, p_points numeric, p_sale_id uuid DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_customer record;
  v_settings record;
  v_value numeric;
BEGIN
  SELECT * INTO v_customer FROM customers WHERE id = p_customer_id FOR UPDATE;
  IF v_customer IS NULL THEN RAISE EXCEPTION 'Cliente no encontrado'; END IF;
  IF p_points <= 0 THEN RAISE EXCEPTION 'Puntos inválidos'; END IF;
  IF v_customer.loyalty_points < p_points THEN RAISE EXCEPTION 'Puntos insuficientes'; END IF;

  SELECT * INTO v_settings FROM loyalty_settings WHERE tenant_id = v_customer.tenant_id;
  IF v_settings IS NULL THEN RAISE EXCEPTION 'Fidelización no configurada'; END IF;

  v_value := p_points * v_settings.value_per_point;

  UPDATE customers SET loyalty_points = loyalty_points - p_points, updated_at = now() WHERE id = p_customer_id;

  INSERT INTO loyalty_movements (tenant_id, customer_id, movement_type, points, reference_type, reference_id, performed_by, notes)
  VALUES (v_customer.tenant_id, p_customer_id, 'redeem', -p_points, 'sale', p_sale_id, auth.uid(), 'Canje por ' || v_value::text);

  RETURN v_value;
END; $$;

-- RPC: validate coupon
CREATE OR REPLACE FUNCTION public.validate_coupon(p_tenant_id uuid, p_code text, p_amount numeric, p_customer_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c record;
  v_discount numeric;
  v_used_by_customer integer;
BEGIN
  SELECT * INTO c FROM coupons WHERE tenant_id = p_tenant_id AND upper(code) = upper(p_code) AND is_active;
  IF c IS NULL THEN RETURN jsonb_build_object('valid', false, 'error', 'Cupón no existe'); END IF;
  IF c.valid_from > CURRENT_DATE THEN RETURN jsonb_build_object('valid', false, 'error', 'Aún no vigente'); END IF;
  IF c.valid_until IS NOT NULL AND c.valid_until < CURRENT_DATE THEN RETURN jsonb_build_object('valid', false, 'error', 'Vencido'); END IF;
  IF c.max_uses IS NOT NULL AND c.uses_count >= c.max_uses THEN RETURN jsonb_build_object('valid', false, 'error', 'Sin usos disponibles'); END IF;
  IF p_amount < c.min_amount THEN RETURN jsonb_build_object('valid', false, 'error', 'Monto mínimo: ' || c.min_amount); END IF;
  IF p_customer_id IS NOT NULL AND c.max_uses_per_customer IS NOT NULL THEN
    SELECT COUNT(*) INTO v_used_by_customer FROM coupon_redemptions WHERE coupon_id = c.id AND customer_id = p_customer_id;
    IF v_used_by_customer >= c.max_uses_per_customer THEN
      RETURN jsonb_build_object('valid', false, 'error', 'Cliente ya alcanzó el límite');
    END IF;
  END IF;

  v_discount := CASE WHEN c.discount_type = 'percent' THEN p_amount * c.discount_value / 100.0 ELSE c.discount_value END;
  IF v_discount > p_amount THEN v_discount := p_amount; END IF;

  RETURN jsonb_build_object('valid', true, 'coupon_id', c.id, 'discount', v_discount, 'description', c.description, 'discount_type', c.discount_type, 'discount_value', c.discount_value);
END; $$;

-- RPC: apply coupon to sale
CREATE OR REPLACE FUNCTION public.apply_coupon_to_sale(p_sale_id uuid, p_coupon_id uuid, p_discount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sale record;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF v_sale IS NULL THEN RAISE EXCEPTION 'Venta no encontrada'; END IF;

  INSERT INTO coupon_redemptions (tenant_id, coupon_id, sale_id, customer_id, discount_applied)
  VALUES (v_sale.tenant_id, p_coupon_id, p_sale_id, v_sale.customer_id, p_discount);

  UPDATE coupons SET uses_count = uses_count + 1, updated_at = now() WHERE id = p_coupon_id;
END; $$;

-- Trigger: auto-award on sale paid
CREATE OR REPLACE FUNCTION public.trg_auto_award_loyalty() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status <> 'paid') AND NEW.customer_id IS NOT NULL THEN
    PERFORM public.award_loyalty_points(NEW.id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_auto_award_loyalty ON public.sales;
CREATE TRIGGER trg_auto_award_loyalty
AFTER INSERT OR UPDATE OF status ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_award_loyalty();
