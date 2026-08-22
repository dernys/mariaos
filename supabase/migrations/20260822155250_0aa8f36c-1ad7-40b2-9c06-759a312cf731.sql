REVOKE ALL ON FUNCTION public.validate_business_admin(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_business_admin(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.rollback_business_provisioning(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_business_provisioning(uuid, text, text) TO service_role;