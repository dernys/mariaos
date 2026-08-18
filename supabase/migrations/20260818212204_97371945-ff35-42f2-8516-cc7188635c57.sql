-- Helper: is the target user a platform superadmin? (safe for use in policies)
CREATE OR REPLACE FUNCTION public.is_protected_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = _user_id)
$$;

REVOKE ALL ON FUNCTION public.is_protected_superadmin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_protected_superadmin(uuid) TO authenticated, service_role;

-- Tenant admins must never touch roles of a platform superadmin
DROP POLICY IF EXISTS "Tenant admins and superadmin can add roles" ON public.user_roles;
CREATE POLICY "Tenant admins and superadmin can add roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  public.is_superadmin(auth.uid())
  OR (
    role <> 'admin'::app_role
    AND has_role(auth.uid(), 'admin'::app_role)
    AND shares_tenant_with(user_id)
    AND NOT public.is_protected_superadmin(user_id)
  )
);

DROP POLICY IF EXISTS "Tenant admins and superadmin can update roles" ON public.user_roles;
CREATE POLICY "Tenant admins and superadmin can update roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR (
    role <> 'admin'::app_role
    AND has_role(auth.uid(), 'admin'::app_role)
    AND shares_tenant_with(user_id)
    AND NOT public.is_protected_superadmin(user_id)
  )
)
WITH CHECK (
  public.is_superadmin(auth.uid())
  OR (
    role <> 'admin'::app_role
    AND has_role(auth.uid(), 'admin'::app_role)
    AND shares_tenant_with(user_id)
    AND NOT public.is_protected_superadmin(user_id)
  )
);

DROP POLICY IF EXISTS "Tenant admins and superadmin can delete roles" ON public.user_roles;
CREATE POLICY "Tenant admins and superadmin can delete roles"
ON public.user_roles FOR DELETE TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR (
    role <> 'admin'::app_role
    AND has_role(auth.uid(), 'admin'::app_role)
    AND shares_tenant_with(user_id)
    AND NOT public.is_protected_superadmin(user_id)
  )
);