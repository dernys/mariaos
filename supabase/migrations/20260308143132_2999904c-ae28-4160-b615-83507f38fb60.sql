
-- Drop overly permissive policies
DROP POLICY "Superadmin full access on tenants" ON public.tenants;
DROP POLICY "Superadmin full access on tenant_users" ON public.tenant_users;

-- Create proper superadmin policies using is_superadmin function
CREATE POLICY "Superadmin can manage tenants"
  ON public.tenants FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

CREATE POLICY "Superadmin can manage tenant_users"
  ON public.tenant_users FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));
