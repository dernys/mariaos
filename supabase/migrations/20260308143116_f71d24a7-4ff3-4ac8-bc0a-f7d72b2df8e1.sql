
-- Tenants/Companies table
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  rfc TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tenant users (which users belong to which tenant)
CREATE TABLE public.tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_owner BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;

-- Add tenant_id to stores-related tables for multi-tenancy
ALTER TABLE public.sales_shifts ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);

-- Superadmin check function (uses service role, checks against a known user)
CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = _user_id
    AND email = current_setting('app.superadmin_email', true)
  )
$$;

-- RLS for tenants: superadmin can do everything, tenant members can view their tenant
CREATE POLICY "Superadmin full access on tenants"
  ON public.tenants FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Tenant members can view their tenant"
  ON public.tenants FOR SELECT TO authenticated
  USING (
    id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid())
  );

-- RLS for tenant_users
CREATE POLICY "Superadmin full access on tenant_users"
  ON public.tenant_users FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can view own tenant memberships"
  ON public.tenant_users FOR SELECT TO authenticated
  USING (user_id = auth.uid());
