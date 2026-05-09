
-- Enums
DO $$ BEGIN
  CREATE TYPE public.agent_type AS ENUM ('cfo','inventory','operations','marketplace','compliance','procurement','analytics');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.agent_status AS ENUM ('active','paused','training','error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.autonomy_level AS ENUM ('manual','suggest','auto_approve','autonomous');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.action_status AS ENUM ('pending','approved','rejected','executed','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.risk_severity AS ENUM ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ai_agents
CREATE TABLE IF NOT EXISTS public.ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  type public.agent_type NOT NULL,
  name text NOT NULL,
  description text,
  status public.agent_status NOT NULL DEFAULT 'active',
  autonomy_level public.autonomy_level NOT NULL DEFAULT 'suggest',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_agents_tenant ON public.ai_agents(tenant_id);

-- agent_actions
CREATE TABLE IF NOT EXISTS public.agent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  target_entity_type text,
  target_entity_id uuid,
  status public.action_status NOT NULL DEFAULT 'pending',
  requires_approval boolean NOT NULL DEFAULT true,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  approved_by uuid,
  approved_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_actions_tenant ON public.agent_actions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_agent ON public.agent_actions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_status ON public.agent_actions(status);

-- business_events
CREATE TABLE IF NOT EXISTS public.business_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  source text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_business_events_tenant ON public.business_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_business_events_processed ON public.business_events(processed);

-- business_decisions
CREATE TABLE IF NOT EXISTS public.business_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  title text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommendation jsonb NOT NULL DEFAULT '{}'::jsonb,
  reasoning text,
  outcome jsonb,
  effectiveness_score numeric,
  status public.action_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_business_decisions_tenant ON public.business_decisions(tenant_id);

-- business_memory
CREATE TABLE IF NOT EXISTS public.business_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  topic text NOT NULL,
  summary text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_decision_id uuid REFERENCES public.business_decisions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_business_memory_tenant ON public.business_memory(tenant_id);

-- risk_alerts
CREATE TABLE IF NOT EXISTS public.risk_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  severity public.risk_severity NOT NULL DEFAULT 'medium',
  category text NOT NULL,
  title text NOT NULL,
  description text,
  entity_type text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_tenant ON public.risk_alerts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_status ON public.risk_alerts(status);

-- workflows
CREATE TABLE IF NOT EXISTS public.workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  trigger jsonb NOT NULL DEFAULT '{}'::jsonb,
  definition jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  run_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workflows_tenant ON public.workflows(tenant_id);

-- Enable RLS
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

-- RLS policies (tenant member or superadmin)
CREATE POLICY "tenant_members_select_ai_agents" ON public.ai_agents FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_members_modify_ai_agents" ON public.ai_agents FOR ALL USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));

CREATE POLICY "tenant_members_select_agent_actions" ON public.agent_actions FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_members_modify_agent_actions" ON public.agent_actions FOR ALL USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));

CREATE POLICY "tenant_members_select_business_events" ON public.business_events FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_members_modify_business_events" ON public.business_events FOR ALL USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));

CREATE POLICY "tenant_members_select_business_decisions" ON public.business_decisions FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_members_modify_business_decisions" ON public.business_decisions FOR ALL USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));

CREATE POLICY "tenant_members_select_business_memory" ON public.business_memory FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_members_modify_business_memory" ON public.business_memory FOR ALL USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));

CREATE POLICY "tenant_members_select_risk_alerts" ON public.risk_alerts FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_members_modify_risk_alerts" ON public.risk_alerts FOR ALL USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));

CREATE POLICY "tenant_members_select_workflows" ON public.workflows FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_members_modify_workflows" ON public.workflows FOR ALL USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));

-- updated_at triggers
CREATE TRIGGER trg_ai_agents_updated BEFORE UPDATE ON public.ai_agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_agent_actions_updated BEFORE UPDATE ON public.agent_actions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_business_decisions_updated BEFORE UPDATE ON public.business_decisions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_business_memory_updated BEFORE UPDATE ON public.business_memory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_workflows_updated BEFORE UPDATE ON public.workflows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_actions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.business_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.risk_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.business_decisions;
