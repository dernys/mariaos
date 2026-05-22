
CREATE TABLE IF NOT EXISTS public.tenant_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['read']::text[],
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON public.tenant_api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON public.tenant_api_keys(key_hash) WHERE is_active;
ALTER TABLE public.tenant_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_keys_select ON public.tenant_api_keys FOR SELECT USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
CREATE POLICY api_keys_ins ON public.tenant_api_keys FOR INSERT WITH CHECK (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
CREATE POLICY api_keys_upd ON public.tenant_api_keys FOR UPDATE USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
CREATE POLICY api_keys_del ON public.tenant_api_keys FOR DELETE USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  secret text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  events text[] NOT NULL DEFAULT ARRAY['sale.created']::text[],
  is_active boolean NOT NULL DEFAULT true,
  failure_count int NOT NULL DEFAULT 0,
  last_delivery_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhooks_tenant ON public.webhooks(tenant_id);
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY wh_select ON public.webhooks FOR SELECT USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
CREATE POLICY wh_ins ON public.webhooks FOR INSERT WITH CHECK (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
CREATE POLICY wh_upd ON public.webhooks FOR UPDATE USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
CREATE POLICY wh_del ON public.webhooks FOR DELETE USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  webhook_id uuid REFERENCES public.webhooks(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  status_code int,
  response text,
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wh_del_pending ON public.webhook_deliveries(next_attempt_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_wh_del_tenant ON public.webhook_deliveries(tenant_id);
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY wd_select ON public.webhook_deliveries FOR SELECT USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));

CREATE OR REPLACE FUNCTION public.enqueue_webhook_event(p_tenant_id uuid, p_event text, p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wh record;
BEGIN
  FOR wh IN SELECT id FROM public.webhooks WHERE tenant_id = p_tenant_id AND is_active AND p_event = ANY(events) LOOP
    INSERT INTO public.webhook_deliveries(tenant_id, webhook_id, event, payload) VALUES (p_tenant_id, wh.id, p_event, p_payload);
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_webhook_sale_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('paid','partial') THEN
    PERFORM public.enqueue_webhook_event(NEW.tenant_id, 'sale.created',
      jsonb_build_object('id', NEW.id, 'total', NEW.total, 'status', NEW.status,
        'customer_id', NEW.customer_id, 'store_id', NEW.store_id, 'created_at', NEW.created_at));
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS sales_webhook ON public.sales;
CREATE TRIGGER sales_webhook AFTER INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_sale_created();

CREATE OR REPLACE FUNCTION public.trg_webhook_shift_closed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'closed' AND COALESCE(OLD.status,'') <> 'closed' THEN
    PERFORM public.enqueue_webhook_event(NEW.tenant_id, 'shift.closed',
      jsonb_build_object('id', NEW.id, 'employee_id', NEW.employee_id, 'store_id', NEW.store_id,
        'closed_at', NEW.closed_at, 'total_sales', NEW.total_sales));
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS shifts_webhook ON public.sales_shifts;
CREATE TRIGGER shifts_webhook AFTER UPDATE ON public.sales_shifts FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_shift_closed();
