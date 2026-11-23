ALTER FUNCTION public.award_loyalty_points(uuid) RENAME TO award_loyalty_points_impl;
ALTER FUNCTION public.cancel_sale(uuid, text) RENAME TO cancel_sale_impl;
ALTER FUNCTION public.approve_leave(uuid, boolean, text) RENAME TO approve_leave_impl;
ALTER FUNCTION public.close_bank_reconciliation(uuid) RENAME TO close_bank_reconciliation_impl;
ALTER FUNCTION public.br_generate_nfe(uuid) RENAME TO br_generate_nfe_impl;
ALTER FUNCTION public.bill_kitchen_order(uuid, uuid) RENAME TO bill_kitchen_order_impl;
ALTER FUNCTION public.auto_match_bank_transaction(uuid) RENAME TO auto_match_bank_transaction_impl;

REVOKE ALL ON FUNCTION public.award_loyalty_points_impl(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_sale_impl(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_leave_impl(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_bank_reconciliation_impl(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.br_generate_nfe_impl(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bill_kitchen_order_impl(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_match_bank_transaction_impl(uuid) FROM PUBLIC, anon, authenticated;

-- Fail-closed: the record must exist and belong to a tenant the caller can access
CREATE OR REPLACE FUNCTION public.assert_record_tenant(p_tenant uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_tenant IS NULL THEN RAISE EXCEPTION 'forbidden: record not found'; END IF;
  PERFORM public.assert_tenant_access(p_tenant);
END; $$;
REVOKE ALL ON FUNCTION public.assert_record_tenant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_record_tenant(uuid) TO authenticated, service_role;

CREATE FUNCTION public.award_loyalty_points(p_sale_id uuid) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_record_tenant((SELECT tenant_id FROM public.sales WHERE id = p_sale_id));
  RETURN public.award_loyalty_points_impl(p_sale_id);
END; $$;

CREATE FUNCTION public.cancel_sale(p_sale_id uuid, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_record_tenant((SELECT tenant_id FROM public.sales WHERE id = p_sale_id));
  PERFORM public.cancel_sale_impl(p_sale_id, p_reason);
END; $$;

CREATE FUNCTION public.approve_leave(p_leave_id uuid, p_approve boolean, p_reason text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_record_tenant((SELECT tenant_id FROM public.leave_requests WHERE id = p_leave_id));
  IF auth.uid() IS NOT NULL AND NOT (
       public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente')
       OR public.has_role(auth.uid(), 'supervisor') OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden: solo administradores, gerentes o supervisores aprueban permisos';
  END IF;
  PERFORM public.approve_leave_impl(p_leave_id, p_approve, p_reason);
END; $$;

CREATE FUNCTION public.close_bank_reconciliation(p_reconciliation_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_record_tenant((SELECT tenant_id FROM public.bank_reconciliations WHERE id = p_reconciliation_id));
  RETURN public.close_bank_reconciliation_impl(p_reconciliation_id);
END; $$;

CREATE FUNCTION public.br_generate_nfe(p_sale_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_record_tenant((SELECT tenant_id FROM public.sales WHERE id = p_sale_id));
  RETURN public.br_generate_nfe_impl(p_sale_id);
END; $$;

CREATE FUNCTION public.bill_kitchen_order(p_order_id uuid, p_sale_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order_tenant uuid; v_sale_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_order_tenant FROM public.kitchen_orders WHERE id = p_order_id;
  SELECT tenant_id INTO v_sale_tenant FROM public.sales WHERE id = p_sale_id;
  PERFORM public.assert_record_tenant(v_order_tenant);
  IF p_sale_id IS NOT NULL AND v_sale_tenant IS DISTINCT FROM v_order_tenant THEN
    RAISE EXCEPTION 'forbidden: la venta no pertenece al mismo negocio';
  END IF;
  PERFORM public.bill_kitchen_order_impl(p_order_id, p_sale_id);
END; $$;

CREATE FUNCTION public.auto_match_bank_transaction(p_tx_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_record_tenant((SELECT tenant_id FROM public.bank_transactions WHERE id = p_tx_id));
  RETURN public.auto_match_bank_transaction_impl(p_tx_id);
END; $$;

REVOKE ALL ON FUNCTION public.award_loyalty_points(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_sale(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_leave(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_bank_reconciliation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.br_generate_nfe(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bill_kitchen_order(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.auto_match_bank_transaction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_loyalty_points(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_sale(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_leave(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_bank_reconciliation(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.br_generate_nfe(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bill_kitchen_order(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auto_match_bank_transaction(uuid) TO authenticated, service_role;

-- Riders cannot change their own approval status
DROP POLICY IF EXISTS "admins review riders" ON public.rider_profiles;
CREATE POLICY "admins review riders" ON public.rider_profiles FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente') OR is_superadmin(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente') OR is_superadmin(auth.uid()));

CREATE OR REPLACE FUNCTION public.guard_rider_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND auth.uid() IS NOT NULL
     AND NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente') OR is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden: solo un administrador puede cambiar el estado del repartidor';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_guard_rider_status ON public.rider_profiles;
CREATE TRIGGER trg_guard_rider_status BEFORE UPDATE ON public.rider_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_rider_status();