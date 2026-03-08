
-- Create a superadmins table that only the service role can manage
CREATE TABLE public.superadmins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.superadmins ENABLE ROW LEVEL SECURITY;

-- Only superadmins can read this table
CREATE POLICY "Superadmins can view"
  ON public.superadmins FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Update is_superadmin function to check the superadmins table
CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.superadmins
    WHERE user_id = _user_id
  )
$$;

-- Update tenant policies to use the new function
DROP POLICY IF EXISTS "Superadmin can manage tenants" ON public.tenants;
CREATE POLICY "Superadmin can manage tenants"
  ON public.tenants FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Superadmin can manage tenant_users" ON public.tenant_users;
CREATE POLICY "Superadmin can manage tenant_users"
  ON public.tenant_users FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));
