CREATE OR REPLACE FUNCTION public.lookup_business_admin_candidate(_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text := lower(trim(coalesce(_email, '')));
  v_user auth.users;
  v_names text[];
  v_count int := 0;
  v_is_sa boolean := false;
BEGIN
  IF v_email = '' THEN
    RETURN jsonb_build_object('exists', false, 'email', null);
  END IF;

  SELECT * INTO v_user FROM auth.users WHERE lower(email) = v_email LIMIT 1;
  IF v_user.id IS NULL THEN
    RETURN jsonb_build_object('exists', false, 'email', v_email);
  END IF;

  SELECT count(*), coalesce(array_agg(t.name ORDER BY t.name), '{}')
    INTO v_count, v_names
  FROM public.tenant_users tu
  JOIN public.tenants t ON t.id = tu.tenant_id
  WHERE tu.user_id = v_user.id;

  SELECT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = v_user.id) INTO v_is_sa;

  RETURN jsonb_build_object(
    'exists', true,
    'email', v_email,
    'user_id', v_user.id,
    'full_name', coalesce(v_user.raw_user_meta_data->>'full_name', ''),
    'confirmed', v_user.email_confirmed_at IS NOT NULL,
    'created_at', v_user.created_at,
    'tenant_count', v_count,
    'tenant_names', to_jsonb(v_names),
    'is_superadmin', v_is_sa,
    'reusable', v_count = 0 AND NOT v_is_sa
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_business_admin_candidate(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_business_admin_candidate(text) TO service_role;