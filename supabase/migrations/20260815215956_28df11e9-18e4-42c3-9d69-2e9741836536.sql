-- 1. search_path on remaining function
ALTER FUNCTION public.distance_km(numeric, numeric, numeric, numeric) SET search_path = public;

-- 2. Views: enforce invoker RLS and lock down non-public views
DO $$
DECLARE v record;
BEGIN
  FOR v IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind='v'
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)', v.relname);
  END LOOP;
END $$;

-- 3. Table/view privileges: revoke anon everywhere, keep public catalog allowlist
DO $$
DECLARE r record;
  allow text[] := ARRAY['products','promotions','product_categories','product_reviews','delivery_zones','stores_public','tenants_public','product_ratings_public'];
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind IN ('r','v','m','f')
  LOOP
    IF r.relname = ANY(allow) THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', r.relname);
      EXECUTE format('GRANT SELECT ON public.%I TO anon', r.relname);
    ELSE
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', r.relname);
    END IF;
  END LOOP;
END $$;

-- 4. Functions: explicit grants to authenticated/service_role, revoke anon & PUBLIC
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid, p.prorettype, p.proname,
                  pg_get_function_identity_arguments(p.oid) AS args
           FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.prokind='f'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', f.proname, f.args);
    IF f.prorettype <> 'trigger'::regtype AND f.prorettype <> 'event_trigger'::regtype THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', f.proname, f.args);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', f.proname, f.args);
    END IF;
  END LOOP;
END $$;

-- landing page stats stay callable pre-login
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.proname, pg_get_function_identity_arguments(p.oid) args
           FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='public_demo_stats'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon', f.proname, f.args);
  END LOOP;
END $$;

-- 5. Reference/template data: authenticated only
DROP POLICY IF EXISTS "read profiles" ON public.accounting_profiles;
CREATE POLICY "read accounting profiles" ON public.accounting_profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "read posting_rules" ON public.posting_rules;
CREATE POLICY "read posting_rules" ON public.posting_rules
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "read tax templates" ON public.tax_templates;
CREATE POLICY "read tax templates" ON public.tax_templates
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "read chart templates" ON public.chart_account_templates;
CREATE POLICY "read chart templates" ON public.chart_account_templates
  FOR SELECT TO authenticated USING (true);

-- 6. Notifications: no more forged inserts
DROP POLICY IF EXISTS "system insert notifications" ON public.notifications;
CREATE POLICY "tenant users insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_superadmin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.tenant_id = notifications.tenant_id AND tu.user_id = auth.uid()
    )
  );

-- 7. Profiles: own profile, same-tenant colleagues, or superadmin
DROP POLICY IF EXISTS "Anyone authenticated can view profiles" ON public.profiles;
CREATE POLICY "Users can view relevant profiles" ON public.profiles
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR public.is_superadmin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tenant_users me
      JOIN public.tenant_users other ON other.tenant_id = me.tenant_id
      WHERE me.user_id = auth.uid() AND other.user_id = profiles.user_id
    )
  );

-- 8. Permission matrix: admins, superadmins, or own roles only
DROP POLICY IF EXISTS "Authenticated can view permissions" ON public.role_permissions;
CREATE POLICY "Admins and own roles can view permissions" ON public.role_permissions
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_superadmin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = role_permissions.role
    )
  );

DROP POLICY IF EXISTS "Authenticated can view modules" ON public.app_modules;
CREATE POLICY "Authenticated can view modules" ON public.app_modules
  FOR SELECT TO authenticated USING (true);