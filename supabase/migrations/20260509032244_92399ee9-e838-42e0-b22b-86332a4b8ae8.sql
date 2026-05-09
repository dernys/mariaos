
-- Add cancellation tracking columns to sales
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid;

-- RPC to cancel a sale: revert stock, reverse balance, mark cancelled
CREATE OR REPLACE FUNCTION public.cancel_sale(p_sale_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
  v_pending numeric;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF v_sale IS NULL THEN RAISE EXCEPTION 'Venta no encontrada'; END IF;
  IF v_sale.status = 'cancelled' THEN RAISE EXCEPTION 'La venta ya está cancelada'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Debes indicar un motivo de cancelación';
  END IF;

  -- Revert stock (only reverses sale movements, idempotent against further calls because status changes)
  PERFORM public.revert_sale_stock(p_sale_id);

  -- Reverse outstanding credit balance to customer/employee, if any
  v_pending := GREATEST(0, COALESCE(v_sale.total,0) - COALESCE(v_sale.amount_paid,0));
  IF v_pending > 0.01 THEN
    IF v_sale.customer_id IS NOT NULL THEN
      UPDATE public.customers SET balance = balance - v_pending, updated_at = now()
        WHERE id = v_sale.customer_id;
    ELSIF v_sale.employee_id IS NOT NULL THEN
      UPDATE public.employees SET balance = balance - v_pending, updated_at = now()
        WHERE id = v_sale.employee_id;
    END IF;
  END IF;

  UPDATE public.sales
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = p_reason,
        cancelled_by = auth.uid(),
        updated_at = now()
    WHERE id = p_sale_id;

  -- Log activity
  INSERT INTO public.activity_log (entity_type, entity_id, action, description, tenant_id, performed_by)
  VALUES ('sale', p_sale_id, 'Venta cancelada', 'Motivo: ' || p_reason, v_sale.tenant_id, auth.uid());
END;
$$;
