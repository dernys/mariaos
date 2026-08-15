CREATE POLICY "Tenant members can view tenant shifts"
ON public.sales_shifts
FOR SELECT
TO authenticated
USING (is_tenant_member(tenant_id));