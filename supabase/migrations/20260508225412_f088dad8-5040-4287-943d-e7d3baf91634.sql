
-- Stores: location & delivery radius
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS delivery_radius_km numeric DEFAULT 5,
  ADD COLUMN IF NOT EXISTS accepts_delivery boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS accepts_pickup boolean DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_stores_geo ON public.stores (latitude, longitude) WHERE latitude IS NOT NULL;

-- Products: deliverable flag
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_deliverable boolean DEFAULT true;

-- Online orders linkage
ALTER TABLE public.online_orders
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL;

-- Public stores view (only safe data)
CREATE OR REPLACE VIEW public.stores_public
WITH (security_invoker = on) AS
  SELECT id, tenant_id, name, address, latitude, longitude,
         COALESCE(delivery_radius_km, 5) AS delivery_radius_km,
         COALESCE(accepts_delivery, true) AS accepts_delivery,
         COALESCE(accepts_pickup, true) AS accepts_pickup
  FROM public.stores
  WHERE is_active = true AND latitude IS NOT NULL AND longitude IS NOT NULL;

GRANT SELECT ON public.stores_public TO anon, authenticated;

-- Distance helper (haversine in km)
CREATE OR REPLACE FUNCTION public.distance_km(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT 6371 * 2 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians(lon2 - lon1) / 2), 2)
  ))::numeric;
$$;

-- Auto-create/link customer when online order is placed
CREATE OR REPLACE FUNCTION public.upsert_customer_for_online_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer_id uuid;
BEGIN
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;

  -- Try match by phone, then by email within same tenant
  IF NEW.customer_phone IS NOT NULL AND length(trim(NEW.customer_phone)) > 0 THEN
    SELECT id INTO v_customer_id FROM public.customers
      WHERE tenant_id = NEW.tenant_id AND phone = NEW.customer_phone LIMIT 1;
  END IF;
  IF v_customer_id IS NULL AND NEW.customer_email IS NOT NULL AND length(trim(NEW.customer_email)) > 0 THEN
    SELECT id INTO v_customer_id FROM public.customers
      WHERE tenant_id = NEW.tenant_id AND email = NEW.customer_email LIMIT 1;
  END IF;

  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (tenant_id, name, phone, email, address, notes)
    VALUES (
      NEW.tenant_id,
      COALESCE(NULLIF(trim(NEW.customer_name), ''), 'Cliente Marketplace'),
      NULLIF(trim(NEW.customer_phone), ''),
      NULLIF(trim(NEW.customer_email), ''),
      NEW.delivery_address,
      'Registrado vía Marketplace'
    ) RETURNING id INTO v_customer_id;
  ELSE
    UPDATE public.customers SET
      visits_count = COALESCE(visits_count, 0) + 1,
      address = COALESCE(NEW.delivery_address, address),
      updated_at = now()
    WHERE id = v_customer_id;
  END IF;

  NEW.customer_id := v_customer_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_upsert_customer_online_order ON public.online_orders;
CREATE TRIGGER trg_upsert_customer_online_order
  BEFORE INSERT ON public.online_orders
  FOR EACH ROW EXECUTE FUNCTION public.upsert_customer_for_online_order();
