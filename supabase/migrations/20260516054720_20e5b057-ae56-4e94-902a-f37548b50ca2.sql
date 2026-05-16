
-- ============ EMPLOYEES: EXPEDIENTE DIGITAL ============
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS document_id text,
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS social_security_number text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS termination_date date,
  ADD COLUMN IF NOT EXISTS vacation_days_per_year numeric NOT NULL DEFAULT 22;

-- ============ CONTRATOS ============
CREATE TABLE IF NOT EXISTS public.employee_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  contract_type text NOT NULL DEFAULT 'indefinite' CHECK (contract_type IN ('indefinite','fixed','temporary','internship','freelance','part_time')),
  start_date date NOT NULL,
  end_date date,
  probation_end_date date,
  base_salary numeric NOT NULL DEFAULT 0,
  weekly_hours numeric NOT NULL DEFAULT 40,
  clauses text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','terminated','expired','draft')),
  signed_at timestamptz,
  document_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_contracts" ON public.employee_contracts
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
CREATE TRIGGER trg_contracts_tenant BEFORE INSERT ON public.employee_contracts
  FOR EACH ROW EXECUTE FUNCTION autofill_tenant_id();
CREATE TRIGGER trg_contracts_updated BEFORE UPDATE ON public.employee_contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============ DOCUMENTOS DEL EMPLEADO ============
CREATE TABLE IF NOT EXISTS public.employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  name text NOT NULL,
  file_url text NOT NULL,
  file_size bigint,
  mime_type text,
  expires_at date,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_emp_docs" ON public.employee_documents
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
CREATE TRIGGER trg_emp_docs_tenant BEFORE INSERT ON public.employee_documents
  FOR EACH ROW EXECUTE FUNCTION autofill_tenant_id();

-- ============ LEAVE REQUESTS ============
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type text NOT NULL CHECK (leave_type IN ('vacation','sick','personal','maternity','paternity','unpaid','other')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  approved_by uuid,
  approved_at timestamptz,
  rejection_reason text,
  attachment_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_leaves" ON public.leave_requests
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
CREATE INDEX IF NOT EXISTS idx_leaves_employee ON public.leave_requests(employee_id, status);
CREATE TRIGGER trg_leaves_tenant BEFORE INSERT ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION autofill_tenant_id();
CREATE TRIGGER trg_leaves_updated BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============ OVERTIME ============
CREATE TABLE IF NOT EXISTS public.overtime_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  hours numeric NOT NULL,
  pay_factor numeric NOT NULL DEFAULT 1.5,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','paid')),
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.overtime_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_overtime" ON public.overtime_records
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
CREATE TRIGGER trg_overtime_tenant BEFORE INSERT ON public.overtime_records
  FOR EACH ROW EXECUTE FUNCTION autofill_tenant_id();

-- ============ ATTENDANCE EXTENSION ============
ALTER TABLE public.employee_attendance
  ADD COLUMN IF NOT EXISTS check_in_lat numeric,
  ADD COLUMN IF NOT EXISTS check_in_lng numeric,
  ADD COLUMN IF NOT EXISTS check_out_lat numeric,
  ADD COLUMN IF NOT EXISTS check_out_lng numeric,
  ADD COLUMN IF NOT EXISTS check_in_photo text,
  ADD COLUMN IF NOT EXISTS check_out_photo text,
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'present',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'web';

-- ============ RPC: CLOCK IN ============
CREATE OR REPLACE FUNCTION public.clock_in(
  p_employee_id uuid, p_lat numeric DEFAULT NULL, p_lng numeric DEFAULT NULL,
  p_photo text DEFAULT NULL, p_store_id uuid DEFAULT NULL, p_source text DEFAULT 'web'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_open uuid; v_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM employees WHERE id = p_employee_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Empleado no encontrado'; END IF;

  SELECT id INTO v_open FROM employee_attendance
    WHERE employee_id = p_employee_id AND check_out IS NULL
    ORDER BY check_in DESC LIMIT 1;
  IF v_open IS NOT NULL THEN RAISE EXCEPTION 'Ya hay un fichaje abierto'; END IF;

  INSERT INTO employee_attendance (
    tenant_id, employee_id, check_in, check_in_lat, check_in_lng, check_in_photo, store_id, source, status
  ) VALUES (
    v_tenant, p_employee_id, now(), p_lat, p_lng, p_photo, p_store_id, COALESCE(p_source,'web'), 'present'
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ============ RPC: CLOCK OUT ============
CREATE OR REPLACE FUNCTION public.clock_out(
  p_employee_id uuid, p_lat numeric DEFAULT NULL, p_lng numeric DEFAULT NULL, p_photo text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM employee_attendance
    WHERE employee_id = p_employee_id AND check_out IS NULL
    ORDER BY check_in DESC LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'No hay fichaje abierto'; END IF;

  UPDATE employee_attendance SET
    check_out = now(), check_out_lat = p_lat, check_out_lng = p_lng, check_out_photo = p_photo
  WHERE id = v_id;
  RETURN v_id;
END $$;

-- ============ RPC: REQUEST LEAVE ============
CREATE OR REPLACE FUNCTION public.request_leave(
  p_employee_id uuid, p_type text, p_start date, p_end date, p_reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_days numeric; v_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM employees WHERE id = p_employee_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Empleado no encontrado'; END IF;
  IF p_end < p_start THEN RAISE EXCEPTION 'Fechas inválidas'; END IF;
  v_days := (p_end - p_start) + 1;

  INSERT INTO leave_requests (tenant_id, employee_id, leave_type, start_date, end_date, days, reason)
  VALUES (v_tenant, p_employee_id, p_type, p_start, p_end, v_days, p_reason)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ============ RPC: APPROVE / REJECT LEAVE ============
CREATE OR REPLACE FUNCTION public.approve_leave(p_leave_id uuid, p_approve boolean, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE leave_requests SET
    status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    approved_by = auth.uid(),
    approved_at = now(),
    rejection_reason = CASE WHEN p_approve THEN NULL ELSE p_reason END
  WHERE id = p_leave_id AND status = 'pending';
END $$;

-- ============ HELPER: VACATION BALANCE ============
CREATE OR REPLACE FUNCTION public.employee_vacation_balance(p_employee_id uuid, p_year integer DEFAULT NULL)
RETURNS TABLE(entitled numeric, taken numeric, pending numeric, remaining numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year int := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::int);
        v_entitled numeric;
BEGIN
  SELECT COALESCE(vacation_days_per_year,22) INTO v_entitled FROM employees WHERE id = p_employee_id;
  RETURN QUERY
  SELECT v_entitled,
    COALESCE((SELECT SUM(days) FROM leave_requests
      WHERE employee_id = p_employee_id AND leave_type='vacation' AND status='approved'
        AND EXTRACT(YEAR FROM start_date) = v_year),0),
    COALESCE((SELECT SUM(days) FROM leave_requests
      WHERE employee_id = p_employee_id AND leave_type='vacation' AND status='pending'
        AND EXTRACT(YEAR FROM start_date) = v_year),0),
    v_entitled - COALESCE((SELECT SUM(days) FROM leave_requests
      WHERE employee_id = p_employee_id AND leave_type='vacation' AND status IN ('approved','pending')
        AND EXTRACT(YEAR FROM start_date) = v_year),0);
END $$;

-- ============ STORAGE BUCKET ============
INSERT INTO storage.buckets (id, name, public) VALUES ('hr-documents','hr-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "tenant_hr_docs_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'hr-documents' AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text FROM tenant_users WHERE user_id = auth.uid()
    UNION SELECT t.id::text FROM tenants t WHERE is_superadmin(auth.uid())
  ));
CREATE POLICY "tenant_hr_docs_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'hr-documents' AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text FROM tenant_users WHERE user_id = auth.uid()
    UNION SELECT t.id::text FROM tenants t WHERE is_superadmin(auth.uid())
  ));
CREATE POLICY "tenant_hr_docs_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'hr-documents' AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text FROM tenant_users WHERE user_id = auth.uid()
    UNION SELECT t.id::text FROM tenants t WHERE is_superadmin(auth.uid())
  ));
