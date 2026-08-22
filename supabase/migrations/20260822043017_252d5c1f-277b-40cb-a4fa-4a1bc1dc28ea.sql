DROP FUNCTION IF EXISTS public.cqo_purchase_items_insert(uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.fill_purchase_item_product_info()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_p record;
BEGIN
  IF NEW.product_id IS NOT NULL AND (NEW.product_name IS NULL OR NEW.sku IS NULL OR NEW.unit IS NULL) THEN
    SELECT p.name, p.sku, p.unit INTO v_p FROM public.products p WHERE p.id = NEW.product_id;
    NEW.product_name := COALESCE(NEW.product_name, v_p.name);
    NEW.sku := COALESCE(NEW.sku, v_p.sku);
    NEW.unit := COALESCE(NEW.unit, v_p.unit);
  END IF;
  IF NEW.product_name IS NULL THEN
    RAISE EXCEPTION 'La línea de compra requiere producto o descripción';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.fill_purchase_item_product_info() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_fill_purchase_item_product_info ON public.purchase_items;
CREATE TRIGGER trg_fill_purchase_item_product_info
BEFORE INSERT OR UPDATE ON public.purchase_items
FOR EACH ROW EXECUTE FUNCTION public.fill_purchase_item_product_info();