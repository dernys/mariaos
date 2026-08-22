ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS unit_cost numeric;

CREATE OR REPLACE FUNCTION public.missing_cogs_report(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_lines jsonb; v_pending jsonb;
BEGIN
  IF NOT public.assert_tenant_access(p_tenant) THEN
    RAISE EXCEPTION 'No autorizado en este negocio';
  END IF;

  WITH target_sales AS (
    SELECT s.id, s.ticket_number, s.created_at
      FROM public.sales s
     WHERE s.tenant_id = p_tenant
       AND COALESCE(s.status,'') <> 'cancelled'
       AND EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.reference_type='sale' AND e.reference_id=s.id AND e.status='posted')
       AND NOT EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.reference_type='sale_cogs_adjustment' AND e.reference_id=s.id)
       AND NOT EXISTS (
         SELECT 1 FROM public.journal_entries e
           JOIN public.journal_entry_lines l ON l.entry_id = e.id
           JOIN public.accounting_accounts a ON a.id = l.account_id
          WHERE e.reference_type='sale' AND e.reference_id=s.id AND a.type='cost')
  ), lines AS (
    SELECT si.id AS sale_item_id, ts.id AS sale_id, ts.ticket_number, ts.created_at AS sale_date,
           si.product_id, si.product_name, si.sku, si.qty::numeric AS qty,
           COALESCE(si.unit_cost, public.product_effective_cost(si.product_id), 0) AS unit_cost
      FROM target_sales ts
      JOIN public.sale_items si ON si.sale_id = ts.id
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(l) || jsonb_build_object('total_cost', round(l.qty * l.unit_cost, 2))
             ORDER BY l.sale_date DESC) FILTER (WHERE l.unit_cost > 0), '[]'::jsonb),
    COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.sale_date DESC) FILTER (WHERE l.unit_cost <= 0), '[]'::jsonb)
    INTO v_lines, v_pending
  FROM lines l;

  RETURN jsonb_build_object(
    'resolvable', v_lines,
    'pending', v_pending,
    'resolvable_count', jsonb_array_length(v_lines),
    'pending_count', jsonb_array_length(v_pending),
    'estimated_amount', COALESCE((SELECT round(SUM((x->>'total_cost')::numeric),2) FROM jsonb_array_elements(v_lines) x), 0),
    'sales_count', COALESCE((SELECT COUNT(DISTINCT x->>'sale_id') FROM jsonb_array_elements(v_lines) x), 0)
  );
END $$;

REVOKE ALL ON FUNCTION public.missing_cogs_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.missing_cogs_report(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_sale_item_cost(p_sale_item_id uuid, p_product_id uuid DEFAULT NULL, p_unit_cost numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid; v_cost numeric; v_sale uuid;
BEGIN
  SELECT s.tenant_id, s.id INTO v_tenant, v_sale
    FROM public.sale_items si JOIN public.sales s ON s.id = si.sale_id
   WHERE si.id = p_sale_item_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Línea de venta no encontrada'; END IF;
  IF NOT public.assert_tenant_access(v_tenant) THEN RAISE EXCEPTION 'No autorizado en este negocio'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contador') OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'Solo administración o contabilidad puede resolver costos';
  END IF;
  IF p_product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.products p WHERE p.id = p_product_id AND p.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'El producto no pertenece a este negocio';
  END IF;
  IF p_unit_cost IS NOT NULL AND (p_unit_cost < 0 OR p_unit_cost >= 1e12) THEN
    RAISE EXCEPTION 'Costo unitario inválido';
  END IF;

  UPDATE public.sale_items
     SET product_id = COALESCE(p_product_id, product_id),
         unit_cost  = COALESCE(p_unit_cost, unit_cost)
   WHERE id = p_sale_item_id;

  SELECT COALESCE(si.unit_cost, public.product_effective_cost(si.product_id), 0) INTO v_cost
    FROM public.sale_items si WHERE si.id = p_sale_item_id;

  INSERT INTO public.activity_log(tenant_id, entity_type, entity_id, action, description, metadata, performed_by)
  VALUES (v_tenant, 'sale_item', p_sale_item_id, 'cost_resolved',
          format('Costo de línea de venta resuelto manualmente: %s', round(v_cost,2)),
          jsonb_build_object('sale_id', v_sale, 'product_id', p_product_id, 'unit_cost', p_unit_cost), auth.uid());

  RETURN jsonb_build_object('sale_item_id', p_sale_item_id, 'unit_cost', round(v_cost,2));
END $$;

REVOKE ALL ON FUNCTION public.resolve_sale_item_cost(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_sale_item_cost(uuid, uuid, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_missing_cogs(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sale record;
  v_cogs numeric;
  v_acc_cogs uuid; v_acc_inv uuid;
  v_entry uuid;
  v_count int := 0;
  v_total numeric := 0;
BEGIN
  IF NOT public.assert_tenant_access(p_tenant) THEN
    RAISE EXCEPTION 'No autorizado en este negocio';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contador') OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'Solo administración o contabilidad puede registrar ajustes';
  END IF;

  PERFORM ensure_default_accounts(p_tenant);
  v_acc_cogs := resolve_account_by_role(p_tenant, 'cogs');
  v_acc_inv  := resolve_account_by_role(p_tenant, 'inventory');
  IF v_acc_cogs IS NULL OR v_acc_inv IS NULL THEN
    RAISE EXCEPTION 'Faltan cuentas de costo de ventas o inventario';
  END IF;

  FOR v_sale IN
    SELECT s.id, s.ticket_number, s.cost_center_id
    FROM public.sales s
    WHERE s.tenant_id = p_tenant
      AND COALESCE(s.status,'') <> 'cancelled'
      AND EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.reference_type='sale' AND e.reference_id=s.id AND e.status='posted')
      AND NOT EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.reference_type='sale_cogs_adjustment' AND e.reference_id=s.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.journal_entries e
        JOIN public.journal_entry_lines l ON l.entry_id = e.id
        JOIN public.accounting_accounts a ON a.id = l.account_id
        WHERE e.reference_type='sale' AND e.reference_id=s.id AND a.type='cost'
      )
  LOOP
    SELECT COALESCE(SUM(si.qty * COALESCE(si.unit_cost, public.product_effective_cost(si.product_id), 0)), 0) INTO v_cogs
      FROM public.sale_items si
      WHERE si.sale_id = v_sale.id;

    IF COALESCE(v_cogs,0) <= 0 THEN CONTINUE; END IF;

    INSERT INTO public.journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, status, created_by, posted_at, posted_by)
    VALUES (p_tenant, 'AJC-'||substr(v_sale.id::text,1,8), CURRENT_DATE,
            'Ajuste de costo de ventas '||COALESCE(v_sale.ticket_number, v_sale.id::text),
            'sale_cogs_adjustment', v_sale.id, 'posted', auth.uid(), now(), auth.uid())
    RETURNING id INTO v_entry;

    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry, v_acc_cogs, v_cogs, 0, 'Costo de ventas (ajuste)', v_sale.cost_center_id);
    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry, v_acc_inv, 0, v_cogs, 'Salida de inventario (ajuste)', v_sale.cost_center_id);

    v_count := v_count + 1;
    v_total := v_total + v_cogs;
  END LOOP;

  INSERT INTO public.activity_log(tenant_id, entity_type, entity_id, action, description, metadata, performed_by)
  VALUES (p_tenant, 'accounting', p_tenant, 'cogs_adjustment',
          format('Ajuste de costo de ventas en %s ventas por %s', v_count, round(v_total,2)),
          jsonb_build_object('sales', v_count, 'amount', round(v_total,2)), auth.uid());

  RETURN jsonb_build_object('sales_adjusted', v_count, 'amount', round(v_total,2));
END;
$function$;