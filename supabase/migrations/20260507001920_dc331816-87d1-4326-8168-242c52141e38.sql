
-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid,
  category text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text,
  action_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_tenant_unread ON public.notifications(tenant_id, read_at, created_at DESC);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

CREATE POLICY "tenant users view notifications" ON public.notifications FOR SELECT
USING (
  public.is_superadmin(auth.uid())
  OR EXISTS (SELECT 1 FROM public.tenant_users tu WHERE tu.tenant_id = notifications.tenant_id AND tu.user_id = auth.uid())
);

CREATE POLICY "tenant users update notifications" ON public.notifications FOR UPDATE
USING (
  public.is_superadmin(auth.uid())
  OR EXISTS (SELECT 1 FROM public.tenant_users tu WHERE tu.tenant_id = notifications.tenant_id AND tu.user_id = auth.uid())
);

CREATE POLICY "tenant users delete notifications" ON public.notifications FOR DELETE
USING (
  public.is_superadmin(auth.uid())
  OR EXISTS (SELECT 1 FROM public.tenant_users tu WHERE tu.tenant_id = notifications.tenant_id AND tu.user_id = auth.uid())
);

CREATE POLICY "system insert notifications" ON public.notifications FOR INSERT
WITH CHECK (true);

-- Helper function to create notifications
CREATE OR REPLACE FUNCTION public.create_notification(
  p_tenant_id uuid,
  p_category text,
  p_title text,
  p_message text DEFAULT NULL,
  p_severity text DEFAULT 'info',
  p_action_url text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_user_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO notifications (tenant_id, user_id, category, severity, title, message, action_url, metadata)
  VALUES (p_tenant_id, p_user_id, p_category, p_severity, p_title, p_message, p_action_url, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- Trigger: low stock
CREATE OR REPLACE FUNCTION public.notify_low_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_min numeric; v_name text;
BEGIN
  SELECT COALESCE(min_stock,0), name INTO v_min, v_name FROM products WHERE id = NEW.product_id;
  IF v_min > 0 AND NEW.stock <= v_min AND (OLD.stock IS NULL OR OLD.stock > v_min) THEN
    PERFORM create_notification(
      NEW.tenant_id, 'inventory', 'Stock bajo: ' || v_name,
      'Stock actual: ' || NEW.stock::text || ' (mínimo: ' || v_min::text || ')',
      'warning', '/inventario',
      jsonb_build_object('product_id', NEW.product_id, 'stock', NEW.stock)
    );
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_low_stock
AFTER INSERT OR UPDATE OF stock ON public.product_stock
FOR EACH ROW EXECUTE FUNCTION public.notify_low_stock();

-- Trigger: shift opened/closed
CREATE OR REPLACE FUNCTION public.notify_shift_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM create_notification(
      NEW.tenant_id, 'shift', 'Turno abierto',
      'Apertura con efectivo: ' || COALESCE(NEW.opening_cash,0)::text,
      'info', '/turnos', jsonb_build_object('shift_id', NEW.id)
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status <> 'closed' AND NEW.status = 'closed' THEN
    PERFORM create_notification(
      NEW.tenant_id, 'shift',
      CASE WHEN ABS(COALESCE(NEW.cash_difference,0)) > 0.01 THEN 'Cierre de caja con diferencia' ELSE 'Turno cerrado' END,
      'Diferencia: ' || COALESCE(NEW.cash_difference,0)::text || ' | Ventas: ' || COALESCE(NEW.total_sales,0)::text,
      CASE WHEN ABS(COALESCE(NEW.cash_difference,0)) > 0.01 THEN 'warning' ELSE 'success' END,
      '/turnos', jsonb_build_object('shift_id', NEW.id, 'difference', NEW.cash_difference)
    );
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_shift_change
AFTER INSERT OR UPDATE ON public.sales_shifts
FOR EACH ROW EXECUTE FUNCTION public.notify_shift_change();

-- Trigger: invoice issued
CREATE OR REPLACE FUNCTION public.notify_invoice_issued() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'issued' THEN
    PERFORM create_notification(
      NEW.tenant_id, 'invoice', 'Factura emitida ' || NEW.invoice_number,
      'Cliente: ' || COALESCE(NEW.customer_name,'Consumidor final') || ' | Total: ' || NEW.total::text,
      'success', '/facturas', jsonb_build_object('invoice_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_invoice_issued
AFTER INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.notify_invoice_issued();

-- Trigger: account payment received
CREATE OR REPLACE FUNCTION public.notify_account_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM create_notification(
    NEW.tenant_id, 'payment',
    CASE WHEN NEW.direction = 'in' THEN 'Pago recibido' ELSE 'Pago realizado' END,
    'Monto: ' || NEW.amount::text || ' ' || NEW.currency || ' (' || NEW.method || ')',
    'success', '/cuentas', jsonb_build_object('payment_id', NEW.id, 'party_type', NEW.party_type)
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_account_payment
AFTER INSERT ON public.account_payments
FOR EACH ROW EXECUTE FUNCTION public.notify_account_payment();

-- Trigger: sale return
CREATE OR REPLACE FUNCTION public.notify_sale_return() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM create_notification(
    NEW.tenant_id, 'return', 'Devolución registrada',
    'Total devuelto: ' || NEW.total::text || ' (' || NEW.refund_method || ')',
    'warning', '/ventas', jsonb_build_object('return_id', NEW.id, 'sale_id', NEW.sale_id)
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_sale_return
AFTER INSERT ON public.sale_returns
FOR EACH ROW EXECUTE FUNCTION public.notify_sale_return();
