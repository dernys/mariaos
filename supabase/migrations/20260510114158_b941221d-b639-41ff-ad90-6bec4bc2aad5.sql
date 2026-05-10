-- Extend stores
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS schedule jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS geo_lat numeric,
  ADD COLUMN IF NOT EXISTS geo_lng numeric,
  ADD COLUMN IF NOT EXISTS manager_id uuid,
  ADD COLUMN IF NOT EXISTS operational_status text DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS capacity integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS store_type text DEFAULT 'retail',
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS opened_at date;

-- Extend warehouses
ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS warehouse_type text DEFAULT 'central',
  ADD COLUMN IF NOT EXISTS zones jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS geo_lat numeric,
  ADD COLUMN IF NOT EXISTS geo_lng numeric,
  ADD COLUMN IF NOT EXISTS manager_id uuid;

-- Store incidents
CREATE TABLE IF NOT EXISTS public.store_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  incident_type text NOT NULL,
  severity text NOT NULL DEFAULT 'low',
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  reported_by uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_incidents tenant access" ON public.store_incidents
  FOR ALL USING (public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_tenant_member(tenant_id));

CREATE TRIGGER trg_store_incidents_updated_at
  BEFORE UPDATE ON public.store_incidents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Operational checklists
CREATE TABLE IF NOT EXISTS public.operational_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  checklist_type text NOT NULL DEFAULT 'opening',
  scope text NOT NULL DEFAULT 'store',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operational_checklists tenant access" ON public.operational_checklists
  FOR ALL USING (public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_tenant_member(tenant_id));

CREATE TRIGGER trg_operational_checklists_updated_at
  BEFORE UPDATE ON public.operational_checklists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Checklist runs
CREATE TABLE IF NOT EXISTS public.checklist_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  checklist_id uuid NOT NULL REFERENCES public.operational_checklists(id) ON DELETE CASCADE,
  location_type text NOT NULL,
  location_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'in_progress',
  responses jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  started_by uuid,
  completed_by uuid,
  completed_at timestamptz,
  score numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.checklist_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklist_runs tenant access" ON public.checklist_runs
  FOR ALL USING (public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_tenant_member(tenant_id));

CREATE TRIGGER trg_checklist_runs_updated_at
  BEFORE UPDATE ON public.checklist_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_store_incidents_store ON public.store_incidents(store_id, status);
CREATE INDEX IF NOT EXISTS idx_store_incidents_tenant ON public.store_incidents(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checklist_runs_location ON public.checklist_runs(location_type, location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checklist_runs_tenant ON public.checklist_runs(tenant_id, status);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.store_incidents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_runs;