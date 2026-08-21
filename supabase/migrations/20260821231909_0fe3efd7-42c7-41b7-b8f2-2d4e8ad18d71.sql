ALTER VIEW public.tenants_public SET (security_invoker = false);
ALTER VIEW public.stores_public SET (security_invoker = false);
GRANT SELECT ON public.tenants_public TO anon, authenticated;
GRANT SELECT ON public.stores_public TO anon, authenticated;