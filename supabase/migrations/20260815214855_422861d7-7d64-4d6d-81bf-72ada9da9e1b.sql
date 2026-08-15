CREATE OR REPLACE FUNCTION public.current_actor_label()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_label text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT NULLIF(btrim(full_name), '') INTO v_label FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_label IS NULL THEN
    SELECT u.email INTO v_label FROM auth.users u WHERE u.id = auth.uid();
  END IF;
  RETURN v_label;
END $function$;

GRANT EXECUTE ON FUNCTION public.current_actor_label() TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.log_online_order_event(p_order_id uuid, p_event_type text, p_from text DEFAULT NULL::text, p_to text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_assignment_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_tenant uuid; v_id uuid; v_label text;
BEGIN
  SELECT tenant_id INTO v_tenant FROM online_orders WHERE id = p_order_id;
  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  v_label := public.current_actor_label();
  INSERT INTO online_order_events (tenant_id, order_id, assignment_id, event_type, from_status, to_status, note, metadata, actor_user_id, actor_label)
  VALUES (v_tenant, p_order_id, p_assignment_id, p_event_type, p_from, p_to, p_note, COALESCE(p_metadata,'{}'::jsonb), auth.uid(), v_label)
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.trg_online_order_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_label text;
BEGIN
  v_label := public.current_actor_label();
  IF TG_OP = 'INSERT' THEN
    INSERT INTO online_order_events (tenant_id, order_id, event_type, to_status, note, actor_user_id, actor_label, metadata)
    VALUES (NEW.tenant_id, NEW.id, 'order_created', NEW.status, 'Pedido recibido desde el marketplace', auth.uid(), v_label,
            jsonb_build_object('total', NEW.total, 'delivery_type', NEW.delivery_type));
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO online_order_events (tenant_id, order_id, event_type, from_status, to_status, note, actor_user_id, actor_label)
    VALUES (NEW.tenant_id, NEW.id, 'status_changed', OLD.status, NEW.status, NEW.cancel_reason, auth.uid(), v_label);
  END IF;
  IF NEW.sale_id IS DISTINCT FROM OLD.sale_id AND NEW.sale_id IS NOT NULL THEN
    INSERT INTO online_order_events (tenant_id, order_id, event_type, note, metadata, actor_user_id, actor_label)
    VALUES (NEW.tenant_id, NEW.id, 'sale_linked', 'Venta generada para el pedido', jsonb_build_object('sale_id', NEW.sale_id), auth.uid(), v_label);
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.trg_delivery_assignment_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_label text; v_rider text;
BEGIN
  v_label := public.current_actor_label();
  SELECT full_name INTO v_rider FROM rider_profiles WHERE id = NEW.rider_profile_id;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO online_order_events (tenant_id, order_id, assignment_id, event_type, to_status, note, metadata, actor_user_id, actor_label)
    VALUES (NEW.tenant_id, NEW.online_order_id, NEW.id, 'delivery_created', NEW.status,
            COALESCE('Entrega creada para ' || v_rider, 'Entrega creada'),
            jsonb_build_object('rider_profile_id', NEW.rider_profile_id, 'score', NEW.recommendation_score), auth.uid(), v_label);
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO online_order_events (tenant_id, order_id, assignment_id, event_type, from_status, to_status, note, metadata, actor_user_id, actor_label)
    VALUES (NEW.tenant_id, NEW.online_order_id, NEW.id, 'delivery_status_changed', OLD.status, NEW.status,
            COALESCE(NEW.cancel_reason, v_rider), jsonb_build_object('rider', v_rider), auth.uid(), v_label);
  ELSIF NEW.rider_profile_id IS DISTINCT FROM OLD.rider_profile_id THEN
    INSERT INTO online_order_events (tenant_id, order_id, assignment_id, event_type, note, metadata, actor_user_id, actor_label)
    VALUES (NEW.tenant_id, NEW.online_order_id, NEW.id, 'delivery_reassigned',
            'Repartidor reasignado a ' || COALESCE(v_rider,'—'), jsonb_build_object('rider', v_rider), auth.uid(), v_label);
  END IF;
  RETURN NEW;
END $function$;