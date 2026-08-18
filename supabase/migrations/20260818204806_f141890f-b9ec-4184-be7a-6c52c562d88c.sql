-- SEC-015: las políticas DELETE con has_role() no comprobaban pertenencia al tenant.
DROP POLICY IF EXISTS "Admin delete accounts" ON public.accounting_accounts;
CREATE POLICY "Admin delete accounts" ON public.accounting_accounts
FOR DELETE TO authenticated
USING (
  is_superadmin(auth.uid())
  OR (has_role(auth.uid(), 'admin'::app_role) AND is_tenant_member(tenant_id))
);

DROP POLICY IF EXISTS "Admins can delete products" ON public.products;
CREATE POLICY "Admins can delete products" ON public.products
FOR DELETE TO authenticated
USING (
  is_superadmin(auth.uid())
  OR (has_role(auth.uid(), 'admin'::app_role) AND is_tenant_member(tenant_id))
);

DROP POLICY IF EXISTS "Admins can delete stores" ON public.stores;
CREATE POLICY "Admins can delete stores" ON public.stores
FOR DELETE TO authenticated
USING (
  is_superadmin(auth.uid())
  OR (has_role(auth.uid(), 'admin'::app_role) AND is_tenant_member(tenant_id))
);