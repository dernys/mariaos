ALTER FUNCTION public.verify_employee_pin(uuid, text) SET search_path = public, extensions;
ALTER FUNCTION public.default_employee_pin() SET search_path = public, extensions;
ALTER FUNCTION public.set_employee_pin(uuid, text) SET search_path = public, extensions;