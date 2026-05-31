-- Fix ambigüedad de columna hours_worked en compute_payroll
CREATE OR REPLACE FUNCTION public.compute_payroll(_employee_id UUID, _start DATE, _end DATE)
RETURNS TABLE (hours_worked NUMERIC, base NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hours NUMERIC;
  _salary NUMERIC;
BEGIN
  SELECT COALESCE(SUM(ea.hours_worked), 0) INTO _hours
  FROM public.employee_attendance ea
  WHERE ea.employee_id = _employee_id
    AND ea.check_in::date >= _start
    AND ea.check_in::date <= _end
    AND ea.check_out IS NOT NULL;
  SELECT COALESCE(e.salary, 0) INTO _salary FROM public.employees e WHERE e.id = _employee_id;
  hours_worked := _hours;
  base := _salary;
  RETURN NEXT;
END;
$$;