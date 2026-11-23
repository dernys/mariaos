DROP POLICY IF EXISTS "read accounting profiles" ON public.accounting_profiles;
CREATE POLICY "members read accounting profiles" ON public.accounting_profiles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenant_users tu WHERE tu.user_id = auth.uid()) OR public.is_superadmin(auth.uid()));
DROP POLICY IF EXISTS "read posting_rules" ON public.posting_rules;
CREATE POLICY "members read posting_rules" ON public.posting_rules FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenant_users tu WHERE tu.user_id = auth.uid()) OR public.is_superadmin(auth.uid()));

CREATE OR REPLACE FUNCTION public.active_tenant_id(_user_id uuid DEFAULT auth.uid())
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN NULL
    WHEN public.is_superadmin(_user_id) THEN (
      SELECT c.tenant_id FROM public.superadmin_context c
      WHERE c.user_id = _user_id AND c.mode = 'tenant')
    ELSE (
      SELECT tu.tenant_id FROM public.tenant_users tu
      WHERE tu.user_id = _user_id ORDER BY tu.tenant_id LIMIT 1)
  END
$function$;

CREATE OR REPLACE FUNCTION public.my_attendance(_from date DEFAULT NULL::date, _to date DEFAULT NULL::date)
 RETURNS SETOF employee_attendance LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT a.* FROM public.employee_attendance a
  JOIN public.employees e ON e.id = a.employee_id
  WHERE e.user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.tenant_id = e.tenant_id)
    AND (_from IS NULL OR a.check_in::date >= _from)
    AND (_to IS NULL OR a.check_in::date <= _to)
  ORDER BY a.check_in DESC;
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_integrations(_tenant uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT (_tenant = public.sa_active_tenant())
    OR (public.is_tenant_member(_tenant)
        AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente')))
$$;
REVOKE EXECUTE ON FUNCTION public.can_manage_integrations(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_manage_integrations(uuid) TO authenticated;

DROP POLICY IF EXISTS wh_ins ON public.webhooks;
DROP POLICY IF EXISTS wh_upd ON public.webhooks;
DROP POLICY IF EXISTS wh_del ON public.webhooks;
CREATE POLICY wh_ins ON public.webhooks FOR INSERT TO authenticated WITH CHECK (public.can_manage_integrations(tenant_id));
CREATE POLICY wh_upd ON public.webhooks FOR UPDATE TO authenticated USING (public.can_manage_integrations(tenant_id)) WITH CHECK (public.can_manage_integrations(tenant_id));
CREATE POLICY wh_del ON public.webhooks FOR DELETE TO authenticated USING (public.can_manage_integrations(tenant_id));

DROP POLICY IF EXISTS "tenant manage einvoice_settings" ON public.einvoice_settings;
CREATE POLICY "members read einvoice_settings" ON public.einvoice_settings FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id) OR tenant_id = public.sa_active_tenant());
CREATE POLICY "managers write einvoice_settings" ON public.einvoice_settings FOR ALL TO authenticated
  USING (public.can_manage_integrations(tenant_id)) WITH CHECK (public.can_manage_integrations(tenant_id));