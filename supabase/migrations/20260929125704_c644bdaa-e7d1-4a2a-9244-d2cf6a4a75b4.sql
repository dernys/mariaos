CREATE OR REPLACE FUNCTION public.sync_product_total_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pid uuid;
BEGIN
  v_pid := COALESCE(NEW.product_id, OLD.product_id);
  UPDATE products p SET stock = COALESCE((SELECT sum(ps.stock) FROM product_stock ps WHERE ps.product_id = v_pid), 0)
   WHERE p.id = v_pid
     AND p.stock IS DISTINCT FROM COALESCE((SELECT sum(ps.stock) FROM product_stock ps WHERE ps.product_id = v_pid), 0);
  IF TG_OP = 'UPDATE' AND OLD.product_id IS DISTINCT FROM NEW.product_id THEN
    UPDATE products p SET stock = COALESCE((SELECT sum(ps.stock) FROM product_stock ps WHERE ps.product_id = OLD.product_id), 0)
     WHERE p.id = OLD.product_id;
  END IF;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.sync_product_total_stock() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_product_total_stock ON public.product_stock;
CREATE TRIGGER trg_sync_product_total_stock
AFTER INSERT OR UPDATE OF stock, product_id OR DELETE ON public.product_stock
FOR EACH ROW EXECUTE FUNCTION public.sync_product_total_stock();

UPDATE public.products p SET stock = s.total
FROM (SELECT product_id, sum(stock) total FROM public.product_stock GROUP BY product_id) s
WHERE s.product_id = p.id AND p.stock IS DISTINCT FROM s.total;