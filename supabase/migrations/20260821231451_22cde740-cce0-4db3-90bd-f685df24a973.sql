DROP POLICY IF EXISTS "Tenant members read sales" ON public.sales;
CREATE POLICY "Tenant members read sales" ON public.sales
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Tenant members read sale_items" ON public.sale_items;
CREATE POLICY "Tenant members read sale_items" ON public.sale_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_items.sale_id AND public.is_tenant_member(s.tenant_id)));

DROP POLICY IF EXISTS "Tenant members read sale_payments" ON public.sale_payments;
CREATE POLICY "Tenant members read sale_payments" ON public.sale_payments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_payments.sale_id AND public.is_tenant_member(s.tenant_id)));