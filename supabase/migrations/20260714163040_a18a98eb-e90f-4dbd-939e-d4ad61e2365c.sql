
-- Shift management enforcement + audit
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS access_pin_hash TEXT;

-- Enforce ONE open shift per store
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_shift_per_store
  ON public.sales_shifts(store_id) WHERE status = 'open' AND store_id IS NOT NULL;

-- Set/update employee PIN (hashed with bcrypt)
CREATE OR REPLACE FUNCTION public.set_employee_pin(_employee_id UUID, _pin TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant UUID;
BEGIN
  IF _pin IS NULL OR length(_pin) < 4 THEN
    RAISE EXCEPTION 'PIN must be at least 4 characters';
  END IF;
  SELECT tenant_id INTO _tenant FROM public.employees WHERE id = _employee_id;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'Employee not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND tenant_id = _tenant)
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.employees
     SET access_pin_hash = crypt(_pin, gen_salt('bf'))
   WHERE id = _employee_id;
END;
$$;

-- Verify PIN
CREATE OR REPLACE FUNCTION public.verify_employee_pin(_employee_id UUID, _pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hash TEXT;
BEGIN
  SELECT access_pin_hash INTO _hash FROM public.employees WHERE id = _employee_id;
  IF _hash IS NULL THEN RETURN FALSE; END IF;
  RETURN _hash = crypt(_pin, _hash);
END;
$$;

-- Open a shift atomically with worker/opener distinction and audit
CREATE OR REPLACE FUNCTION public.open_shift(
  _store_id UUID,
  _employee_id UUID,
  _opening_cash NUMERIC,
  _pin TEXT DEFAULT NULL,
  _notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant UUID;
  _store_name TEXT;
  _emp_user UUID;
  _emp_name TEXT;
  _shift_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT tenant_id, name INTO _tenant, _store_name FROM public.stores WHERE id = _store_id;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'Store not found'; END IF;

  IF EXISTS (SELECT 1 FROM public.sales_shifts WHERE store_id = _store_id AND status = 'open') THEN
    RAISE EXCEPTION 'This store already has an open shift';
  END IF;

  SELECT user_id, name INTO _emp_user, _emp_name FROM public.employees WHERE id = _employee_id;
  IF _emp_name IS NULL THEN RAISE EXCEPTION 'Employee not found'; END IF;

  -- If the assigned worker is NOT the opener, require the worker's PIN
  IF _emp_user IS DISTINCT FROM auth.uid() THEN
    IF _pin IS NULL OR NOT public.verify_employee_pin(_employee_id, _pin) THEN
      RAISE EXCEPTION 'Worker PIN required or invalid';
    END IF;
  END IF;

  INSERT INTO public.sales_shifts(
    tenant_id, user_id, employee_id, store_id, store_name,
    opening_cash, status, opened_at, notes
  ) VALUES (
    _tenant, auth.uid(), _employee_id, _store_id, _store_name,
    COALESCE(_opening_cash, 0), 'open', now(), _notes
  ) RETURNING id INTO _shift_id;

  INSERT INTO public.activity_log(tenant_id, entity_type, entity_id, action, description, metadata, performed_by)
  VALUES (
    _tenant, 'sales_shift', _shift_id, 'opened',
    format('Turno abierto en %s por %s (trabajador: %s)', _store_name,
           COALESCE((SELECT full_name FROM profiles WHERE user_id = auth.uid()), 'usuario'), _emp_name),
    jsonb_build_object(
      'store_id', _store_id, 'store_name', _store_name,
      'opened_by_user', auth.uid(), 'worker_employee', _employee_id,
      'worker_is_opener', (_emp_user = auth.uid()),
      'opening_cash', _opening_cash
    ),
    auth.uid()
  );

  RETURN _shift_id;
END;
$$;

-- Update editable shift fields (only while open, only opener or admin)
CREATE OR REPLACE FUNCTION public.update_shift(
  _shift_id UUID,
  _opening_cash NUMERIC DEFAULT NULL,
  _employee_id UUID DEFAULT NULL,
  _notes TEXT DEFAULT NULL,
  _pin TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sh public.sales_shifts;
  _old JSONB;
  _new JSONB;
  _emp_user UUID;
BEGIN
  SELECT * INTO _sh FROM public.sales_shifts WHERE id = _shift_id;
  IF _sh.id IS NULL THEN RAISE EXCEPTION 'Shift not found'; END IF;
  IF _sh.status <> 'open' THEN RAISE EXCEPTION 'Only open shifts can be edited'; END IF;
  IF _sh.user_id <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _employee_id IS NOT NULL AND _employee_id <> _sh.employee_id THEN
    SELECT user_id INTO _emp_user FROM public.employees WHERE id = _employee_id;
    IF _emp_user IS DISTINCT FROM auth.uid() THEN
      IF _pin IS NULL OR NOT public.verify_employee_pin(_employee_id, _pin) THEN
        RAISE EXCEPTION 'Worker PIN required or invalid';
      END IF;
    END IF;
  END IF;

  _old := jsonb_build_object('opening_cash', _sh.opening_cash, 'employee_id', _sh.employee_id, 'notes', _sh.notes);

  UPDATE public.sales_shifts
     SET opening_cash = COALESCE(_opening_cash, opening_cash),
         employee_id  = COALESCE(_employee_id, employee_id),
         notes        = COALESCE(_notes, notes),
         updated_at   = now()
   WHERE id = _shift_id;

  _new := jsonb_build_object('opening_cash', COALESCE(_opening_cash, _sh.opening_cash),
                             'employee_id', COALESCE(_employee_id, _sh.employee_id),
                             'notes', COALESCE(_notes, _sh.notes));

  INSERT INTO public.activity_log(tenant_id, entity_type, entity_id, action, description, metadata, performed_by)
  VALUES (_sh.tenant_id, 'sales_shift', _shift_id, 'updated',
          'Turno editado', jsonb_build_object('before', _old, 'after', _new), auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_employee_pin(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_employee_pin(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_shift(UUID, UUID, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_shift(UUID, NUMERIC, UUID, TEXT, TEXT) TO authenticated;
