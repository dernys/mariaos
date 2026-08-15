-- customers
DROP POLICY IF EXISTS "Admins can delete customers" ON public.customers;
CREATE POLICY "Admins can delete customers" ON public.customers FOR DELETE TO authenticated
USING (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin'::app_role) AND is_tenant_member(tenant_id)));

-- employees
DROP POLICY IF EXISTS "Admins can manage employees" ON public.employees;
CREATE POLICY "Admins can manage employees" ON public.employees FOR ALL TO authenticated
USING (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin'::app_role) AND is_tenant_member(tenant_id)))
WITH CHECK (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin'::app_role) AND is_tenant_member(tenant_id)));

-- product_categories
DROP POLICY IF EXISTS "Admin delete categories" ON public.product_categories;
CREATE POLICY "Admin delete categories" ON public.product_categories FOR DELETE TO authenticated
USING (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin'::app_role) AND is_tenant_member(tenant_id)));

-- sales_shifts
DROP POLICY IF EXISTS "Admins can view all shifts" ON public.sales_shifts;
CREATE POLICY "Admins can view tenant shifts" ON public.sales_shifts FOR SELECT TO authenticated
USING (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin'::app_role) AND is_tenant_member(tenant_id)));

-- catalog delete policies
DROP POLICY IF EXISTS "Admin delete taxes" ON public.tax_rates;
CREATE POLICY "Admin delete taxes" ON public.tax_rates FOR DELETE TO authenticated
USING (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin'::app_role) AND is_tenant_member(tenant_id)));

DROP POLICY IF EXISTS "Admin delete currencies" ON public.currencies;
CREATE POLICY "Admin delete currencies" ON public.currencies FOR DELETE TO authenticated
USING (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin'::app_role) AND is_tenant_member(tenant_id)));

DROP POLICY IF EXISTS "Admin delete suppliers" ON public.suppliers;
CREATE POLICY "Admin delete suppliers" ON public.suppliers FOR DELETE TO authenticated
USING (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin'::app_role) AND is_tenant_member(tenant_id)));

DROP POLICY IF EXISTS "Admin delete payment_methods" ON public.payment_methods;
CREATE POLICY "Admin delete payment_methods" ON public.payment_methods FOR DELETE TO authenticated
USING (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin'::app_role) AND is_tenant_member(tenant_id)));

DROP POLICY IF EXISTS "Admin delete recipes" ON public.product_recipes;
CREATE POLICY "Admin delete recipes" ON public.product_recipes FOR DELETE TO authenticated
USING (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin'::app_role) AND is_tenant_member(tenant_id)));

DROP POLICY IF EXISTS "Admin delete product_stock" ON public.product_stock;
CREATE POLICY "Admin delete product_stock" ON public.product_stock FOR DELETE TO authenticated
USING (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin'::app_role) AND is_tenant_member(tenant_id)));

DROP POLICY IF EXISTS "Admin delete tables" ON public.restaurant_tables;
CREATE POLICY "Admin delete tables" ON public.restaurant_tables FOR DELETE TO authenticated
USING (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin'::app_role) AND is_tenant_member(tenant_id)));

-- warehouses
DROP POLICY IF EXISTS "Admins can delete warehouses" ON public.warehouses;
CREATE POLICY "Admins can delete warehouses" ON public.warehouses FOR DELETE TO authenticated
USING (is_superadmin(auth.uid()) OR (has_role(auth.uid(),'admin'::app_role) AND is_tenant_member(tenant_id)));

-- Remove anonymous GraphQL schema discoverability (REST catalog access unchanged)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'graphql') THEN
    EXECUTE 'REVOKE USAGE ON SCHEMA graphql FROM anon';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'graphql_public') THEN
    EXECUTE 'REVOKE USAGE ON SCHEMA graphql_public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM anon';
  END IF;
END $$;
