CREATE OR REPLACE FUNCTION public.guard_account_payment_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_due numeric; v_tenant uuid;
BEGIN
  IF current_user IN ('authenticated','anon') THEN
    IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gerente')
         OR public.has_role(auth.uid(),'cajero') OR public.has_role(auth.uid(),'contador')) THEN
      RAISE EXCEPTION 'No tienes permiso para registrar cobros o pagos';
    END IF;
    NEW.performed_by := auth.uid();
  END IF;
  IF NEW.amount IS NULL OR NEW.amount <= 0 OR NEW.amount_in_base IS NULL OR NEW.amount_in_base <= 0 THEN
    RAISE EXCEPTION 'El importe debe ser positivo';
  END IF;
  IF NEW.reference_type = 'sale' AND NEW.reference_id IS NOT NULL THEN
    SELECT tenant_id, total - COALESCE(amount_paid,0) INTO v_tenant, v_due FROM sales WHERE id = NEW.reference_id FOR UPDATE;
    IF v_tenant IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'Venta no encontrada'; END IF;
    IF NEW.amount_in_base > v_due + 0.01 THEN RAISE EXCEPTION 'El cobro supera el saldo pendiente'; END IF;
  ELSIF NEW.reference_type = 'purchase' AND NEW.reference_id IS NOT NULL THEN
    SELECT tenant_id, total - COALESCE(amount_paid,0) INTO v_tenant, v_due FROM purchases WHERE id = NEW.reference_id FOR UPDATE;
    IF v_tenant IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'Compra no encontrada'; END IF;
    IF NEW.amount_in_base > v_due + 0.01 THEN RAISE EXCEPTION 'El pago supera el saldo pendiente'; END IF;
  END IF;
  IF NEW.party_type = 'customer' AND NOT EXISTS (SELECT 1 FROM customers WHERE id = NEW.party_id AND tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'Cliente no encontrado';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_account_payment_insert ON public.account_payments;
CREATE TRIGGER trg_guard_account_payment_insert BEFORE INSERT ON public.account_payments
FOR EACH ROW EXECUTE FUNCTION public.guard_account_payment_insert();

CREATE OR REPLACE FUNCTION public.guard_customer_loyalty_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Direct client writes cannot change points; only server functions (run as owner) can.
  IF current_user IN ('authenticated','anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.loyalty_points := 0;
    ELSIF NEW.loyalty_points IS DISTINCT FROM OLD.loyalty_points THEN
      RAISE EXCEPTION 'Los puntos de fidelidad solo cambian mediante ventas o canjes';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_customer_loyalty_points ON public.customers;
CREATE TRIGGER trg_guard_customer_loyalty_points BEFORE INSERT OR UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.guard_customer_loyalty_points();

DROP POLICY IF EXISTS "Public read product-images" ON storage.objects;
CREATE POLICY "Tenant users read product-images" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'product-images' AND ((storage.foldername(name))[1])::uuid IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()));