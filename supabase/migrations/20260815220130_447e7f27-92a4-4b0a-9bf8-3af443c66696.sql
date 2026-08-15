-- products
DROP POLICY IF EXISTS "Tenant members can view products" ON public.products;
CREATE POLICY "Tenant members can view products" ON public.products
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
DROP POLICY IF EXISTS "Tenant members can insert products" ON public.products;
CREATE POLICY "Tenant members can insert products" ON public.products
  FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
DROP POLICY IF EXISTS "Tenant members can update products" ON public.products;
CREATE POLICY "Tenant members can update products" ON public.products
  FOR UPDATE TO authenticated USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
DROP POLICY IF EXISTS "Admins can delete products" ON public.products;
CREATE POLICY "Admins can delete products" ON public.products
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_superadmin(auth.uid()));

-- product_categories
DROP POLICY IF EXISTS "Tenant view categories" ON public.product_categories;
CREATE POLICY "Tenant view categories" ON public.product_categories
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
DROP POLICY IF EXISTS "Tenant insert categories" ON public.product_categories;
CREATE POLICY "Tenant insert categories" ON public.product_categories
  FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
DROP POLICY IF EXISTS "Tenant update categories" ON public.product_categories;
CREATE POLICY "Tenant update categories" ON public.product_categories
  FOR UPDATE TO authenticated USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
DROP POLICY IF EXISTS "Admin delete categories" ON public.product_categories;
CREATE POLICY "Admin delete categories" ON public.product_categories
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_superadmin(auth.uid()));
CREATE POLICY "Public can read active categories" ON public.product_categories
  FOR SELECT TO anon USING (true);

-- promotions
DROP POLICY IF EXISTS "tenant view promotions" ON public.promotions;
CREATE POLICY "tenant view promotions" ON public.promotions
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
DROP POLICY IF EXISTS "tenant manage promotions" ON public.promotions;
CREATE POLICY "tenant manage promotions" ON public.promotions
  FOR ALL TO authenticated USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
CREATE POLICY "Public can read active promotions" ON public.promotions
  FOR SELECT TO anon USING (is_active = true);

-- product_reviews (public read for anon only)
DROP POLICY IF EXISTS "Public can read visible reviews" ON public.product_reviews;
CREATE POLICY "Public can read visible reviews" ON public.product_reviews
  FOR SELECT TO anon, authenticated USING (is_visible = true);

-- delivery_zones
DROP POLICY IF EXISTS "public_read_zones" ON public.delivery_zones;
CREATE POLICY "public_read_zones" ON public.delivery_zones
  FOR SELECT TO anon, authenticated USING (is_active = true);
DROP POLICY IF EXISTS "tenant_zones" ON public.delivery_zones;
CREATE POLICY "tenant_zones" ON public.delivery_zones
  FOR ALL TO authenticated USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));