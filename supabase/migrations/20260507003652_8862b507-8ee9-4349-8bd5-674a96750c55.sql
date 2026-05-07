
-- ===== HR: Attendance =====
CREATE TABLE public.employee_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  check_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  check_out TIMESTAMPTZ,
  hours_worked NUMERIC GENERATED ALWAYS AS (
    CASE WHEN check_out IS NOT NULL
      THEN EXTRACT(EPOCH FROM (check_out - check_in))/3600.0
      ELSE NULL END
  ) STORED,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_attendance" ON public.employee_attendance
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()) OR public.is_superadmin(auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()) OR public.is_superadmin(auth.uid()));
CREATE INDEX idx_attendance_employee ON public.employee_attendance(employee_id, check_in DESC);

-- ===== HR: Work Schedules (planned shifts) =====
CREATE TABLE public.work_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_schedules" ON public.work_schedules
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()) OR public.is_superadmin(auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()) OR public.is_superadmin(auth.uid()));

-- ===== HR: Payroll =====
CREATE TABLE public.payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  base_salary NUMERIC NOT NULL DEFAULT 0,
  hours_worked NUMERIC NOT NULL DEFAULT 0,
  bonus NUMERIC NOT NULL DEFAULT 0,
  deductions NUMERIC NOT NULL DEFAULT 0,
  net_pay NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_payroll" ON public.payroll_runs
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()) OR public.is_superadmin(auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()) OR public.is_superadmin(auth.uid()));

-- ===== Delivery: Zones =====
CREATE TABLE public.delivery_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  fee NUMERIC NOT NULL DEFAULT 0,
  estimated_minutes INTEGER NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_zones" ON public.delivery_zones
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()) OR public.is_superadmin(auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()) OR public.is_superadmin(auth.uid()));

-- Public read for zones (for marketplace)
CREATE POLICY "public_read_zones" ON public.delivery_zones FOR SELECT USING (is_active = true);

-- ===== Delivery: Riders =====
CREATE TABLE public.delivery_riders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  vehicle TEXT,
  is_available BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.delivery_riders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_riders" ON public.delivery_riders
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()) OR public.is_superadmin(auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()) OR public.is_superadmin(auth.uid()));

-- ===== Delivery: Assignments =====
CREATE TABLE public.delivery_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  online_order_id UUID NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
  rider_id UUID REFERENCES public.delivery_riders(id) ON DELETE SET NULL,
  zone_id UUID REFERENCES public.delivery_zones(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','picked_up','on_the_way','delivered','failed')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  notes TEXT
);
ALTER TABLE public.delivery_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_assignments" ON public.delivery_assignments
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()) OR public.is_superadmin(auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()) OR public.is_superadmin(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_assignments;

-- Compute payroll RPC: hours from attendance + base prorated
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
  SELECT COALESCE(SUM(hours_worked),0) INTO _hours
  FROM public.employee_attendance
  WHERE employee_id = _employee_id
    AND check_in::date >= _start
    AND check_in::date <= _end
    AND check_out IS NOT NULL;
  SELECT COALESCE(salary,0) INTO _salary FROM public.employees WHERE id = _employee_id;
  RETURN QUERY SELECT _hours, _salary;
END;
$$;
