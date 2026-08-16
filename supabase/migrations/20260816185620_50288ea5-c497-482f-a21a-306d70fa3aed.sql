-- 1. Catálogo de unidades de medida
CREATE TABLE IF NOT EXISTS public.units_of_measure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  decimals integer NOT NULL DEFAULT 0,
  factor numeric NOT NULL DEFAULT 1,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.units_of_measure TO authenticated;
GRANT ALL ON public.units_of_measure TO service_role;

ALTER TABLE public.units_of_measure ENABLE ROW LEVEL SECURITY;

CREATE POLICY "units_select_tenant" ON public.units_of_measure
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));

CREATE POLICY "units_manage_tenant" ON public.units_of_measure
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));

CREATE TRIGGER units_of_measure_updated_at
  BEFORE UPDATE ON public.units_of_measure
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Unidad en productos y snapshots en líneas
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.units_of_measure(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit_code text;
ALTER TABLE public.purchase_items ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE public.physical_count_items ADD COLUMN IF NOT EXISTS unit text;

CREATE OR REPLACE FUNCTION public.fill_line_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.unit IS NULL AND NEW.product_id IS NOT NULL THEN
    SELECT COALESCE(u.code, p.unit_code, 'u') INTO NEW.unit
    FROM public.products p
    LEFT JOIN public.units_of_measure u ON u.id = p.unit_id
    WHERE p.id = NEW.product_id;
    NEW.unit := COALESCE(NEW.unit, 'u');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS purchase_items_fill_unit ON public.purchase_items;
CREATE TRIGGER purchase_items_fill_unit BEFORE INSERT OR UPDATE ON public.purchase_items
  FOR EACH ROW EXECUTE FUNCTION public.fill_line_unit();

DROP TRIGGER IF EXISTS stock_transfer_items_fill_unit ON public.stock_transfer_items;
CREATE TRIGGER stock_transfer_items_fill_unit BEFORE INSERT OR UPDATE ON public.stock_transfer_items
  FOR EACH ROW EXECUTE FUNCTION public.fill_line_unit();

DROP TRIGGER IF EXISTS physical_count_items_fill_unit ON public.physical_count_items;
CREATE TRIGGER physical_count_items_fill_unit BEFORE INSERT OR UPDATE ON public.physical_count_items
  FOR EACH ROW EXECUTE FUNCTION public.fill_line_unit();

-- 3. Editar compra en borrador
CREATE OR REPLACE FUNCTION public.update_purchase_draft(
  p_purchase_id uuid,
  p_supplier_id uuid,
  p_destination_type text,
  p_destination_id uuid,
  p_tax_rate_id uuid,
  p_tax numeric,
  p_notes text,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p record;
  v_subtotal numeric := 0;
  r jsonb;
BEGIN
  SELECT * INTO v_p FROM public.purchases WHERE id = p_purchase_id FOR UPDATE;
  IF v_p IS NULL THEN RAISE EXCEPTION 'Compra no encontrada'; END IF;
  IF NOT (public.is_tenant_member(v_p.tenant_id) OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF v_p.status <> 'draft' THEN RAISE EXCEPTION 'Solo se pueden editar compras en borrador'; END IF;
  IF jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'La compra debe tener al menos una línea';
  END IF;

  DELETE FROM public.purchase_items WHERE purchase_id = p_purchase_id;

  FOR r IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.purchase_items (purchase_id, product_id, product_name, sku, qty, cost, total, unit)
    SELECT p_purchase_id, p.id, p.name, p.sku,
           (r->>'qty')::numeric, (r->>'cost')::numeric,
           (r->>'qty')::numeric * (r->>'cost')::numeric,
           NULLIF(r->>'unit','')
    FROM public.products p WHERE p.id = (r->>'product_id')::uuid;
    v_subtotal := v_subtotal + (r->>'qty')::numeric * (r->>'cost')::numeric;
  END LOOP;

  UPDATE public.purchases SET
    supplier_id = p_supplier_id,
    destination_type = COALESCE(p_destination_type, destination_type),
    destination_id = COALESCE(p_destination_id, destination_id),
    tax_rate_id = p_tax_rate_id,
    subtotal = v_subtotal,
    tax = COALESCE(p_tax, 0),
    total = v_subtotal + COALESCE(p_tax, 0),
    notes = p_notes,
    updated_at = now()
  WHERE id = p_purchase_id;
END $$;

REVOKE ALL ON FUNCTION public.update_purchase_draft(uuid,uuid,text,uuid,uuid,numeric,text,jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_purchase_draft(uuid,uuid,text,uuid,uuid,numeric,text,jsonb) TO authenticated;

-- 4. Cancelar compra (con reversión de stock y contabilidad si estaba recibida)
CREATE OR REPLACE FUNCTION public.cancel_purchase(p_purchase_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p record;
  r record;
  je record;
  v_prev numeric;
  v_new numeric;
BEGIN
  SELECT * INTO v_p FROM public.purchases WHERE id = p_purchase_id FOR UPDATE;
  IF v_p IS NULL THEN RAISE EXCEPTION 'Compra no encontrada'; END IF;
  IF NOT (public.is_tenant_member(v_p.tenant_id) OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF v_p.status = 'cancelled' THEN RAISE EXCEPTION 'La compra ya está cancelada'; END IF;
  IF COALESCE(v_p.amount_paid, 0) > 0.009 THEN
    RAISE EXCEPTION 'No se puede cancelar: la compra tiene pagos registrados. Registra una devolución de compra.';
  END IF;

  IF v_p.status = 'received' THEN
    FOR r IN SELECT * FROM public.purchase_items WHERE purchase_id = p_purchase_id LOOP
      IF r.product_id IS NULL THEN CONTINUE; END IF;

      SELECT stock INTO v_prev FROM public.product_stock
        WHERE product_id = r.product_id AND location_type = v_p.destination_type AND location_id = v_p.destination_id
        FOR UPDATE;

      v_new := COALESCE(v_prev, 0) - COALESCE(r.qty_received, r.qty);
      IF v_new < 0 THEN
        RAISE EXCEPTION 'No se puede cancelar: stock insuficiente de % en el destino', r.product_name;
      END IF;

      UPDATE public.product_stock SET stock = v_new, updated_at = now()
        WHERE product_id = r.product_id AND location_type = v_p.destination_type AND location_id = v_p.destination_id;

      INSERT INTO public.inventory_movements (tenant_id, product_id, movement_type, quantity, previous_stock, new_stock,
        reference_type, reference_id, performed_by, location_type, location_id, reason)
      VALUES (v_p.tenant_id, r.product_id, 'purchase_cancel', -COALESCE(r.qty_received, r.qty), COALESCE(v_prev,0), v_new,
        'purchase', p_purchase_id, auth.uid(), v_p.destination_type, v_p.destination_id,
        COALESCE('Cancelación de compra: ' || p_reason, 'Cancelación de compra'));

      UPDATE public.purchase_items SET qty_received = 0 WHERE id = r.id;
    END LOOP;

    FOR je IN SELECT id FROM public.journal_entries
      WHERE reference_type = 'purchase' AND reference_id = p_purchase_id
        AND status = 'posted' AND reversed_by IS NULL
    LOOP
      PERFORM public.reverse_journal_entry(je.id, COALESCE(p_reason, 'Cancelación de compra ' || v_p.purchase_number));
    END LOOP;
  END IF;

  UPDATE public.purchases SET
    status = 'cancelled',
    notes = COALESCE(notes, '') || CASE WHEN p_reason IS NOT NULL THEN ' | Cancelada: ' || p_reason ELSE '' END,
    updated_at = now()
  WHERE id = p_purchase_id;
END $$;

REVOKE ALL ON FUNCTION public.cancel_purchase(uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_purchase(uuid,text) TO authenticated;