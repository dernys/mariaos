CREATE OR REPLACE FUNCTION public.inventory_movement_trace(_movement_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
  result jsonb;
BEGIN
  SELECT * INTO m FROM public.inventory_movements WHERE id = _movement_id;
  IF m.id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;
  IF NOT (public.is_tenant_member(m.tenant_id) OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  result := jsonb_build_object(
    'movement', jsonb_build_object(
      'id', m.id,
      'created_at', m.created_at,
      'movement_type', m.movement_type,
      'quantity', m.quantity,
      'previous_stock', m.previous_stock,
      'new_stock', m.new_stock,
      'reason', m.reason,
      'notes', m.notes,
      'reference_type', m.reference_type,
      'reference_id', m.reference_id,
      'client_uuid', m.client_uuid,
      'edited_at', m.edited_at,
      'product_name', (SELECT p.name FROM public.products p WHERE p.id = m.product_id),
      'product_sku', (SELECT p.sku FROM public.products p WHERE p.id = m.product_id),
      'unit', (SELECT u.abbreviation FROM public.products p
                 LEFT JOIN public.units_of_measure u ON u.id = p.unit_id
                WHERE p.id = m.product_id),
      'location_type', m.location_type,
      'location_name', COALESCE(
        (SELECT s.name FROM public.stores s WHERE s.id = m.location_id),
        (SELECT w.name FROM public.warehouses w WHERE w.id = m.location_id),
        (SELECT w.name FROM public.warehouses w WHERE w.id = m.warehouse_id)
      ),
      'performed_by_name', COALESCE(
        (SELECT pr.full_name FROM public.profiles pr WHERE pr.user_id = m.performed_by),
        'Sistema'
      ),
      'edited_by_name', (SELECT pr.full_name FROM public.profiles pr WHERE pr.user_id = m.edited_by)
    ),
    'changes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', h.id,
               'field', h.field,
               'old_value', h.old_value,
               'new_value', h.new_value,
               'created_at', h.created_at,
               'actor', COALESCE((SELECT pr.full_name FROM public.profiles pr WHERE pr.user_id = h.changed_by), 'Sistema')
             ) ORDER BY h.created_at DESC)
      FROM public.inventory_movement_history h
      WHERE h.movement_id = m.id
    ), '[]'::jsonb),
    'related', CASE
      WHEN m.reference_type IN ('sale','venta') THEN COALESCE((
        SELECT jsonb_build_object('kind','sale','label', s.sale_number, 'total', s.total, 'date', s.created_at)
        FROM public.sales s WHERE s.id = m.reference_id), '{}'::jsonb)
      WHEN m.reference_type IN ('purchase','compra') THEN COALESCE((
        SELECT jsonb_build_object('kind','purchase','label', pu.purchase_number, 'total', pu.total, 'date', pu.created_at)
        FROM public.purchases pu WHERE pu.id = m.reference_id), '{}'::jsonb)
      WHEN m.reference_type IN ('transfer','transferencia','stock_transfer') THEN COALESCE((
        SELECT jsonb_build_object('kind','transfer','label', tr.transfer_number, 'date', tr.created_at)
        FROM public.stock_transfers tr WHERE tr.id = m.reference_id), '{}'::jsonb)
      ELSE '{}'::jsonb
    END
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_movement_trace(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_movement_trace(uuid) TO authenticated;