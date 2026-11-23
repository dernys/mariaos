GRANT SELECT (country_code) ON public.tenants TO anon, authenticated;
CREATE OR REPLACE VIEW public.tenants_public WITH (security_invoker = true) AS
  SELECT id, name, slug, logo_url, business_type, country_code
    FROM public.tenants
   WHERE is_active = true;