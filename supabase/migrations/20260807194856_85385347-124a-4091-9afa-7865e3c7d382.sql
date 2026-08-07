-- FASE 4 — Event store en shadow mode (append-only, sin efectos de estado)

CREATE TABLE IF NOT EXISTS public.domain_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid,
  version integer NOT NULL DEFAULT 1,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id text,
  operation_id text,
  source text NOT NULL DEFAULT 'db_trigger',
  shadow boolean NOT NULL DEFAULT true,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.domain_events TO authenticated;
GRANT ALL ON public.domain_events TO service_role;

ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "domain_events_select_tenant" ON public.domain_events
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_domain_events_tenant_occurred ON public.domain_events (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_domain_events_type ON public.domain_events (event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_domain_events_aggregate ON public.domain_events (aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_domain_events_correlation ON public.domain_events (correlation_id) WHERE correlation_id IS NOT NULL;

-- Append-only: prohibido modificar o borrar eventos
CREATE OR REPLACE FUNCTION public.domain_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'domain_events es append-only: no se permite % ', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_domain_events_append_only ON public.domain_events;
CREATE TRIGGER trg_domain_events_append_only
  BEFORE UPDATE OR DELETE ON public.domain_events
  FOR EACH ROW EXECUTE FUNCTION public.domain_events_append_only();

-- Emisor único de eventos
CREATE OR REPLACE FUNCTION public.emit_domain_event(
  p_tenant_id uuid,
  p_event_type text,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_source text DEFAULT 'db_trigger'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.domain_events (
    tenant_id, event_type, aggregate_type, aggregate_id, payload, metadata,
    correlation_id, operation_id, source, shadow
  ) VALUES (
    p_tenant_id, p_event_type, p_aggregate_type, p_aggregate_id,
    COALESCE(p_payload, '{}'::jsonb), COALESCE(p_metadata, '{}'::jsonb),
    NULLIF(p_metadata->>'correlation_id',''), NULLIF(p_metadata->>'operation_id',''),
    COALESCE(p_source, 'db_trigger'), true
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.emit_domain_event(uuid, text, text, uuid, jsonb, jsonb, text) TO authenticated, service_role;

-- sales.completed
CREATE OR REPLACE FUNCTION public.emit_sale_completed_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR COALESCE(OLD.status,'') <> 'completed') THEN
    PERFORM public.emit_domain_event(
      NEW.tenant_id, 'sales.completed', 'sale', NEW.id,
      to_jsonb(NEW), jsonb_build_object('trigger', TG_NAME), 'db_trigger'
    );
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_sale_completed ON public.sales;
CREATE TRIGGER trg_event_sale_completed
  AFTER INSERT OR UPDATE OF status ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.emit_sale_completed_event();

-- purchase.received
CREATE OR REPLACE FUNCTION public.emit_purchase_received_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'received' AND (TG_OP = 'INSERT' OR COALESCE(OLD.status,'') <> 'received') THEN
    PERFORM public.emit_domain_event(
      NEW.tenant_id, 'purchase.received', 'purchase', NEW.id,
      to_jsonb(NEW), jsonb_build_object('trigger', TG_NAME), 'db_trigger'
    );
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_purchase_received ON public.purchases;
CREATE TRIGGER trg_event_purchase_received
  AFTER INSERT OR UPDATE OF status ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.emit_purchase_received_event();

-- inventory.moved
CREATE OR REPLACE FUNCTION public.emit_inventory_moved_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.emit_domain_event(
    NEW.tenant_id, 'inventory.moved', 'inventory_movement', NEW.id,
    to_jsonb(NEW), jsonb_build_object('trigger', TG_NAME), 'db_trigger'
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_inventory_moved ON public.inventory_movements;
CREATE TRIGGER trg_event_inventory_moved
  AFTER INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.emit_inventory_moved_event();

-- payment.registered
CREATE OR REPLACE FUNCTION public.emit_payment_registered_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.emit_domain_event(
    NEW.tenant_id, 'payment.registered', 'account_payment', NEW.id,
    to_jsonb(NEW), jsonb_build_object('trigger', TG_NAME), 'db_trigger'
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_payment_registered ON public.account_payments;
CREATE TRIGGER trg_event_payment_registered
  AFTER INSERT ON public.account_payments
  FOR EACH ROW EXECUTE FUNCTION public.emit_payment_registered_event();

-- Vista de divergencias: eventos sin proyección contable y estado sin evento
CREATE OR REPLACE VIEW public.domain_event_divergences
WITH (security_invoker = true)
AS
WITH first_event AS (
  SELECT tenant_id, min(occurred_at) AS since FROM public.domain_events GROUP BY tenant_id
)
-- 1) evento emitido pero sin asiento contable asociado
SELECT
  e.tenant_id,
  'event_without_projection'::text AS divergence_type,
  e.event_type,
  e.aggregate_type,
  e.aggregate_id,
  e.occurred_at AS detected_for,
  'El evento existe pero no hay asiento contable para el agregado'::text AS detail
FROM public.domain_events e
WHERE e.event_type IN ('sales.completed','purchase.received')
  AND NOT EXISTS (
    SELECT 1 FROM public.journal_entries j
    WHERE j.reference_id = e.aggregate_id
      AND j.reference_type = CASE e.event_type WHEN 'sales.completed' THEN 'sale' ELSE 'purchase' END
  )

UNION ALL
-- 2) venta completada sin evento (posterior al inicio del shadow run)
SELECT
  s.tenant_id,
  'state_without_event'::text,
  'sales.completed'::text,
  'sale'::text,
  s.id,
  s.created_at,
  'Venta completada sin evento emitido'::text
FROM public.sales s
JOIN first_event f ON f.tenant_id = s.tenant_id
WHERE s.status = 'completed'
  AND s.created_at >= f.since
  AND NOT EXISTS (
    SELECT 1 FROM public.domain_events e
    WHERE e.aggregate_id = s.id AND e.event_type = 'sales.completed'
  )

UNION ALL
-- 3) compra recibida sin evento
SELECT
  p.tenant_id,
  'state_without_event'::text,
  'purchase.received'::text,
  'purchase'::text,
  p.id,
  p.created_at,
  'Compra recibida sin evento emitido'::text
FROM public.purchases p
JOIN first_event f ON f.tenant_id = p.tenant_id
WHERE p.status = 'received'
  AND p.created_at >= f.since
  AND NOT EXISTS (
    SELECT 1 FROM public.domain_events e
    WHERE e.aggregate_id = p.id AND e.event_type = 'purchase.received'
  )

UNION ALL
-- 4) movimiento de inventario sin evento
SELECT
  m.tenant_id,
  'state_without_event'::text,
  'inventory.moved'::text,
  'inventory_movement'::text,
  m.id,
  m.created_at,
  'Movimiento de inventario sin evento emitido'::text
FROM public.inventory_movements m
JOIN first_event f ON f.tenant_id = m.tenant_id
WHERE m.created_at >= f.since
  AND NOT EXISTS (
    SELECT 1 FROM public.domain_events e
    WHERE e.aggregate_id = m.id AND e.event_type = 'inventory.moved'
  );

GRANT SELECT ON public.domain_event_divergences TO authenticated;

-- Resumen del shadow run
CREATE OR REPLACE FUNCTION public.domain_events_shadow_summary(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT (public.is_tenant_member(p_tenant_id) OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT jsonb_build_object(
    'tenant_id', p_tenant_id,
    'total_events', (SELECT count(*) FROM public.domain_events WHERE tenant_id = p_tenant_id),
    'since', (SELECT min(occurred_at) FROM public.domain_events WHERE tenant_id = p_tenant_id),
    'last_event_at', (SELECT max(occurred_at) FROM public.domain_events WHERE tenant_id = p_tenant_id),
    'by_type', COALESCE((
      SELECT jsonb_object_agg(event_type, c)
      FROM (SELECT event_type, count(*) AS c FROM public.domain_events WHERE tenant_id = p_tenant_id GROUP BY event_type) t
    ), '{}'::jsonb),
    'divergences', (SELECT count(*) FROM public.domain_event_divergences WHERE tenant_id = p_tenant_id),
    'divergences_by_type', COALESCE((
      SELECT jsonb_object_agg(divergence_type, c)
      FROM (SELECT divergence_type, count(*) AS c FROM public.domain_event_divergences WHERE tenant_id = p_tenant_id GROUP BY divergence_type) d
    ), '{}'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.domain_events_shadow_summary(uuid) TO authenticated, service_role;