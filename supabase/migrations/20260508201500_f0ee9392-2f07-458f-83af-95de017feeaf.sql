ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS tax_rate_id uuid REFERENCES public.tax_rates(id);
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS tax_rate_id uuid REFERENCES public.tax_rates(id);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tax_rate_id uuid REFERENCES public.tax_rates(id);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS default_tax_rate_id uuid REFERENCES public.tax_rates(id);
CREATE INDEX IF NOT EXISTS idx_purchases_tax_rate ON public.purchases(tax_rate_id);
CREATE INDEX IF NOT EXISTS idx_sales_tax_rate ON public.sales(tax_rate_id);
CREATE INDEX IF NOT EXISTS idx_products_default_tax_rate ON public.products(default_tax_rate_id);