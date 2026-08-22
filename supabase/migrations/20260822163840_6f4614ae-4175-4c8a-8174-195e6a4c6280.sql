CREATE OR REPLACE FUNCTION public.open_shift(_store_id uuid, _employee_id uuid, _opening_cash numeric DEFAULT NULL::numeric, _pin text DEFAULT NULL::text, _notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tenant UUID;
  _store_name TEXT;
  _emp_user UUID;
  _emp_name TEXT;
  _emp_tenant UUID;
  _shift_id UUID;
  _prev_close numeric := 0;
  _declared numeric;
  _final numeric;
  _diff numeric := 0;
  _has_prev boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT tenant_id, name INTO _tenant, _store_name FROM public.stores WHERE id = _store_id;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'Store not found'; END IF;

  -- FAIL CLOSED: el local debe pertenecer al negocio activo del usuario
  IF NOT public.is_tenant_member(_tenant) THEN
    RAISE EXCEPTION 'forbidden: el local no pertenece al negocio activo';
  END IF;

  SELECT user_id, name, tenant_id INTO _emp_user, _emp_name, _emp_tenant
    FROM public.employees WHERE id = _employee_id;
  IF _emp_name IS NULL THEN RAISE EXCEPTION 'Employee not found'; END IF;
  IF _emp_tenant IS DISTINCT FROM _tenant THEN
    RAISE EXCEPTION 'forbidden: el trabajador pertenece a otro negocio';
  END IF;

  IF EXISTS (SELECT 1 FROM public.sales_shifts WHERE store_id = _store_id AND status = 'open') THEN
    RAISE EXCEPTION 'This store already has an open shift';
  END IF;

  IF _emp_user IS DISTINCT FROM auth.uid() THEN
    IF _pin IS NULL OR NOT public.verify_employee_pin(_employee_id, _pin) THEN
      RAISE EXCEPTION 'Worker PIN required or invalid';
    END IF;
  END IF;

  SELECT COALESCE(s.closing_cash, s.declared_cash, 0), true INTO _prev_close, _has_prev
  FROM public.sales_shifts s
  WHERE s.store_id = _store_id AND s.status = 'closed' AND s.closed_at IS NOT NULL
  ORDER BY s.closed_at DESC
  LIMIT 1;

  _declared := COALESCE(_opening_cash, 0);
  IF _declared < 0 THEN RAISE EXCEPTION 'El fondo inicial no puede ser negativo'; END IF;

  IF COALESCE(_has_prev, false) THEN
    _final := _declared;
    _diff := _declared - COALESCE(_prev_close, 0);
  ELSE
    _final := _declared;
    _diff := 0;
  END IF;

  INSERT INTO public.sales_shifts(
    tenant_id, user_id, employee_id, store_id, store_name,
    opening_cash, status, opened_at, notes
  ) VALUES (
    _tenant, auth.uid(), _employee_id, _store_id, _store_name,
    _final, 'open', now(), _notes
  ) RETURNING id INTO _shift_id;

  INSERT INTO public.activity_log(tenant_id, entity_type, entity_id, action, description, metadata, performed_by)
  VALUES (
    _tenant, 'sales_shift', _shift_id, 'opened',
    format('Turno abierto en %s por %s (trabajador: %s). Fondo inicial %s (cierre anterior %s%s)',
           _store_name,
           COALESCE((SELECT full_name FROM profiles WHERE user_id = auth.uid()), 'usuario'),
           _emp_name, _final::text, COALESCE(_prev_close,0)::text,
           CASE WHEN abs(_diff) > 0.005 THEN format(', diferencia %s', _diff::text) ELSE '' END),
    jsonb_build_object(
      'store_id', _store_id, 'store_name', _store_name,
      'opened_by_user', auth.uid(), 'worker_employee', _employee_id,
      'worker_is_opener', (_emp_user = auth.uid()),
      'opening_cash', _final,
      'previous_closing_cash', COALESCE(_prev_close, 0),
      'opening_difference', _diff,
      'has_previous_close', COALESCE(_has_prev, false)
    ),
    auth.uid()
  );

  RETURN _shift_id;
END;
$function$;