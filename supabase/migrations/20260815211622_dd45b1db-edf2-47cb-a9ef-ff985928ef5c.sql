-- ============ HISTORIAL DE PEDIDOS / DELIVERY ============
CREATE TABLE IF NOT EXISTS public.online_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
  assignment_id uuid,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid,
  actor_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ooe_order ON public.online_order_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ooe_tenant ON public.online_order_events(tenant_id, created_at DESC);

GRANT SELECT, INSERT ON public.online_order_events TO authenticated;
GRANT ALL ON public.online_order_events TO service_role;

ALTER TABLE public.online_order_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant staff can view order events"
ON public.online_order_events FOR SELECT TO authenticated
USING (public.is_tenant_member(tenant_id));

CREATE POLICY "Buyers can view their order events"
ON public.online_order_events FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.online_orders o WHERE o.id = order_id AND o.user_id = auth.uid()));

CREATE POLICY "Riders can view assigned order events"
ON public.online_order_events FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.delivery_assignments da
  JOIN public.rider_profiles rp ON rp.id = da.rider_profile_id
  WHERE da.online_order_id = online_order_events.order_id AND rp.user_id = auth.uid()
));

CREATE POLICY "Tenant staff can add order events"
ON public.online_order_events FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member(tenant_id));

-- helper
CREATE OR REPLACE FUNCTION public.log_online_order_event(
  p_order_id uuid, p_event_type text, p_from text DEFAULT NULL, p_to text DEFAULT NULL,
  p_note text DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb, p_assignment_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_id uuid; v_label text;
BEGIN
  SELECT tenant_id INTO v_tenant FROM online_orders WHERE id = p_order_id;
  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  SELECT COALESCE(full_name, email) INTO v_label FROM profiles WHERE id = auth.uid();
  INSERT INTO online_order_events (tenant_id, order_id, assignment_id, event_type, from_status, to_status, note, metadata, actor_user_id, actor_label)
  VALUES (v_tenant, p_order_id, p_assignment_id, p_event_type, p_from, p_to, p_note, COALESCE(p_metadata,'{}'::jsonb), auth.uid(), v_label)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- triggers
CREATE OR REPLACE FUNCTION public.trg_online_order_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_label text;
BEGIN
  SELECT COALESCE(full_name, email) INTO v_label FROM profiles WHERE id = auth.uid();
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
END $$;

DROP TRIGGER IF EXISTS trg_online_order_event_ins ON public.online_orders;
CREATE TRIGGER trg_online_order_event_ins AFTER INSERT ON public.online_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_online_order_event();

DROP TRIGGER IF EXISTS trg_online_order_event_upd ON public.online_orders;
CREATE TRIGGER trg_online_order_event_upd AFTER UPDATE ON public.online_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_online_order_event();

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
    INSERT INTO online_order_events (tenant_id, order_id, assignment_id, event_type, event_type, note, metadata, actor_user_id, actor_label)
    VALUES (NEW.tenant_id, NEW.online_order_id, NEW.id, 'delivery_reassigned', 'delivery_reassigned',
            'Repartidor reasignado a ' || COALESCE(v_rider,'—'), jsonb_build_object('rider', v_rider), auth.uid(), v_label);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_delivery_assignment_event_ins ON public.delivery_assignments;
CREATE TRIGGER trg_delivery_assignment_event_ins AFTER INSERT ON public.delivery_assignments
FOR EACH ROW EXECUTE FUNCTION public.trg_delivery_assignment_event();

DROP TRIGGER IF EXISTS trg_delivery_assignment_event_upd ON public.delivery_assignments;
CREATE TRIGGER trg_delivery_assignment_event_upd AFTER UPDATE ON public.delivery_assignments
FOR EACH ROW EXECUTE FUNCTION public.trg_delivery_assignment_event();

-- ============ ACCIONES DE PEDIDO ============
CREATE OR REPLACE FUNCTION public.update_online_order(
  p_order_id uuid,
  p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_delivery_address text DEFAULT NULL,
  p_delivery_instructions text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_delivery_fee numeric DEFAULT NULL,
  p_delivery_type text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_o online_orders%ROWTYPE; v_changes jsonb := '{}'::jsonb; v_fee numeric;
BEGIN
  SELECT * INTO v_o FROM online_orders WHERE id = p_order_id FOR UPDATE;
  IF v_o.id IS NULL THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF NOT (is_superadmin(auth.uid()) OR is_tenant_member(v_o.tenant_id)) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF v_o.status IN ('delivered','cancelled') THEN RAISE EXCEPTION 'El pedido ya está cerrado y no puede editarse'; END IF;
  IF p_delivery_type IS NOT NULL AND p_delivery_type NOT IN ('pickup','delivery') THEN
    RAISE EXCEPTION 'Modalidad inválida';
  END IF;

  v_fee := COALESCE(p_delivery_fee, v_o.delivery_fee);
  IF COALESCE(p_delivery_type, v_o.delivery_type) = 'pickup' THEN v_fee := 0; END IF;

  IF p_customer_name IS NOT NULL AND p_customer_name <> v_o.customer_name THEN
    v_changes := v_changes || jsonb_build_object('customer_name', jsonb_build_array(v_o.customer_name, p_customer_name));
  END IF;
  IF p_delivery_address IS NOT NULL AND p_delivery_address IS DISTINCT FROM v_o.delivery_address THEN
    v_changes := v_changes || jsonb_build_object('delivery_address', jsonb_build_array(v_o.delivery_address, p_delivery_address));
  END IF;
  IF v_fee IS DISTINCT FROM v_o.delivery_fee THEN
    v_changes := v_changes || jsonb_build_object('delivery_fee', jsonb_build_array(v_o.delivery_fee, v_fee));
  END IF;

  UPDATE online_orders SET
    customer_name = COALESCE(p_customer_name, customer_name),
    customer_phone = COALESCE(p_customer_phone, customer_phone),
    delivery_address = COALESCE(p_delivery_address, delivery_address),
    delivery_instructions = COALESCE(p_delivery_instructions, delivery_instructions),
    notes = COALESCE(p_notes, notes),
    delivery_type = COALESCE(p_delivery_type, delivery_type),
    delivery_fee = v_fee,
    total = subtotal + COALESCE(tax,0) + v_fee,
    updated_at = now()
  WHERE id = p_order_id;

  UPDATE delivery_assignments SET dropoff_address = COALESCE(p_delivery_address, dropoff_address),
    instructions = COALESCE(p_delivery_instructions, instructions)
   WHERE online_order_id = p_order_id AND status NOT IN ('delivered','cancelled','rejected');

  PERFORM log_online_order_event(p_order_id, 'order_edited', v_o.status, v_o.status,
    'Datos del pedido actualizados', jsonb_build_object('changes', v_changes));
END $$;

CREATE OR REPLACE FUNCTION public.add_online_order_note(p_order_id uuid, p_note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  IF coalesce(btrim(p_note),'') = '' THEN RAISE EXCEPTION 'La nota no puede estar vacía'; END IF;
  SELECT tenant_id INTO v_tenant FROM online_orders WHERE id = p_order_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF NOT (is_superadmin(auth.uid()) OR is_tenant_member(v_tenant)) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  RETURN log_online_order_event(p_order_id, 'note_added', NULL, NULL, btrim(p_note));
END $$;

-- Asignación automática al mejor repartidor sugerido
CREATE OR REPLACE FUNCTION public.auto_assign_best_rider(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_o online_orders%ROWTYPE; v_best record; v_assignment uuid;
BEGIN
  SELECT * INTO v_o FROM online_orders WHERE id = p_order_id;
  IF v_o.id IS NULL THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF NOT (is_superadmin(auth.uid()) OR is_tenant_member(v_o.tenant_id)) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF v_o.delivery_type <> 'delivery' THEN RAISE EXCEPTION 'El pedido no es de delivery'; END IF;

  SELECT * INTO v_best FROM recommend_riders_for_order(p_order_id, 1) LIMIT 1;
  IF v_best IS NULL THEN
    RETURN jsonb_build_object('assigned', false, 'reason', 'Sin repartidores disponibles');
  END IF;

  v_assignment := request_delivery_assignment(p_order_id, v_best.rider_profile_id, v_best.score, v_best.reasons);
  PERFORM log_online_order_event(p_order_id, 'auto_assigned', NULL, NULL,
    'Asignación automática a ' || v_best.full_name,
    jsonb_build_object('score', v_best.score, 'reasons', v_best.reasons), v_assignment);

  RETURN jsonb_build_object('assigned', true, 'assignment_id', v_assignment,
    'rider_profile_id', v_best.rider_profile_id, 'rider_name', v_best.full_name, 'score', v_best.score);
END $$;

CREATE OR REPLACE FUNCTION public.reassign_delivery(p_order_id uuid, p_rider_profile_id uuid, p_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_o online_orders%ROWTYPE; v_id uuid;
BEGIN
  SELECT * INTO v_o FROM online_orders WHERE id = p_order_id;
  IF v_o.id IS NULL THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF NOT (is_superadmin(auth.uid()) OR is_tenant_member(v_o.tenant_id)) THEN RAISE EXCEPTION 'No autorizado'; END IF;

  UPDATE delivery_assignments SET status = 'cancelled', cancelled_at = now(),
    cancel_reason = COALESCE(p_reason, 'Reasignado por el negocio')
   WHERE online_order_id = p_order_id AND status NOT IN ('delivered','cancelled','rejected');

  v_id := request_delivery_assignment(p_order_id, p_rider_profile_id, NULL, NULL);
  PERFORM log_online_order_event(p_order_id, 'delivery_reassigned', NULL, NULL, p_reason, '{}'::jsonb, v_id);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_delivery_assignment(p_order_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_o online_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_o FROM online_orders WHERE id = p_order_id;
  IF v_o.id IS NULL THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF NOT (is_superadmin(auth.uid()) OR is_tenant_member(v_o.tenant_id)) THEN RAISE EXCEPTION 'No autorizado'; END IF;

  UPDATE delivery_assignments SET status = 'cancelled', cancelled_at = now(),
    cancel_reason = COALESCE(p_reason, 'Cancelado por el negocio')
   WHERE online_order_id = p_order_id AND status NOT IN ('delivered','cancelled','rejected');

  UPDATE online_orders SET status = 'ready', updated_at = now()
   WHERE id = p_order_id AND status IN ('rider_assigned','in_transit');

  PERFORM log_online_order_event(p_order_id, 'delivery_cancelled', NULL, NULL, p_reason);
END $$;

-- ============ NÓMINAS: EDICIÓN, APROBACIÓN Y LOTE ============
CREATE OR REPLACE FUNCTION public.update_payroll_run(
  p_payroll_id uuid,
  p_bonus numeric DEFAULT NULL,
  p_deductions numeric DEFAULT NULL,
  p_hours_worked numeric DEFAULT NULL,
  p_base_salary numeric DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_payment_method text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p payroll_runs%ROWTYPE; v_base numeric; v_bonus numeric; v_ded numeric; v_net numeric;
BEGIN
  SELECT * INTO v_p FROM payroll_runs WHERE id = p_payroll_id FOR UPDATE;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'Nómina no encontrada'; END IF;
  IF NOT (is_superadmin(auth.uid()) OR is_tenant_member(v_p.tenant_id)) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF v_p.status = 'paid' THEN RAISE EXCEPTION 'La nómina ya está pagada y no puede editarse'; END IF;

  v_base := COALESCE(p_base_salary, v_p.base_salary);
  v_bonus := COALESCE(p_bonus, v_p.bonus);
  v_ded := COALESCE(p_deductions, v_p.deductions);
  v_net := v_base + v_bonus - v_ded;

  UPDATE payroll_runs SET
    base_salary = v_base, bonus = v_bonus, deductions = v_ded,
    hours_worked = COALESCE(p_hours_worked, hours_worked),
    gross_salary = v_base + v_bonus,
    net_pay = v_net,
    notes = COALESCE(p_notes, notes),
    payment_method = COALESCE(p_payment_method, payment_method)
  WHERE id = p_payroll_id;

  UPDATE accounts_payable SET amount = v_net, description = 'Nómina ' || v_p.period_start || ' → ' || v_p.period_end
   WHERE source_type = 'payroll' AND source_id = p_payroll_id AND status <> 'paid';

  RETURN p_payroll_id;
END $$;

CREATE OR REPLACE FUNCTION public.approve_payroll_run(p_payroll_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p payroll_runs%ROWTYPE;
BEGIN
  SELECT * INTO v_p FROM payroll_runs WHERE id = p_payroll_id FOR UPDATE;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'Nómina no encontrada'; END IF;
  IF NOT (is_superadmin(auth.uid()) OR is_tenant_member(v_p.tenant_id)) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF v_p.status = 'paid' THEN RAISE EXCEPTION 'La nómina ya está pagada'; END IF;
  UPDATE payroll_runs SET status = 'approved', approved_at = now(), approved_by = auth.uid()
   WHERE id = p_payroll_id;
  RETURN p_payroll_id;
END $$;

CREATE OR REPLACE FUNCTION public.generate_payroll_batch(
  p_tenant_id uuid, p_period_start date, p_period_end date,
  p_bonus numeric DEFAULT 0, p_deductions numeric DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_emp record; v_row record; v_created int := 0; v_skipped int := 0; v_names text[] := '{}';
BEGIN
  IF NOT (is_superadmin(auth.uid()) OR is_tenant_member(p_tenant_id)) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_period_end < p_period_start THEN RAISE EXCEPTION 'Rango de fechas inválido'; END IF;

  FOR v_emp IN
    SELECT id, name FROM employees
     WHERE tenant_id = p_tenant_id AND is_active = true AND position_id IS NOT NULL
     ORDER BY name
  LOOP
    IF EXISTS (SELECT 1 FROM payroll_runs WHERE tenant_id = p_tenant_id AND employee_id = v_emp.id
                 AND period_start = p_period_start AND period_end = p_period_end) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    SELECT * INTO v_row FROM compute_payroll(v_emp.id, p_period_start, p_period_end) LIMIT 1;
    INSERT INTO payroll_runs (tenant_id, employee_id, period_start, period_end, base_salary,
      hours_worked, bonus, deductions, gross_salary, net_pay)
    VALUES (p_tenant_id, v_emp.id, p_period_start, p_period_end, COALESCE(v_row.base,0),
      COALESCE(v_row.hours_worked,0), COALESCE(p_bonus,0), COALESCE(p_deductions,0),
      COALESCE(v_row.base,0) + COALESCE(p_bonus,0),
      COALESCE(v_row.base,0) + COALESCE(p_bonus,0) - COALESCE(p_deductions,0));
    v_created := v_created + 1;
    v_names := array_append(v_names, v_emp.name);
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'skipped', v_skipped, 'employees', v_names);
END $$;
