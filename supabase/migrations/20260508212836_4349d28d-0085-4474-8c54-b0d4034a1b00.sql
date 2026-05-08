-- Public bucket for product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view product images
DROP POLICY IF EXISTS "Public read product-images" ON storage.objects;
CREATE POLICY "Public read product-images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- Authenticated tenant users can upload/update/delete in their tenant folder
DROP POLICY IF EXISTS "Tenant users upload product-images" ON storage.objects;
CREATE POLICY "Tenant users upload product-images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (
    is_superadmin(auth.uid())
    OR ((storage.foldername(name))[1])::uuid IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Tenant users update product-images" ON storage.objects;
CREATE POLICY "Tenant users update product-images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (
    is_superadmin(auth.uid())
    OR ((storage.foldername(name))[1])::uuid IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Tenant users delete product-images" ON storage.objects;
CREATE POLICY "Tenant users delete product-images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (
    is_superadmin(auth.uid())
    OR ((storage.foldername(name))[1])::uuid IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  )
);