-- SEC: revocar ejecución pública (anon) de funciones SECURITY DEFINER internas
REVOKE ALL ON FUNCTION public.cancel_purchase(uuid, text) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.update_purchase_draft(uuid, uuid, text, uuid, uuid, numeric, text, jsonb) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.shares_tenant_with(uuid) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.fill_line_unit() FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.cancel_purchase(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_purchase_draft(uuid, uuid, text, uuid, uuid, numeric, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_tenant_with(uuid) TO authenticated;

-- SEC: anon no debe poder escribir en el catálogo de unidades de medida
REVOKE INSERT, UPDATE, DELETE ON public.units_of_measure FROM anon;