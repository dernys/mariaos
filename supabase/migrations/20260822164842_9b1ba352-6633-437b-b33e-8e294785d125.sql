-- =========================================================
-- 1) VISTAS PÚBLICAS: security_invoker (evita bypass de RLS)
--    Se mantiene el catálogo público del marketplace mediante
--    RLS explícita para anon + permisos a nivel de COLUMNA.
-- =========================================================
ALTER VIEW public.tenants_public SET (security_invoker = true);
ALTER VIEW public.stores_public  SET (security_invoker = true);
ALTER VIEW public.product_ratings_public SET (security_invoker = true);

-- tenants: lectura anónima solo de negocios activos y solo columnas públicas
DROP POLICY IF EXISTS "Public can read active tenants" ON public.tenants;
CREATE POLICY "Public can read active tenants"
ON public.tenants FOR SELECT TO anon
USING (is_active = true);

REVOKE SELECT ON public.tenants FROM anon;
GRANT SELECT (id, name, slug, logo_url, business_type, is_active) ON public.tenants TO anon;

-- stores: ya existe policy anon (is_active = true); limitamos columnas
REVOKE SELECT ON public.stores FROM anon;
GRANT SELECT (
  id, tenant_id, name, address, latitude, longitude,
  delivery_radius_km, accepts_delivery, accepts_pickup, is_active
) ON public.stores TO anon;

-- =========================================================
-- 2) EXPOSICIÓN ANÓNIMA INDEBIDA (GraphQL / Data API)
-- =========================================================
REVOKE ALL ON public.business_templates FROM anon;
REVOKE ALL ON public.units_of_measure   FROM anon;

-- =========================================================
-- 3) FUNCIONES SECURITY DEFINER EJECUTABLES SIN SESIÓN
-- =========================================================
-- 3a) Funciones con anon explícito: requieren identidad autenticada
REVOKE EXECUTE ON FUNCTION public.marketplace_quote(jsonb, text, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.place_order_group(text, jsonb, text, text, text, text, text, text, text, jsonb, jsonb, numeric, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_my_online_order(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_business_from_template(text, jsonb, uuid, uuid, text) FROM anon;

-- 3b) Funciones con EXECUTE heredado de PUBLIC: se cierra PUBLIC y se
--     conservan/reponen los grants explícitos que ya existían.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.oid::regprocedure::text AS sig,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ok
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proacl::text LIKE '%=X/%'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
    IF r.auth_ok THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- =========================================================
-- 4) POLÍTICAS: rol explícito authenticated en vez de public
--    Solo políticas cuya condición ya exige identidad autenticada.
-- =========================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles::text = '{public}'
      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~
          '(is_tenant_member|auth\.uid\(\)|tenant_users|sa_active_tenant|active_tenant_id|is_superadmin|has_role|assert_tenant_access)'
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', r.policyname, r.tablename);
  END LOOP;
END $$;

-- =========================================================
-- 5) role_permissions: escritura solo superadmin (explícito)
-- =========================================================
DROP POLICY IF EXISTS "Superadmin can manage permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Admins can view permissions" ON public.role_permissions;

CREATE POLICY "role_permissions_select_admin"
ON public.role_permissions FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR is_superadmin(auth.uid()));

CREATE POLICY "role_permissions_insert_superadmin"
ON public.role_permissions FOR INSERT TO authenticated
WITH CHECK (is_superadmin(auth.uid()));

CREATE POLICY "role_permissions_update_superadmin"
ON public.role_permissions FOR UPDATE TO authenticated
USING (is_superadmin(auth.uid()))
WITH CHECK (is_superadmin(auth.uid()));

CREATE POLICY "role_permissions_delete_superadmin"
ON public.role_permissions FOR DELETE TO authenticated
USING (is_superadmin(auth.uid()));

-- =========================================================
-- 6) sales: creación/borrado solo por RPC del servidor
-- =========================================================
REVOKE INSERT, DELETE ON public.sales FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;