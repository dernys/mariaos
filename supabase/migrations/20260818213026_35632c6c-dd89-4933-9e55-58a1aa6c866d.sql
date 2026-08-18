DROP POLICY IF EXISTS "Public can read active tenants" ON public.tenants;
REVOKE SELECT ON public.tenants FROM anon;