DROP POLICY IF EXISTS "Tenant members can view stores" ON public.stores;
CREATE POLICY "Tenant members can view stores"
ON public.stores FOR SELECT TO authenticated
USING (tenant_id IN (SELECT tenant_users.tenant_id FROM public.tenant_users WHERE tenant_users.user_id = auth.uid()));

DROP POLICY IF EXISTS "Tenant members can update stores" ON public.stores;
CREATE POLICY "Tenant members can update stores"
ON public.stores FOR UPDATE TO authenticated
USING (tenant_id IN (SELECT tenant_users.tenant_id FROM public.tenant_users WHERE tenant_users.user_id = auth.uid()));

DROP POLICY IF EXISTS "Tenant members can insert stores" ON public.stores;
CREATE POLICY "Tenant members can insert stores"
ON public.stores FOR INSERT TO authenticated
WITH CHECK (tenant_id IN (SELECT tenant_users.tenant_id FROM public.tenant_users WHERE tenant_users.user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins can delete stores" ON public.stores;
CREATE POLICY "Admins can delete stores"
ON public.stores FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_superadmin(auth.uid()));
