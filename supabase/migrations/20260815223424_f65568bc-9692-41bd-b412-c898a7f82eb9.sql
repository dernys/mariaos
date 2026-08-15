-- 1. product_categories: anon only active
DROP POLICY IF EXISTS "Public can read active categories" ON public.product_categories;
CREATE POLICY "Public can read active categories"
ON public.product_categories FOR SELECT TO anon
USING (is_active = true);

-- 2. product_reviews: hide customer/user linkage from anonymous visitors
REVOKE SELECT ON public.product_reviews FROM anon;
REVOKE SELECT ON public.product_reviews FROM authenticated;
GRANT SELECT (id, tenant_id, product_id, rating, title, comment, is_verified_purchase, is_visible, created_at, updated_at) ON public.product_reviews TO anon;
GRANT SELECT (id, tenant_id, product_id, user_id, rating, title, comment, is_verified_purchase, is_visible, created_at, updated_at) ON public.product_reviews TO authenticated;

-- 3. delivery_zones: not needed publicly
DROP POLICY IF EXISTS "public_read_zones" ON public.delivery_zones;
REVOKE SELECT ON public.delivery_zones FROM anon;

-- 4. public views -> security invoker, with column-scoped anon access on base tables
GRANT SELECT (id, name, slug, logo_url, business_type, is_active) ON public.tenants TO anon;
DROP POLICY IF EXISTS "Public can read active tenants" ON public.tenants;
CREATE POLICY "Public can read active tenants"
ON public.tenants FOR SELECT TO anon
USING (is_active = true);

GRANT SELECT (id, tenant_id, name, address, latitude, longitude, delivery_radius_km, accepts_delivery, accepts_pickup, is_active) ON public.stores TO anon;
DROP POLICY IF EXISTS "Public can read active stores" ON public.stores;
CREATE POLICY "Public can read active stores"
ON public.stores FOR SELECT TO anon
USING (is_active = true);

ALTER VIEW public.tenants_public SET (security_invoker = on);
ALTER VIEW public.stores_public SET (security_invoker = on);
ALTER VIEW public.product_ratings_public SET (security_invoker = on);

-- 5. demo metrics function no longer callable by anonymous clients
REVOKE EXECUTE ON FUNCTION public.public_demo_stats() FROM anon;
