DROP POLICY IF EXISTS "Tenant users read product-images" ON storage.objects;
CREATE POLICY "Tenant users read product-images" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] IN (SELECT tenant_id::text FROM public.tenant_users WHERE user_id = auth.uid()));