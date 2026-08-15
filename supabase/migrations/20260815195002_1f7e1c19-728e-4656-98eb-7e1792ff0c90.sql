-- Cantidades devueltas / disponibles por línea de venta
CREATE OR REPLACE FUNCTION public.sale_returnable_items(p_sale_id uuid)
RETURNS TABLE (
  sale_item_id uuid,
  product_id uuid,
  product_name text,
  price numeric,
  qty_sold numeric,
  qty_returned numeric,
  qty_available numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT si.id,
         si.product_id,
         si.product_name,
         si.price,
         si.qty::numeric,
         COALESCE(r.qty_returned, 0),
         GREATEST(si.qty::numeric - COALESCE(r.qty_returned, 0), 0)
    FROM public.sale_items si
    LEFT JOIN (
      SELECT sri.sale_item_id, SUM(sri.qty) AS qty_returned
        FROM public.sale_return_items sri
        JOIN public.sale_returns sr ON sr.id = sri.return_id
       WHERE sr.status IS DISTINCT FROM 'cancelled'
       GROUP BY sri.sale_item_id
    ) r ON r.sale_item_id = si.id
   WHERE si.sale_id = p_sale_id
   ORDER BY si.product_name;
$$;

-- Registro de devolución con validación de cantidades y reposición de stock
CREATE OR REPLACE FUNCTION public.create_sale_return(
  p_sale_id uuid,
  p_items jsonb,
  p_reason text DEFAULT NULL,
  p_refund_method text DEFAULT 'cash',
  p_restock boolean DEFAULT true,
  p_location_type text DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
  v_it jsonb;
  v_item record;
  v_qty numeric;
  v_returned numeric;
  v_total numeric := 0;
  v_return_id uuid;
  v_number text;
  v_loc_type text;
  v_loc_id uuid;
  v_count int := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Debe indicar al menos un producto a devolver';
  END IF;

  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF v_sale IS NULL THEN RAISE EXCEPTION 'Venta no encontrada'; END IF;
  IF v_sale.status = 'cancelled' THEN RAISE EXCEPTION 'No se puede devolver una venta cancelada'; END IF;

  IF NOT (public.is_tenant_member(auth.uid(), v_sale.tenant_id) OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado para operar sobre esta venta';
  END IF;

  v_number := 'DEV-' || to_char(now(), 'YYMMDD') || '-' || lpad(
    (COALESCE((SELECT COUNT(*) FROM public.sale_returns
                WHERE tenant_id = v_sale.tenant_id
                  AND created_at::date = CURRENT_DATE), 0) + 1)::text, 4, '0');

  -- Validación previa de cantidades y cálculo del importe
  FOR v_it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((v_it->>'qty')::numeric, 0);
    IF v_qty <= 0 THEN CONTINUE; END IF;

    SELECT si.id, si.product_id, si.product_name, si.price, si.qty::numeric AS qty
      INTO v_item
      FROM public.sale_items si
     WHERE si.id = (v_it->>'sale_item_id')::uuid AND si.sale_id = p_sale_id;
    IF v_item IS NULL THEN
      RAISE EXCEPTION 'La línea indicada no pertenece a esta venta';
    END IF;

    SELECT COALESCE(SUM(sri.qty), 0) INTO v_returned
      FROM public.sale_return_items sri
      JOIN public.sale_returns sr ON sr.id = sri.return_id
     WHERE sri.sale_item_id = v_item.id AND sr.status IS DISTINCT FROM 'cancelled';

    IF v_qty > (v_item.qty - v_returned) THEN
      RAISE EXCEPTION 'No se puede devolver % de "%": vendidas %, ya devueltas %',
        v_qty, v_item.product_name, v_item.qty, v_returned;
    END IF;

    v_total := v_total + (v_qty * v_item.price);
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN RAISE EXCEPTION 'Debe indicar al menos una cantidad mayor que cero'; END IF;

  INSERT INTO public.sale_returns (tenant_id, sale_id, return_number, reason, total, refund_method, restock, status, performed_by)
  VALUES (v_sale.tenant_id, p_sale_id, v_number, NULLIF(p_reason, ''), v_total,
          COALESCE(NULLIF(p_refund_method, ''), 'cash'), COALESCE(p_restock, true), 'completed', auth.uid())
  RETURNING id INTO v_return_id;

  FOR v_it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((v_it->>'qty')::numeric, 0);
    IF v_qty <= 0 THEN CONTINUE; END IF;
    SELECT si.id, si.product_id, si.product_name, si.price
      INTO v_item
      FROM public.sale_items si
     WHERE si.id = (v_it->>'sale_item_id')::uuid AND si.sale_id = p_sale_id;

    INSERT INTO public.sale_return_items (return_id, sale_item_id, product_id, product_name, qty, price, total)
    VALUES (v_return_id, v_item.id, v_item.product_id, v_item.product_name, v_qty, v_item.price, v_qty * v_item.price);
  END LOOP;

  IF COALESCE(p_restock, true) THEN
    v_loc_type := COALESCE(NULLIF(p_location_type, ''), CASE WHEN v_sale.store_id IS NOT NULL THEN 'store' END);
    v_loc_id := COALESCE(p_location_id, v_sale.store_id);
    IF v_loc_type IS NOT NULL AND v_loc_id IS NOT NULL THEN
      PERFORM public.process_sale_return(v_return_id, v_loc_type, v_loc_id);
    END IF;
  END IF;

  RETURN v_return_id;
END; $$;

-- Vista de historial con datos reales de la venta
CREATE OR REPLACE VIEW public.sale_returns_view
WITH (security_invoker = on) AS
SELECT sr.id,
       sr.tenant_id,
       sr.sale_id,
       sr.return_number,
       sr.reason,
       sr.total,
       sr.refund_method,
       sr.restock,
       sr.status,
       sr.performed_by,
       sr.created_at,
       s.ticket_number,
       s.created_at AS sale_date,
       s.total AS sale_total,
       s.currency,
       s.store_id,
       s.shift_id,
       s.customer_id,
       c.name AS customer_name,
       pr.full_name AS performed_by_name,
       (SELECT COALESCE(SUM(i.qty), 0) FROM public.sale_return_items i WHERE i.return_id = sr.id) AS units_returned,
       (SELECT COUNT(*) FROM public.sale_return_items i WHERE i.return_id = sr.id) AS lines_returned
  FROM public.sale_returns sr
  LEFT JOIN public.sales s ON s.id = sr.sale_id
  LEFT JOIN public.customers c ON c.id = s.customer_id
  LEFT JOIN public.profiles pr ON pr.user_id = sr.performed_by;

GRANT SELECT ON public.sale_returns_view TO authenticated;

CREATE INDEX IF NOT EXISTS idx_sale_returns_tenant_created ON public.sale_returns (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_returns_sale ON public.sale_returns (sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_return_items_sale_item ON public.sale_return_items (sale_item_id);