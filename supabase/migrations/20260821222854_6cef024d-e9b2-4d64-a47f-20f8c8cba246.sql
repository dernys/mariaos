CREATE OR REPLACE FUNCTION public.marketplace_delivery_zones(p_tenant_ids uuid[])
RETURNS TABLE (id uuid, tenant_id uuid, name text, fee numeric, estimated_minutes integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT z.id, z.tenant_id, z.name, z.fee, z.estimated_minutes
  FROM delivery_zones z
  JOIN tenants t ON t.id = z.tenant_id AND t.is_active
  WHERE z.is_active AND z.tenant_id = ANY(p_tenant_ids)
  ORDER BY z.fee;
$$;

REVOKE ALL ON FUNCTION public.marketplace_delivery_zones(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketplace_delivery_zones(uuid[]) TO authenticated;