-- 1) user_roles: remove global admin visibility/management, scope to shared tenant
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Tenant members can view roles of their tenant users" ON public.user_roles;
DROP POLICY IF EXISTS "Tenant owners can manage roles of their members" ON public.user_roles;
DROP POLICY IF EXISTS "Tenant owners can delete roles of their members" ON public.user_roles;

CREATE OR REPLACE FUNCTION public.shares_tenant_with(_other_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_users me
    JOIN public.tenant_users other ON other.tenant_id = me.tenant_id
    WHERE me.user_id = auth.uid()
      AND other.user_id = _other_user_id
  )
$$;

CREATE POLICY "Roles visible to self, tenant admins and superadmin"
ON public.user_roles FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_superadmin(auth.uid())
  OR (public.has_role(auth.uid(), 'admin') AND public.shares_tenant_with(user_id))
);

CREATE POLICY "Tenant admins and superadmin can add roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  public.is_superadmin(auth.uid())
  OR (public.has_role(auth.uid(), 'admin') AND public.shares_tenant_with(user_id))
);

CREATE POLICY "Tenant admins and superadmin can update roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR (public.has_role(auth.uid(), 'admin') AND public.shares_tenant_with(user_id))
);

CREATE POLICY "Tenant admins and superadmin can delete roles"
ON public.user_roles FOR DELETE TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR (public.has_role(auth.uid(), 'admin') AND public.shares_tenant_with(user_id))
);

-- 2) Global RBAC matrix and module catalog: superadmin-only writes
DROP POLICY IF EXISTS "Admins can manage permissions" ON public.role_permissions;
CREATE POLICY "Superadmin can manage permissions"
ON public.role_permissions FOR ALL TO authenticated
USING (public.is_superadmin(auth.uid()))
WITH CHECK (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage modules" ON public.app_modules;
CREATE POLICY "Superadmin can manage modules"
ON public.app_modules FOR ALL TO authenticated
USING (public.is_superadmin(auth.uid()))
WITH CHECK (public.is_superadmin(auth.uid()));