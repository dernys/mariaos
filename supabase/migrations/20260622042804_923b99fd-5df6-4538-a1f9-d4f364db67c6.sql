
-- 1) Add columns to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS prep_minutes integer,
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_brand ON public.products(brand) WHERE brand IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_store_id ON public.products(store_id) WHERE store_id IS NOT NULL;

-- 2) product_reviews table
CREATE TABLE IF NOT EXISTS public.product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text,
  comment text,
  is_verified_purchase boolean NOT NULL DEFAULT false,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_reviews_product ON public.product_reviews(product_id) WHERE is_visible;
CREATE INDEX IF NOT EXISTS idx_product_reviews_tenant ON public.product_reviews(tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_user ON public.product_reviews(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_reviews_user_product ON public.product_reviews(product_id, user_id) WHERE user_id IS NOT NULL;

GRANT SELECT ON public.product_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_reviews TO authenticated;
GRANT ALL ON public.product_reviews TO service_role;

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

-- Public can read visible reviews
CREATE POLICY "Public can read visible reviews"
  ON public.product_reviews FOR SELECT
  USING (is_visible = true);

-- Authenticated users can insert their own reviews
CREATE POLICY "Users can create their own reviews"
  ON public.product_reviews FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own reviews
CREATE POLICY "Users can update their own reviews"
  ON public.product_reviews FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own reviews
CREATE POLICY "Users can delete their own reviews"
  ON public.product_reviews FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Tenant members can moderate reviews of their products
CREATE POLICY "Tenant members can moderate reviews"
  ON public.product_reviews FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = product_reviews.tenant_id
      AND tu.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = product_reviews.tenant_id
      AND tu.user_id = auth.uid()
  ));

CREATE POLICY "Tenant members can delete reviews"
  ON public.product_reviews FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = product_reviews.tenant_id
      AND tu.user_id = auth.uid()
  ));

-- updated_at trigger
DROP TRIGGER IF EXISTS update_product_reviews_updated_at ON public.product_reviews;
CREATE TRIGGER update_product_reviews_updated_at
  BEFORE UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Public aggregate view
CREATE OR REPLACE VIEW public.product_ratings_public AS
SELECT
  product_id,
  COUNT(*)::int AS reviews_count,
  ROUND(AVG(rating)::numeric, 2) AS rating_avg
FROM public.product_reviews
WHERE is_visible = true
GROUP BY product_id;

GRANT SELECT ON public.product_ratings_public TO anon, authenticated;
