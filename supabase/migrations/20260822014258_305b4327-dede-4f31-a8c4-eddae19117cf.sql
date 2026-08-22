
-- 1) HR documents: require admin/gerente/contador role in addition to tenant membership
DROP POLICY IF EXISTS "tenant_hr_docs_select" ON storage.objects;
DROP POLICY IF EXISTS "tenant_hr_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "tenant_hr_docs_delete" ON storage.objects;

CREATE POLICY "tenant_hr_docs_select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'hr-documents' AND (
    public.is_superadmin(auth.uid())
    OR (
      (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gerente') OR public.has_role(auth.uid(),'contador'))
      AND EXISTS (SELECT 1 FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.tenant_id::text = (storage.foldername(objects.name))[1])
    )
  )
);

CREATE POLICY "tenant_hr_docs_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'hr-documents' AND (
    public.is_superadmin(auth.uid())
    OR (
      (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gerente') OR public.has_role(auth.uid(),'contador'))
      AND EXISTS (SELECT 1 FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.tenant_id::text = (storage.foldername(objects.name))[1])
    )
  )
);

CREATE POLICY "tenant_hr_docs_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'hr-documents' AND (
    public.is_superadmin(auth.uid())
    OR (
      (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gerente') OR public.has_role(auth.uid(),'contador'))
      AND EXISTS (SELECT 1 FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.tenant_id::text = (storage.foldername(objects.name))[1])
    )
  )
);

-- 2) role_permissions: only admins/superadmins may read the matrix directly.
-- Regular users get their effective permissions through the my_permissions() definer function.
DROP POLICY IF EXISTS "Admins and own roles can view permissions" ON public.role_permissions;
CREATE POLICY "Admins can view permissions" ON public.role_permissions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.is_superadmin(auth.uid()));

-- 3) tenant-backups: explicit deny for client writes/deletes (service role bypasses RLS)
DROP POLICY IF EXISTS "tenant_backups_no_client_insert" ON storage.objects;
DROP POLICY IF EXISTS "tenant_backups_no_client_update" ON storage.objects;
DROP POLICY IF EXISTS "tenant_backups_no_client_delete" ON storage.objects;

CREATE POLICY "tenant_backups_no_client_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'tenant-backups' AND false);
CREATE POLICY "tenant_backups_no_client_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'tenant-backups' AND false) WITH CHECK (bucket_id = 'tenant-backups' AND false);
CREATE POLICY "tenant_backups_no_client_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'tenant-backups' AND false);
