
-- ============================================================
-- Roles & permissions: full seed + helpers
-- ============================================================

-- Ensure default matrix for ALL five roles across ALL modules.
-- Rules:
--   admin        -> full (view/create/edit/delete)
--   gerente      -> view/create/edit on all; delete only on ops (not roles/config)
--   supervisor   -> view/create/edit on operational modules; view-only on config/roles
--   cajero       -> view+create on POS/turnos/inventario/dashboard; view-only elsewhere; no roles
--   inventarista -> full on inventario/almacenes/tiendas; view on dashboard/pos; no roles

INSERT INTO public.role_permissions (role, module_id, can_view, can_create, can_edit, can_delete)
SELECT r.role, m.id,
  CASE
    WHEN r.role = 'admin' THEN true
    WHEN r.role = 'gerente' THEN true
    WHEN r.role = 'supervisor' AND m.slug IN ('roles') THEN false
    WHEN r.role = 'supervisor' THEN true
    WHEN r.role = 'cajero' AND m.slug IN ('roles') THEN false
    WHEN r.role = 'cajero' THEN true
    WHEN r.role = 'inventarista' AND m.slug IN ('roles','configuracion') THEN false
    WHEN r.role = 'inventarista' THEN true
  END AS can_view,
  CASE
    WHEN r.role = 'admin' THEN true
    WHEN r.role = 'gerente' AND m.slug NOT IN ('roles') THEN true
    WHEN r.role = 'supervisor' AND m.slug IN ('pos','turnos','inventario','tiendas','almacenes') THEN true
    WHEN r.role = 'cajero' AND m.slug IN ('pos','turnos') THEN true
    WHEN r.role = 'inventarista' AND m.slug IN ('inventario','almacenes','tiendas') THEN true
    ELSE false
  END AS can_create,
  CASE
    WHEN r.role = 'admin' THEN true
    WHEN r.role = 'gerente' AND m.slug NOT IN ('roles') THEN true
    WHEN r.role = 'supervisor' AND m.slug IN ('pos','turnos','inventario','tiendas','almacenes') THEN true
    WHEN r.role = 'cajero' AND m.slug IN ('pos','turnos') THEN true
    WHEN r.role = 'inventarista' AND m.slug IN ('inventario','almacenes','tiendas') THEN true
    ELSE false
  END AS can_edit,
  CASE
    WHEN r.role = 'admin' THEN true
    WHEN r.role = 'gerente' AND m.slug IN ('pos','turnos','inventario','almacenes','tiendas','dashboard') THEN true
    WHEN r.role = 'inventarista' AND m.slug IN ('inventario') THEN true
    ELSE false
  END AS can_delete
FROM (VALUES ('admin'::app_role), ('gerente'), ('supervisor'), ('cajero'), ('inventarista')) AS r(role)
CROSS JOIN public.app_modules m
ON CONFLICT (role, module_id) DO UPDATE
  SET can_view   = EXCLUDED.can_view,
      can_create = EXCLUDED.can_create,
      can_edit   = EXCLUDED.can_edit,
      can_delete = EXCLUDED.can_delete,
      updated_at = now();

-- ============================================================
-- Default PIN "1234" for every existing employee that has none
-- ============================================================
UPDATE public.employees
   SET access_pin_hash = crypt('1234', gen_salt('bf'))
 WHERE access_pin_hash IS NULL;

-- Trigger: any NEW employee inserted without a PIN gets "1234"
CREATE OR REPLACE FUNCTION public.default_employee_pin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.access_pin_hash IS NULL THEN
    NEW.access_pin_hash := crypt('1234', gen_salt('bf'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_employee_pin ON public.employees;
CREATE TRIGGER trg_default_employee_pin
  BEFORE INSERT ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.default_employee_pin();

-- ============================================================
-- Helper: is user member of a tenant?
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_tenant_member(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_users
     WHERE user_id = _user_id AND tenant_id = _tenant_id
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(UUID, UUID) TO authenticated;

-- Helper: is user owner of a tenant?
CREATE OR REPLACE FUNCTION public.is_tenant_owner(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_users
     WHERE user_id = _user_id AND tenant_id = _tenant_id AND is_owner = true
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_tenant_owner(UUID, UUID) TO authenticated;

-- ============================================================
-- Fix: user_roles should be visible to tenant owners / managers too
-- (so /roles page can list roles of tenant members).
-- Currently only admin can view all -> too restrictive.
-- ============================================================
DROP POLICY IF EXISTS "Tenant members can view roles of their tenant users" ON public.user_roles;
CREATE POLICY "Tenant members can view roles of their tenant users"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.is_superadmin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tenant_users me
      JOIN public.tenant_users other ON other.tenant_id = me.tenant_id
      WHERE me.user_id = auth.uid()
        AND me.is_owner = true
        AND other.user_id = public.user_roles.user_id
    )
  );

-- Tenant owners can assign/remove roles for their tenant members
DROP POLICY IF EXISTS "Tenant owners can manage roles of their members" ON public.user_roles;
CREATE POLICY "Tenant owners can manage roles of their members"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.is_superadmin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tenant_users me
      JOIN public.tenant_users other ON other.tenant_id = me.tenant_id
      WHERE me.user_id = auth.uid()
        AND me.is_owner = true
        AND other.user_id = public.user_roles.user_id
    )
  );

DROP POLICY IF EXISTS "Tenant owners can delete roles of their members" ON public.user_roles;
CREATE POLICY "Tenant owners can delete roles of their members"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.is_superadmin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tenant_users me
      JOIN public.tenant_users other ON other.tenant_id = me.tenant_id
      WHERE me.user_id = auth.uid()
        AND me.is_owner = true
        AND other.user_id = public.user_roles.user_id
    )
  );
