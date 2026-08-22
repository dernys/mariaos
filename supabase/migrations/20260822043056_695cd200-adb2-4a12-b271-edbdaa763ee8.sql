CREATE OR REPLACE FUNCTION public.fill_purchase_item_product_info()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_name text; v_sku text; v_unit text;
BEGIN
  IF NEW.product_id IS NOT NULL AND (NEW.product_name IS NULL OR NEW.sku IS NULL OR NEW.unit IS NULL) THEN
    SELECT p.name, p.sku, p.unit_code INTO v_name, v_sku, v_unit
      FROM public.products p WHERE p.id = NEW.product_id;
    NEW.product_name := COALESCE(NEW.product_name, v_name);
    NEW.sku := COALESCE(NEW.sku, v_sku);
    NEW.unit := COALESCE(NEW.unit, v_unit);
  END IF;
  IF NEW.product_name IS NULL THEN
    RAISE EXCEPTION 'La línea de compra requiere producto o descripción';
  END IF;
  RETURN NEW;
END $$;