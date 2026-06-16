
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS locale text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS default_locale text NOT NULL DEFAULT 'es';
COMMENT ON COLUMN public.profiles.locale IS 'User UI language preference (es, es-CU, pt-BR, en, en-US). NULL = inherit from tenant.';
COMMENT ON COLUMN public.tenants.default_locale IS 'Tenant default UI language and regional locale.';
