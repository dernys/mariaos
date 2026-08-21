-- Guard central: valida acceso al tenant recibido por parámetro
CREATE OR REPLACE FUNCTION public.assert_tenant_access(_tenant uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Contexto interno (service_role / triggers sin sesión): permitido
  IF auth.uid() IS NULL THEN
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

REVOKE ALL ON FUNCTION public.assert_tenant_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_tenant_access(uuid) TO authenticated, service_role;

-- 1) Inyección del guard en funciones plpgsql SECURITY DEFINER con tenant como 1er argumento
DO $do$
DECLARE
  r record;
  v_arg text;
  v_src text;
  v_pos int;
  v_sql text;
  v_vol text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, p.prosrc, p.provolatile,
           pg_get_function_identity_arguments(p.oid) AS args,
           pg_get_function_arguments(p.oid) AS full_args,
           pg_get_function_result(p.oid) AS result
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public' AND p.prosecdef AND l.lanname = 'plpgsql'
      AND pg_get_function_identity_arguments(p.oid) ~ '^(p_tenant|p_tenant_id|_tenant|_tenant_id) uuid'
      AND pg_get_functiondef(p.oid) !~* 'is_tenant_member|assert_tenant_access|is_superadmin'
      AND p.proname NOT IN ('set_active_tenant','set_superadmin_mode','admin_list_tenants','admin_list_tenant_users','assert_tenant_access')
  LOOP
    v_arg := split_part(r.args, ' ', 1);
    v_src := r.prosrc;
    v_pos := position('BEGIN' in upper(v_src));
    IF v_pos = 0 THEN CONTINUE; END IF;

    v_src := left(v_src, v_pos + 4) || format(E'\n  PERFORM public.assert_tenant_access(%s);\n', v_arg)
             || substr(v_src, v_pos + 5);

    v_vol := CASE r.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END;

    v_sql := format(
      'CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql %s SECURITY DEFINER SET search_path = public AS $guarded$%s$guarded$',
      r.proname, r.full_args, r.result, v_vol, v_src);
    EXECUTE v_sql;
  END LOOP;
END
$do$;

-- 2) Funciones SQL SECURITY DEFINER con tenant como 1er argumento -> se convierten
--    a plpgsql con el guard delante, preservando el cuerpo original.
DO $do$
DECLARE
  r record;
  v_arg text;
  v_body text;
  v_sql text;
  v_vol text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, p.prosrc, p.provolatile, p.proretset,
           pg_get_function_identity_arguments(p.oid) AS args,
           pg_get_function_arguments(p.oid) AS full_args,
           pg_get_function_result(p.oid) AS result
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public' AND p.prosecdef AND l.lanname = 'sql'
      AND pg_get_function_identity_arguments(p.oid) ~ '^(p_tenant|p_tenant_id|_tenant|_tenant_id) uuid'
      AND pg_get_functiondef(p.oid) !~* 'is_tenant_member|assert_tenant_access|is_superadmin'
      AND p.proname <> 'assert_tenant_access'
  LOOP
    v_arg := split_part(r.args, ' ', 1);
    v_body := btrim(r.prosrc);
    v_body := regexp_replace(v_body, ';\s*$', '');
    v_vol := CASE r.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END;

    IF r.proretset THEN
      v_sql := format(
        'CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql %s SECURITY DEFINER SET search_path = public AS $guarded$ BEGIN PERFORM public.assert_tenant_access(%s); RETURN QUERY %s; END; $guarded$',
        r.proname, r.full_args, r.result, v_vol, v_arg, v_body);
    ELSE
      v_sql := format(
        'CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql %s SECURITY DEFINER SET search_path = public AS $guarded$ BEGIN PERFORM public.assert_tenant_access(%s); RETURN (%s); END; $guarded$',
        r.proname, r.full_args, r.result, v_vol, v_arg, v_body);
    END IF;

    BEGIN
      EXECUTE v_sql;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'skip % : %', r.proname, SQLERRM;
    END;
  END LOOP;
END
$do$;