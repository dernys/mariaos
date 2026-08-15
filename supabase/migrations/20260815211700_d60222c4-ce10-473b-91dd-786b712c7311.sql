CREATE OR REPLACE FUNCTION public.trg_delivery_assignment_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_label text; v_rider text;
BEGIN
  SELECT COALESCE(full_name, email) INTO v_label FROM profiles WHERE id = auth.uid();
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
END $$;