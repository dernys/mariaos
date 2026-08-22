-- STORES
DROP POLICY IF EXISTS "Tenant members can view stores" ON public.stores;
DROP POLICY IF EXISTS "Tenant members can insert stores" ON public.stores;
DROP POLICY IF EXISTS "Tenant members can update stores" ON public.stores;
DROP POLICY IF EXISTS "Superadmin can view all stores" ON public.stores;
DROP POLICY IF EXISTS "Superadmin can insert stores" ON public.stores;
DROP POLICY IF EXISTS "Superadmin can update stores" ON public.stores;

CREATE POLICY "stores_select_active_tenant" ON public.stores
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "stores_insert_active_tenant" ON public.stores
  FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "stores_update_active_tenant" ON public.stores
  FOR UPDATE TO authenticated USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));

-- EMPLOYEES
DROP POLICY IF EXISTS "Tenant members can view employees" ON public.employees;
DROP POLICY IF EXISTS "Superadmin can view all employees2" ON public.employees;
DROP POLICY IF EXISTS "Superadmin can insert employees" ON public.employees;
DROP POLICY IF EXISTS "Superadmin can update employees" ON public.employees;

CREATE POLICY "employees_select_active_tenant" ON public.employees
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "employees_insert_active_tenant" ON public.employees
  FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "employees_update_active_tenant" ON public.employees
  FOR UPDATE TO authenticated USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));

-- SALES
DROP POLICY IF EXISTS "Tenant members can view sales" ON public.sales;
DROP POLICY IF EXISTS "Tenant members can update sales" ON public.sales;
DROP POLICY IF EXISTS "Superadmin can view all sales" ON public.sales;
DROP POLICY IF EXISTS "Superadmin can update sales" ON public.sales;

CREATE POLICY "sales_update_active_tenant" ON public.sales
  FOR UPDATE TO authenticated USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));

-- SALE_PAYMENTS (keep only the strict tenant-scoped read)
DROP POLICY IF EXISTS "Tenant members can view payments" ON public.sale_payments;
DROP POLICY IF EXISTS "Superadmin can view all sale_payments" ON public.sale_payments;