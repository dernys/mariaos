-- Verificación para operaciones públicas del marketplace
CREATE OR REPLACE FUNCTION public.assert_public_tenant(_tenant uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = _tenant AND t.is_active) THEN
    RAISE EXCEPTION 'invalid tenant';
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_public_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_public_tenant(uuid) TO anon, authenticated, service_role;

-- Modo global explícito del superadmin
CREATE OR REPLACE FUNCTION public.assert_tenant_access(_tenant uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN true;
  END IF;
  IF public.sa_global_mode() THEN
    RETURN true;
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'forbidden: missing tenant scope';
  END IF;
  IF public.is_tenant_member(_tenant) THEN
    RETURN true;
  END IF;
  RAISE EXCEPTION 'forbidden: tenant scope violation';
END;
$$;

-- Marketplace: cambiar guard estricto por verificación pública
DO $do$
DECLARE r record; v_src text; v_sql text; v_vol text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, p.prosrc, p.provolatile,
           pg_get_function_arguments(p.oid) AS full_args,
           pg_get_function_result(p.oid) AS result
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('place_online_order','validate_coupon')
  LOOP
    v_src := replace(r.prosrc,
      'PERFORM public.assert_tenant_access(p_tenant_id);',
      'PERFORM public.assert_public_tenant(p_tenant_id);');
    v_vol := CASE r.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END;
    v_sql := format('CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql %s SECURITY DEFINER SET search_path = public AS $g$%s$g$',
      r.proname, r.full_args, r.result, v_vol, v_src);
    EXECUTE v_sql;
  END LOOP;
END
$do$;