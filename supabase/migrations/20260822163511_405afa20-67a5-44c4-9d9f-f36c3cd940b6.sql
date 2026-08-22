-- 1) Membership check becomes strict: superadmin => ONLY the active tenant (fail closed)
CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _tenant IS NULL THEN false
    WHEN public.is_superadmin(auth.uid()) THEN _tenant = public.sa_active_tenant()
    ELSE EXISTS (
      SELECT 1 FROM public.tenant_users
      WHERE user_id = auth.uid() AND tenant_id = _tenant
    )
  END
$function$;

-- 2) sales_shifts: tenant-scoped policies only (no "own row" bypass)
DROP POLICY IF EXISTS "Users can view own shifts" ON public.sales_shifts;
DROP POLICY IF EXISTS "Users can insert own shifts" ON public.sales_shifts;
DROP POLICY IF EXISTS "Users can update own shifts" ON public.sales_shifts;
DROP POLICY IF EXISTS "Superadmin can view all sales_shifts" ON public.sales_shifts;
DROP POLICY IF EXISTS "Superadmin can insert sales_shifts" ON public.sales_shifts;
DROP POLICY IF EXISTS "Superadmin can update sales_shifts" ON public.sales_shifts;
DROP POLICY IF EXISTS "Admins can view tenant shifts" ON public.sales_shifts;
DROP POLICY IF EXISTS "Tenant members can view tenant shifts" ON public.sales_shifts;

CREATE POLICY "shifts_select_active_tenant" ON public.sales_shifts
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "shifts_insert_active_tenant" ON public.sales_shifts
  FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(tenant_id) AND user_id = auth.uid());
CREATE POLICY "shifts_update_active_tenant" ON public.sales_shifts
  FOR UPDATE TO authenticated
  USING (public.is_tenant_member(tenant_id) AND (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.is_superadmin(auth.uid())))
  WITH CHECK (public.is_tenant_member(tenant_id));

-- 3) shift_cash_movements: no anon, tenant-scoped
DROP POLICY IF EXISTS "Tenant view shift_cash_movements" ON public.shift_cash_movements;
DROP POLICY IF EXISTS "Tenant insert shift_cash_movements" ON public.shift_cash_movements;
DROP POLICY IF EXISTS "Superadmin view shift_cash_movements" ON public.shift_cash_movements;
DROP POLICY IF EXISTS "Superadmin insert shift_cash_movements" ON public.shift_cash_movements;

CREATE POLICY "scm_select_active_tenant" ON public.shift_cash_movements
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "scm_insert_active_tenant" ON public.shift_cash_movements
  FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(tenant_id));

-- 4) account_payments: no anon, tenant-scoped
DROP POLICY IF EXISTS "Tenant view account_payments" ON public.account_payments;
DROP POLICY IF EXISTS "Tenant insert account_payments" ON public.account_payments;
DROP POLICY IF EXISTS "Superadmin all account_payments" ON public.account_payments;

CREATE POLICY "ap_select_active_tenant" ON public.account_payments
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "ap_insert_active_tenant" ON public.account_payments
  FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(tenant_id));

-- 5) Fail-closed write guards (also cover SECURITY DEFINER RPC paths)
CREATE OR REPLACE FUNCTION public.enforce_shift_tenant_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_store_tenant uuid; v_emp_tenant uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF; -- server-side seeding/provisioning

  IF NEW.tenant_id IS NULL OR NOT public.is_tenant_member(NEW.tenant_id) THEN
    RAISE EXCEPTION 'forbidden: turno fuera del negocio activo';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.tenant_id <> OLD.tenant_id THEN
    RAISE EXCEPTION 'forbidden: no se puede mover un turno a otro negocio';
  END IF;

  IF NEW.store_id IS NOT NULL THEN
    SELECT tenant_id INTO v_store_tenant FROM public.stores WHERE id = NEW.store_id;
    IF v_store_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'forbidden: el local pertenece a otro negocio';
    END IF;
  END IF;

  IF NEW.employee_id IS NOT NULL THEN
    SELECT tenant_id INTO v_emp_tenant FROM public.employees WHERE id = NEW.employee_id;
    IF v_emp_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'forbidden: el trabajador pertenece a otro negocio';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_shift_tenant_scope() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_shift_tenant_scope ON public.sales_shifts;
CREATE TRIGGER trg_enforce_shift_tenant_scope
  BEFORE INSERT OR UPDATE ON public.sales_shifts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_shift_tenant_scope();

CREATE OR REPLACE FUNCTION public.enforce_shift_movement_tenant_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_shift_tenant uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  SELECT tenant_id INTO v_shift_tenant FROM public.sales_shifts WHERE id = NEW.shift_id;
  IF v_shift_tenant IS NULL THEN RAISE EXCEPTION 'forbidden: turno inexistente'; END IF;
  IF NEW.tenant_id IS NULL THEN NEW.tenant_id := v_shift_tenant; END IF;
  IF NEW.tenant_id <> v_shift_tenant THEN
    RAISE EXCEPTION 'forbidden: el movimiento pertenece a otro negocio que el turno';
  END IF;
  IF NOT public.is_tenant_member(NEW.tenant_id) THEN
    RAISE EXCEPTION 'forbidden: movimiento de caja fuera del negocio activo';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_shift_movement_tenant_scope() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_scm_tenant_scope ON public.shift_cash_movements;
CREATE TRIGGER trg_enforce_scm_tenant_scope
  BEFORE INSERT OR UPDATE ON public.shift_cash_movements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_shift_movement_tenant_scope();