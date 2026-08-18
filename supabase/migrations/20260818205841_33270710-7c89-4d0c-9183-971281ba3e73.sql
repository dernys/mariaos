-- 1) Least-privilege public catalog: column-level grants instead of whole-table SELECT
REVOKE SELECT ON public.products FROM anon;
GRANT SELECT (id, name, description, price, category, image_url, images, online_stock,
  tenant_id, is_deliverable, sku, warehouse_id, store_id, brand, prep_minutes,
  created_at, is_online, is_active) ON public.products TO anon;

REVOKE SELECT ON public.product_categories FROM anon;
GRANT SELECT (id, name, parent_id, tenant_id, is_active) ON public.product_categories TO anon;

REVOKE SELECT ON public.promotions FROM anon;
GRANT SELECT (id, tenant_id, name, promo_type, discount_value, scope, scope_id,
  scope_value, valid_from, valid_until, is_active) ON public.promotions TO anon;

-- 2) Units of measure: read-only for anonymous visitors
REVOKE ALL ON public.units_of_measure FROM anon;
GRANT SELECT ON public.units_of_measure TO anon;

-- 3) Product reviews: hidden until moderated + staff can read their tenant reviews
ALTER TABLE public.product_reviews ALTER COLUMN is_visible SET DEFAULT false;

DROP POLICY IF EXISTS "Tenant members can view their reviews" ON public.product_reviews;
CREATE POLICY "Tenant members can view their reviews"
ON public.product_reviews FOR SELECT TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = product_reviews.tenant_id AND tu.user_id = auth.uid()
  )
);

-- 4) Prevent privilege escalation: only superadmins may grant/revoke the global admin role
DROP POLICY IF EXISTS "Tenant admins and superadmin can add roles" ON public.user_roles;
CREATE POLICY "Tenant admins and superadmin can add roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  public.is_superadmin(auth.uid())
  OR (
    role <> 'admin'::public.app_role
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.shares_tenant_with(user_id)
  )
);

DROP POLICY IF EXISTS "Tenant admins and superadmin can update roles" ON public.user_roles;
CREATE POLICY "Tenant admins and superadmin can update roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR (
    role <> 'admin'::public.app_role
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.shares_tenant_with(user_id)
  )
)
WITH CHECK (
  public.is_superadmin(auth.uid())
  OR (
    role <> 'admin'::public.app_role
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.shares_tenant_with(user_id)
  )
);

DROP POLICY IF EXISTS "Tenant admins and superadmin can delete roles" ON public.user_roles;
CREATE POLICY "Tenant admins and superadmin can delete roles"
ON public.user_roles FOR DELETE TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR (
    role <> 'admin'::public.app_role
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.shares_tenant_with(user_id)
  )
);