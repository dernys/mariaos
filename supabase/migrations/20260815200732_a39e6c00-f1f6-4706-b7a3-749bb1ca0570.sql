-- 1. Canal de venta
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'presencial',
  ADD COLUMN IF NOT EXISTS fulfillment text NOT NULL DEFAULT 'in_store',
  ADD COLUMN IF NOT EXISTS online_order_id uuid REFERENCES public.online_orders(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.sales ADD CONSTRAINT sales_channel_check CHECK (channel IN ('online','presencial'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.sales ADD CONSTRAINT sales_fulfillment_check CHECK (fulfillment IN ('in_store','pickup','delivery'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_sales_channel ON public.sales(tenant_id, channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_online_order ON public.sales(online_order_id);

-- 2. Pedidos online enriquecidos
ALTER TABLE public.online_orders
  ADD COLUMN IF NOT EXISTS sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cash_on_delivery',
  ADD COLUMN IF NOT EXISTS delivery_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zone_id uuid REFERENCES public.delivery_zones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_instructions text,
  ADD COLUMN IF NOT EXISTS delivery_lat numeric,
  ADD COLUMN IF NOT EXISTS delivery_lng numeric,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

CREATE INDEX IF NOT EXISTS idx_online_orders_user ON public.online_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_online_orders_status ON public.online_orders(tenant_id, status, created_at DESC);

-- 3. Direcciones del cliente
CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL DEFAULT 'Casa',
  address text NOT NULL,
  latitude numeric,
  longitude numeric,
  instructions text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_addresses TO authenticated;
GRANT ALL ON public.customer_addresses TO service_role;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own addresses" ON public.customer_addresses;
CREATE POLICY "own addresses" ON public.customer_addresses
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_customer_addresses_user ON public.customer_addresses(user_id);

-- 4. Perfil global de repartidor
CREATE TABLE IF NOT EXISTS public.rider_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text NOT NULL,
  email text,
  avatar_url text,
  document_id text,
  vehicle_type text NOT NULL DEFAULT 'bike',
  vehicle_plate text,
  vehicle_details text,
  experience_years numeric NOT NULL DEFAULT 0,
  preferred_zone text,
  bio text,
  status text NOT NULL DEFAULT 'pending',
  availability text NOT NULL DEFAULT 'unavailable',
  max_active_deliveries integer NOT NULL DEFAULT 3,
  current_lat numeric,
  current_lng numeric,
  location_updated_at timestamptz,
  destination_lat numeric,
  destination_lng numeric,
  rating_avg numeric NOT NULL DEFAULT 0,
  ratings_count integer NOT NULL DEFAULT 0,
  deliveries_completed integer NOT NULL DEFAULT 0,
  deliveries_cancelled integer NOT NULL DEFAULT 0,
  offers_received integer NOT NULL DEFAULT 0,
  offers_accepted integer NOT NULL DEFAULT 0,
  on_time_deliveries integer NOT NULL DEFAULT 0,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rider_status_check CHECK (status IN ('pending','reviewing','approved','rejected','suspended')),
  CONSTRAINT rider_availability_check CHECK (availability IN ('available','unavailable','busy','paused'))
);

GRANT SELECT, INSERT, UPDATE ON public.rider_profiles TO authenticated;
GRANT ALL ON public.rider_profiles TO service_role;
ALTER TABLE public.rider_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rider owns profile" ON public.rider_profiles;
CREATE POLICY "rider owns profile" ON public.rider_profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "rider creates own profile" ON public.rider_profiles;
CREATE POLICY "rider creates own profile" ON public.rider_profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "rider updates own profile" ON public.rider_profiles;
CREATE POLICY "rider updates own profile" ON public.rider_profiles
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "businesses read riders" ON public.rider_profiles;
CREATE POLICY "businesses read riders" ON public.rider_profiles
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gerente')
    OR public.has_role(auth.uid(),'supervisor') OR public.is_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "admins review riders" ON public.rider_profiles;
CREATE POLICY "admins review riders" ON public.rider_profiles
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gerente') OR public.is_superadmin(auth.uid())
  ) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_rider_profiles_status ON public.rider_profiles(status, availability);

-- 5. Entregas enriquecidas
ALTER TABLE public.delivery_assignments
  ADD COLUMN IF NOT EXISTS rider_profile_id uuid REFERENCES public.rider_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pickup_address text,
  ADD COLUMN IF NOT EXISTS pickup_lat numeric,
  ADD COLUMN IF NOT EXISTS pickup_lng numeric,
  ADD COLUMN IF NOT EXISTS dropoff_address text,
  ADD COLUMN IF NOT EXISTS dropoff_lat numeric,
  ADD COLUMN IF NOT EXISTS dropoff_lng numeric,
  ADD COLUMN IF NOT EXISTS instructions text,
  ADD COLUMN IF NOT EXISTS estimated_minutes integer,
  ADD COLUMN IF NOT EXISTS actual_minutes integer,
  ADD COLUMN IF NOT EXISTS requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS recommendation_score numeric,
  ADD COLUMN IF NOT EXISTS recommendation_reasons jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_assignment_order_active
  ON public.delivery_assignments(online_order_id)
  WHERE status NOT IN ('cancelled','rejected');

CREATE INDEX IF NOT EXISTS idx_delivery_assignments_rider ON public.delivery_assignments(rider_profile_id, status);

DROP POLICY IF EXISTS "riders see own assignments" ON public.delivery_assignments;
CREATE POLICY "riders see own assignments" ON public.delivery_assignments
  FOR SELECT TO authenticated USING (
    rider_profile_id IN (SELECT id FROM public.rider_profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "customers see own deliveries" ON public.delivery_assignments;
CREATE POLICY "customers see own deliveries" ON public.delivery_assignments
  FOR SELECT TO authenticated USING (
    online_order_id IN (SELECT id FROM public.online_orders WHERE user_id = auth.uid())
  );

-- 6. Valoraciones cruzadas
CREATE TABLE IF NOT EXISTS public.delivery_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  online_order_id uuid REFERENCES public.online_orders(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.delivery_assignments(id) ON DELETE SET NULL,
  rider_profile_id uuid REFERENCES public.rider_profiles(id) ON DELETE SET NULL,
  rater_role text NOT NULL,
  ratee_role text NOT NULL,
  rater_user_id uuid,
  stars numeric NOT NULL,
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_ratings_stars_check CHECK (stars >= 1 AND stars <= 5),
  CONSTRAINT delivery_ratings_rater_check CHECK (rater_role IN ('customer','business','rider')),
  CONSTRAINT delivery_ratings_ratee_check CHECK (ratee_role IN ('rider','business'))
);

GRANT SELECT, INSERT, UPDATE ON public.delivery_ratings TO authenticated;
GRANT ALL ON public.delivery_ratings TO service_role;
ALTER TABLE public.delivery_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "participants read ratings" ON public.delivery_ratings;
CREATE POLICY "participants read ratings" ON public.delivery_ratings
  FOR SELECT TO authenticated USING (
    rater_user_id = auth.uid()
    OR rider_profile_id IN (SELECT id FROM public.rider_profiles WHERE user_id = auth.uid())
    OR public.is_tenant_member(tenant_id)
    OR public.is_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "participants write ratings" ON public.delivery_ratings;
CREATE POLICY "participants write ratings" ON public.delivery_ratings
  FOR INSERT TO authenticated WITH CHECK (
    (rater_role = 'customer' AND rater_user_id = auth.uid()
      AND online_order_id IN (SELECT id FROM public.online_orders WHERE user_id = auth.uid() AND status = 'delivered'))
    OR (rater_role = 'business' AND public.is_tenant_member(tenant_id))
    OR (rater_role = 'rider' AND rider_profile_id IN (SELECT id FROM public.rider_profiles WHERE user_id = auth.uid()))
  );

CREATE INDEX IF NOT EXISTS idx_delivery_ratings_rider ON public.delivery_ratings(rider_profile_id);
CREATE INDEX IF NOT EXISTS idx_delivery_ratings_order ON public.delivery_ratings(online_order_id);

-- 7. Triggers updated_at
DROP TRIGGER IF EXISTS trg_customer_addresses_updated ON public.customer_addresses;
CREATE TRIGGER trg_customer_addresses_updated BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_rider_profiles_updated ON public.rider_profiles;
CREATE TRIGGER trg_rider_profiles_updated BEFORE UPDATE ON public.rider_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_delivery_ratings_updated ON public.delivery_ratings;
CREATE TRIGGER trg_delivery_ratings_updated BEFORE UPDATE ON public.delivery_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
