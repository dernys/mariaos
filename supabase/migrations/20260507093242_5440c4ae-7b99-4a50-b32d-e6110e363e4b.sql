
CREATE TABLE IF NOT EXISTS public.pos_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE,
  default_tax_rate_id uuid,
  tax_included boolean NOT NULL DEFAULT false,
  tip_enabled boolean NOT NULL DEFAULT false,
  tip_percentages numeric[] NOT NULL DEFAULT ARRAY[10,15,20]::numeric[],
  tip_required boolean NOT NULL DEFAULT false,
  rounding_mode text NOT NULL DEFAULT 'none',
  allow_discounts boolean NOT NULL DEFAULT true,
  max_discount_pct numeric NOT NULL DEFAULT 100,
  allow_negative_stock boolean NOT NULL DEFAULT false,
  auto_print_receipt boolean NOT NULL DEFAULT false,
  default_currency text NOT NULL DEFAULT 'CUP',
  secondary_currency text,
  default_credit_days integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant manage pos_settings" ON public.pos_settings FOR ALL
USING ((tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())) OR is_superadmin(auth.uid()))
WITH CHECK ((tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())) OR is_superadmin(auth.uid()));

CREATE TRIGGER pos_settings_updated_at BEFORE UPDATE ON public.pos_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.module_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  module text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, module)
);

ALTER TABLE public.module_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant manage module_settings" ON public.module_settings FOR ALL
USING ((tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())) OR is_superadmin(auth.uid()))
WITH CHECK ((tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())) OR is_superadmin(auth.uid()));

CREATE TRIGGER module_settings_updated_at BEFORE UPDATE ON public.module_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.ensure_pos_settings(p_tenant_id uuid)
RETURNS public.pos_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row public.pos_settings;
BEGIN
  SELECT * INTO v_row FROM public.pos_settings WHERE tenant_id = p_tenant_id;
  IF v_row IS NULL THEN
    INSERT INTO public.pos_settings (tenant_id) VALUES (p_tenant_id)
    RETURNING * INTO v_row;
  END IF;
  RETURN v_row;
END; $$;
