CREATE OR REPLACE FUNCTION public.issue_invoice_with_tax(
  p_sale_id uuid,
  p_series_code text DEFAULT NULL,
  p_tax_rate_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sale record;
  v_rate numeric;
  v_tax numeric;
  v_total numeric;
  v_invoice_id uuid;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF v_sale IS NULL THEN RAISE EXCEPTION 'Venta no encontrada'; END IF;

  IF NOT (public.is_superadmin(auth.uid()) OR EXISTS (
    SELECT 1 FROM tenant_users WHERE user_id = auth.uid() AND tenant_id = v_sale.tenant_id
  )) THEN
    RAISE EXCEPTION 'No autorizado en este tenant';
  END IF;

  IF p_tax_rate_id IS NOT NULL THEN
    SELECT rate INTO v_rate FROM tax_rates
     WHERE id = p_tax_rate_id AND tenant_id = v_sale.tenant_id AND is_active = true;
    IF v_rate IS NULL THEN RAISE EXCEPTION 'Tipo de impuesto no válido para este negocio'; END IF;
  END IF;

  -- Solo se puede recalcular si la venta no tenía impuesto ni cobros registrados.
  IF v_rate IS NOT NULL AND v_rate > 0
     AND COALESCE(v_sale.tax, 0) = 0
     AND COALESCE(v_sale.amount_paid, 0) = 0 THEN
    v_tax := round(COALESCE(v_sale.subtotal, 0) * (v_rate / 100.0), 2);
    v_total := round(COALESCE(v_sale.subtotal, 0) + v_tax, 2);

    UPDATE sales
       SET tax = v_tax, total = v_total, tax_rate_id = p_tax_rate_id, updated_at = now()
     WHERE id = p_sale_id;

    -- Reescribe el asiento con los nuevos importes (idempotente en su propia función).
    BEGIN
      PERFORM public.post_sale_journal_entry(p_sale_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'No se pudo reescribir el asiento de la venta %: %', p_sale_id, SQLERRM;
    END;
  ELSIF p_tax_rate_id IS NOT NULL THEN
    UPDATE sales SET tax_rate_id = p_tax_rate_id, updated_at = now() WHERE id = p_sale_id;
  END IF;

  v_invoice_id := public.issue_invoice(p_sale_id, p_series_code);

  IF p_tax_rate_id IS NOT NULL THEN
    UPDATE invoices SET tax_rate_id = p_tax_rate_id, updated_at = now() WHERE id = v_invoice_id;
  END IF;

  RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_invoice_with_tax(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_invoice_with_tax(uuid, text, uuid) TO authenticated, service_role;