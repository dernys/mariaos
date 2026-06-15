
ALTER TABLE public.delivery_riders
  ADD COLUMN IF NOT EXISTS document_id text,
  ADD COLUMN IF NOT EXISTS license_number text,
  ADD COLUMN IF NOT EXISTS license_expiry date,
  ADD COLUMN IF NOT EXISTS vehicle_plate text,
  ADD COLUMN IF NOT EXISTS vehicle_brand text,
  ADD COLUMN IF NOT EXISTS vehicle_model text,
  ADD COLUMN IF NOT EXISTS vehicle_year int,
  ADD COLUMN IF NOT EXISTS insurance_provider text,
  ADD COLUMN IF NOT EXISTS insurance_policy text,
  ADD COLUMN IF NOT EXISTS insurance_expiry date,
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS rating numeric(3,2) NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS total_deliveries int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE TABLE IF NOT EXISTS public.driver_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rider_id uuid NOT NULL REFERENCES public.delivery_riders(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.delivery_assignments(id) ON DELETE SET NULL,
  latitude numeric(10,7) NOT NULL,
  longitude numeric(10,7) NOT NULL,
  accuracy numeric,
  heading numeric,
  speed numeric,
  battery int,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_locations_rider ON public.driver_locations(rider_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_locations_tenant ON public.driver_locations(tenant_id, recorded_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_locations TO authenticated;
GRANT ALL ON public.driver_locations TO service_role;

ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_driver_locations_read" ON public.driver_locations
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid())
         OR public.is_superadmin(auth.uid()));

CREATE POLICY "tenant_driver_locations_write" ON public.driver_locations
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid())
              OR public.is_superadmin(auth.uid()));

CREATE POLICY "tenant_driver_locations_update" ON public.driver_locations
  FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid())
         OR public.is_superadmin(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;

CREATE OR REPLACE VIEW public.driver_last_location AS
SELECT DISTINCT ON (rider_id)
  rider_id, tenant_id, assignment_id, latitude, longitude, accuracy, heading, speed, battery, recorded_at
FROM public.driver_locations
ORDER BY rider_id, recorded_at DESC;

GRANT SELECT ON public.driver_last_location TO authenticated;
