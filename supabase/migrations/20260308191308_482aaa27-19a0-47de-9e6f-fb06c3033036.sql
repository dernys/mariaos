
-- Add business_type to tenants
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS business_type text NOT NULL DEFAULT 'empresa';

-- Add unique constraint for tenant_id + sku on products
CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_sku_unique ON public.products (tenant_id, sku);
