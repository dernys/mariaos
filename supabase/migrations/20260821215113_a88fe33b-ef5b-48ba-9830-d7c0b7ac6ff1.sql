-- =========================================================
-- FASE 1: Contexto seguro de tenant activo + fail-closed RLS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.superadmin_context (
  user_id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  mode text NOT NULL DEFAULT 'tenant',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT superadmin_context_mode_chk CHECK (mode IN ('tenant','global'))
);

GRANT SELECT ON public.superadmin_context TO authenticated;
GRANT ALL ON public.superadmin_context TO service_role;
ALTER TABLE public.superadmin_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own superadmin context read" ON public.superadmin_context;
CREATE POLICY "own superadmin context read" ON public.superadmin_context
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_superadmin(auth.uid()));

DROP TRIGGER IF EXISTS trg_superadmin_context_updated ON public.superadmin_context;
CREATE TRIGGER trg_superadmin_context_updated
  BEFORE UPDATE ON public.superadmin_context
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------
-- Helpers (SECURITY DEFINER mínimos)
-- ---------------------------------------------------------

-- Tenant activo del superadmin. NULL => deny (fail-closed).
CREATE OR REPLACE FUNCTION public.sa_active_tenant()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.tenant_id
  FROM public.superadmin_context c
  WHERE c.user_id = auth.uid()
    AND c.mode = 'tenant'
    AND c.tenant_id IS NOT NULL
    AND public.is_superadmin(auth.uid())
$$;

REVOKE ALL ON FUNCTION public.sa_active_tenant() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sa_active_tenant() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sa_global_mode()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_superadmin(auth.uid())
     AND EXISTS (SELECT 1 FROM public.superadmin_context c
                  WHERE c.user_id = auth.uid() AND c.mode = 'global')
$$;

REVOKE ALL ON FUNCTION public.sa_global_mode() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sa_global_mode() TO authenticated, service_role;

-- Tenant efectivo del usuario actual (superadmin => contexto; usuario => membresía)
CREATE OR REPLACE FUNCTION public.active_tenant_id(_user_id uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.is_superadmin(_user_id) THEN (
      SELECT c.tenant_id FROM public.superadmin_context c
      WHERE c.user_id = _user_id AND c.mode = 'tenant'
    )
    ELSE (
      SELECT tu.tenant_id FROM public.tenant_users tu
      WHERE tu.user_id = _user_id
      ORDER BY tu.tenant_id LIMIT 1
    )
  END
$$;

REVOKE ALL ON FUNCTION public.active_tenant_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.active_tenant_id(uuid) TO authenticated, service_role;

-- Cambio de tenant activo: SOLO superadmin, tenant debe existir y estar activo
CREATE OR REPLACE FUNCTION public.set_active_tenant(_tenant_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ok boolean;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: only superadmin can switch tenant context';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = _tenant_id AND t.is_active) INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'invalid tenant';
  END IF;

  INSERT INTO public.superadmin_context (user_id, tenant_id, mode)
  VALUES (auth.uid(), _tenant_id, 'tenant')
  ON CONFLICT (user_id) DO UPDATE
    SET tenant_id = EXCLUDED.tenant_id, mode = 'tenant', updated_at = now();

  RETURN _tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_active_tenant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_active_tenant(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_superadmin_mode(_mode text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _mode NOT IN ('tenant','global') THEN
    RAISE EXCEPTION 'invalid mode';
  END IF;
  INSERT INTO public.superadmin_context (user_id, mode)
  VALUES (auth.uid(), _mode)
  ON CONFLICT (user_id) DO UPDATE SET mode = EXCLUDED.mode, updated_at = now();
  RETURN _mode;
END;
$$;

REVOKE ALL ON FUNCTION public.set_superadmin_mode(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_superadmin_mode(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_superadmin_context()
RETURNS TABLE (tenant_id uuid, mode text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.tenant_id, c.mode
  FROM public.superadmin_context c
  WHERE c.user_id = auth.uid() AND public.is_superadmin(auth.uid())
$$;

REVOKE ALL ON FUNCTION public.get_superadmin_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_superadmin_context() TO authenticated;

-- is_tenant_member deja de ser un bypass global para superadmin
CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
      SELECT 1 FROM public.tenant_users
      WHERE user_id = auth.uid() AND tenant_id = _tenant
    )
    OR (_tenant IS NOT NULL AND _tenant = public.sa_active_tenant());
$$;

-- ---------------------------------------------------------
-- Reescritura masiva: tablas con tenant_id
-- is_superadmin(auth.uid())  ->  (tenant_id = public.sa_active_tenant())
-- ---------------------------------------------------------
DO $do$
DECLARE
  r record;
  v_qual text;
  v_check text;
  v_sql text;
  v_repl constant text := '(tenant_id = public.sa_active_tenant())';
BEGIN
  FOR r IN
    SELECT p.tablename, p.policyname, p.cmd, p.permissive, p.roles::text[] AS roles,
           p.qual, p.with_check
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND (coalesce(p.qual,'') || coalesce(p.with_check,'')) LIKE '%is_superadmin(auth.uid())%'
      AND EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema='public' AND c.table_name = p.tablename AND c.column_name='tenant_id'
      )
  LOOP
    v_qual := replace(coalesce(r.qual,''), 'is_superadmin(auth.uid())', v_repl);
    v_check := replace(coalesce(r.with_check,''), 'is_superadmin(auth.uid())', v_repl);

    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);

    v_sql := format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s',
      r.policyname, r.tablename,
      CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      r.cmd,
      array_to_string(r.roles, ', '));

    IF r.qual IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', v_qual);
    END IF;
    IF r.with_check IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', v_check);
    END IF;

    EXECUTE v_sql;
  END LOOP;
END
$do$;

-- ---------------------------------------------------------
-- Tablas hijas (sin tenant_id): scoping vía documento padre
-- ---------------------------------------------------------
DO $do$
DECLARE
  r record;
  m record;
  v_qual text; v_check text; v_sql text; v_repl text;
BEGIN
  FOR m IN
    SELECT * FROM (VALUES
      ('sale_items','sale_id','sales'),
      ('sale_payments','sale_id','sales'),
      ('purchase_items','purchase_id','purchases'),
      ('journal_entry_lines','entry_id','journal_entries'),
      ('kitchen_order_items','order_id','kitchen_orders'),
      ('online_order_items','order_id','online_orders'),
      ('sale_return_items','return_id','sale_returns'),
      ('stock_transfer_items','transfer_id','stock_transfers')
    ) AS t(child, fk, parent)
  LOOP
    v_repl := format('(EXISTS (SELECT 1 FROM public.%I p WHERE p.id = %I.%I AND p.tenant_id = public.sa_active_tenant()))',
                     m.parent, m.child, m.fk);

    FOR r IN
      SELECT p.tablename, p.policyname, p.cmd, p.permissive, p.roles::text[] AS roles, p.qual, p.with_check
      FROM pg_policies p
      WHERE p.schemaname='public' AND p.tablename = m.child
        AND (coalesce(p.qual,'') || coalesce(p.with_check,'')) LIKE '%is_superadmin(auth.uid())%'
    LOOP
      v_qual := replace(coalesce(r.qual,''), 'is_superadmin(auth.uid())', v_repl);
      v_check := replace(coalesce(r.with_check,''), 'is_superadmin(auth.uid())', v_repl);

      EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);

      v_sql := format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s',
        r.policyname, r.tablename,
        CASE WHEN r.permissive='PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
        r.cmd, array_to_string(r.roles, ', '));
      IF r.qual IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', v_qual); END IF;
      IF r.with_check IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', v_check); END IF;
      EXECUTE v_sql;
    END LOOP;
  END LOOP;
END
$do$;

-- ---------------------------------------------------------
-- Identidad: profiles / user_roles limitados al tenant activo
-- ---------------------------------------------------------
DROP POLICY IF EXISTS "Users can view relevant profiles" ON public.profiles;
CREATE POLICY "Users can view relevant profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.tenant_users me
      JOIN public.tenant_users other ON other.tenant_id = me.tenant_id
      WHERE me.user_id = auth.uid() AND other.user_id = profiles.user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.user_id = profiles.user_id AND tu.tenant_id = public.sa_active_tenant()
    )
  );

DO $do$
DECLARE
  r record; v_qual text; v_check text; v_sql text;
  v_repl constant text := '(EXISTS (SELECT 1 FROM public.tenant_users tu WHERE tu.user_id = user_roles.user_id AND tu.tenant_id = public.sa_active_tenant()))';
BEGIN
  FOR r IN
    SELECT p.tablename, p.policyname, p.cmd, p.permissive, p.roles::text[] AS roles, p.qual, p.with_check
    FROM pg_policies p
    WHERE p.schemaname='public' AND p.tablename='user_roles'
      AND (coalesce(p.qual,'') || coalesce(p.with_check,'')) LIKE '%is_superadmin(auth.uid())%'
  LOOP
    v_qual := replace(coalesce(r.qual,''), 'is_superadmin(auth.uid())', v_repl);
    v_check := replace(coalesce(r.with_check,''), 'is_superadmin(auth.uid())', v_repl);
    EXECUTE format('DROP POLICY %I ON public.user_roles', r.policyname);
    v_sql := format('CREATE POLICY %I ON public.user_roles AS %s FOR %s TO %s',
      r.policyname,
      CASE WHEN r.permissive='PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      r.cmd, array_to_string(r.roles, ', '));
    IF r.qual IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', v_qual); END IF;
    IF r.with_check IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', v_check); END IF;
    EXECUTE v_sql;
  END LOOP;
END
$do$;

-- ---------------------------------------------------------
-- Administración GLOBAL explícita (Gestión de Empresas)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_tenants()
RETURNS TABLE (id uuid, name text, slug text, business_type text, is_active boolean,
               users_count bigint, created_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT t.id, t.name, t.slug, t.business_type, t.is_active,
           (SELECT count(*) FROM public.tenant_users tu WHERE tu.tenant_id = t.id),
           t.created_at
    FROM public.tenants t
    ORDER BY t.name;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_tenants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_tenants() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_tenant_users(_tenant_id uuid DEFAULT NULL)
RETURNS TABLE (user_id uuid, tenant_id uuid, tenant_name text, full_name text, roles text[])
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT tu.user_id, tu.tenant_id, t.name, p.full_name,
           COALESCE(ARRAY(SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id = tu.user_id), '{}')
    FROM public.tenant_users tu
    JOIN public.tenants t ON t.id = tu.tenant_id
    LEFT JOIN public.profiles p ON p.user_id = tu.user_id
    WHERE _tenant_id IS NULL OR tu.tenant_id = _tenant_id
    ORDER BY t.name, p.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_tenant_users(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_tenant_users(uuid) TO authenticated;