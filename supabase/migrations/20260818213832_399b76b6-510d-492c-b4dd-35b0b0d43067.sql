CREATE TABLE public.data_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  label text NOT NULL,
  kind text NOT NULL DEFAULT 'manual',
  scope text NOT NULL DEFAULT 'full',
  entities text[] NOT NULL DEFAULT '{}',
  storage_path text,
  size_bytes bigint NOT NULL DEFAULT 0,
  record_count integer NOT NULL DEFAULT 0,
  checksum text,
  schema_version text NOT NULL DEFAULT 'v1',
  app_version text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  verified_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.data_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text,
  kind text NOT NULL,
  entity text,
  status text NOT NULL DEFAULT 'pending',
  strategy text,
  file_name text,
  file_checksum text,
  total_rows integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  restore_point_id uuid REFERENCES public.data_backups(id) ON DELETE SET NULL,
  reversible boolean NOT NULL DEFAULT false,
  error text,
  created_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_data_backups_tenant ON public.data_backups(tenant_id, created_at DESC);
CREATE INDEX idx_data_operations_tenant ON public.data_operations(tenant_id, created_at DESC);
CREATE UNIQUE INDEX idx_data_operations_dedupe
  ON public.data_operations(tenant_id, kind, file_checksum)
  WHERE file_checksum IS NOT NULL AND status = 'completed';

GRANT SELECT ON public.data_backups TO authenticated;
GRANT SELECT ON public.data_operations TO authenticated;
GRANT ALL ON public.data_backups TO service_role;
GRANT ALL ON public.data_operations TO service_role;

ALTER TABLE public.data_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "data_backups_read_tenant_admins" ON public.data_backups
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR (
      public.is_tenant_member(tenant_id)
      AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contador'))
    )
  );

CREATE POLICY "data_operations_read_tenant_admins" ON public.data_operations
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR (
      public.is_tenant_member(tenant_id)
      AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contador'))
    )
  );

CREATE TRIGGER trg_data_backups_updated_at BEFORE UPDATE ON public.data_backups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_data_operations_updated_at BEFORE UPDATE ON public.data_operations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE SEQUENCE IF NOT EXISTS public.data_operation_code_seq;

CREATE OR REPLACE FUNCTION public.data_operation_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := upper(left(NEW.kind, 3)) || '-' || lpad(nextval('public.data_operation_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_data_operation_code BEFORE INSERT ON public.data_operations
  FOR EACH ROW EXECUTE FUNCTION public.data_operation_code();

CREATE POLICY "tenant_backups_read_own_tenant" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'tenant-backups'
    AND (
      public.is_superadmin(auth.uid())
      OR (
        public.has_role(auth.uid(), 'admin')
        AND EXISTS (
          SELECT 1 FROM public.tenant_users tu
          WHERE tu.user_id = auth.uid()
            AND tu.tenant_id::text = (storage.foldername(name))[1]
        )
      )
    )
  );

INSERT INTO public.app_modules (name, slug, description, icon)
VALUES ('Data Center', 'data-center', 'Importación, exportación, backups, restauración y clonación de negocios', 'Database')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.role_permissions (role, module_id, can_view, can_create, can_edit, can_delete)
SELECT 'admin'::app_role, m.id, true, true, true, true
FROM public.app_modules m WHERE m.slug = 'data-center'
ON CONFLICT DO NOTHING;
