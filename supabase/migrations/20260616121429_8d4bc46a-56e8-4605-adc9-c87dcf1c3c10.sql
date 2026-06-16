
-- ============================================================
-- DELIVERY COMMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.delivery_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  assignment_id uuid REFERENCES public.delivery_assignments(id) ON DELETE CASCADE,
  rider_id uuid REFERENCES public.delivery_riders(id) ON DELETE SET NULL,
  online_order_id uuid REFERENCES public.online_orders(id) ON DELETE SET NULL,
  base_amount numeric(18,2) NOT NULL DEFAULT 0,
  commission_pct numeric(6,2) NOT NULL DEFAULT 10,
  commission_amount numeric(18,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'CUP',
  status text NOT NULL DEFAULT 'pending',  -- pending, paid
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_commissions TO authenticated;
GRANT ALL ON public.delivery_commissions TO service_role;
ALTER TABLE public.delivery_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delivery_comm_tenant" ON public.delivery_commissions
  FOR ALL TO authenticated
  USING (
    tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS delivery_comm_tenant_idx ON public.delivery_commissions(tenant_id, status);

CREATE TRIGGER trg_delivery_comm_updated_at
  BEFORE UPDATE ON public.delivery_commissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_delivery_comm_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.delivery_commissions
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- ============================================================
-- CONCILIACIÓN BANCARIA AUTOMÁTICA
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_match_bank_transaction(p_tx_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tx record;
  v_payment_id uuid;
BEGIN
  SELECT * INTO v_tx FROM public.bank_transactions WHERE id = p_tx_id;
  IF v_tx.id IS NULL OR v_tx.matched_payment_id IS NOT NULL THEN
    RETURN v_tx.matched_payment_id;
  END IF;

  SELECT sp.id INTO v_payment_id
    FROM public.sale_payments sp
    JOIN public.sales s ON s.id = sp.sale_id
   WHERE s.tenant_id = v_tx.tenant_id
     AND ABS(sp.amount - ABS(v_tx.amount)) < 0.01
     AND sp.created_at::date BETWEEN v_tx.transaction_date - INTERVAL '3 days'
                                AND v_tx.transaction_date + INTERVAL '3 days'
     AND NOT EXISTS (SELECT 1 FROM public.bank_transactions bt
                      WHERE bt.matched_payment_id = sp.id)
   ORDER BY ABS(EXTRACT(EPOCH FROM (sp.created_at - v_tx.transaction_date)))
   LIMIT 1;

  IF v_payment_id IS NOT NULL THEN
    UPDATE public.bank_transactions
       SET matched_payment_id = v_payment_id,
           matched_at = now(),
           matched_by = auth.uid(),
           status = 'matched'
     WHERE id = p_tx_id;
  END IF;

  RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_reconcile_bank_account(p_bank_account_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tx record;
  v_matched int := 0;
  v_id uuid;
BEGIN
  FOR v_tx IN
    SELECT id FROM public.bank_transactions
     WHERE bank_account_id = p_bank_account_id
       AND matched_payment_id IS NULL
       AND COALESCE(status,'pending') <> 'ignored'
  LOOP
    v_id := public.auto_match_bank_transaction(v_tx.id);
    IF v_id IS NOT NULL THEN v_matched := v_matched + 1; END IF;
  END LOOP;
  RETURN v_matched;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_bank_reconciliation(p_reconciliation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rec record;
BEGIN
  SELECT * INTO v_rec FROM public.bank_reconciliations WHERE id = p_reconciliation_id;
  IF v_rec.id IS NULL THEN RAISE EXCEPTION 'Conciliación no encontrada'; END IF;

  IF ABS(COALESCE(v_rec.difference,0)) > 0.01 THEN
    RAISE EXCEPTION 'Conciliación con diferencia %', v_rec.difference;
  END IF;

  UPDATE public.bank_reconciliations
     SET status = 'closed', closed_at = now(), closed_by = auth.uid()
   WHERE id = p_reconciliation_id;
  RETURN true;
END;
$$;

-- ============================================================
-- TRIGGER: devoluciones de venta → evento sale_return
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_sale_return_to_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_amount numeric;
BEGIN
  v_amount := COALESCE(NEW.total, 0);
  INSERT INTO public.financial_events (
    tenant_id, event_type, source_table, source_id,
    amount, amount_in_base, currency, exchange_rate, payload
  ) VALUES (
    NEW.tenant_id, 'sale_return', 'sale_returns', NEW.id,
    v_amount, v_amount, 'CUP', 1,
    jsonb_build_object('sale_id', NEW.sale_id, 'reason', NEW.reason)
  )
  ON CONFLICT (source_table, source_id, event_type) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sale_return_event ON public.sale_returns;
CREATE TRIGGER trg_sale_return_event
  AFTER INSERT ON public.sale_returns
  FOR EACH ROW EXECUTE FUNCTION public.trg_sale_return_to_event();

-- ============================================================
-- TRIGGER: delivery delivered → commission + evento delivery_fee
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_delivery_delivered_to_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order record;
  v_pct numeric := 10;
  v_base numeric := 0;
  v_comm numeric := 0;
  v_comm_id uuid;
BEGIN
  IF NEW.status = 'delivered' AND COALESCE(OLD.status,'') <> 'delivered' THEN
    SELECT total INTO v_base FROM public.online_orders WHERE id = NEW.online_order_id;
    v_base := COALESCE(v_base, 0);
    v_comm := round(v_base * v_pct / 100.0, 2);

    INSERT INTO public.delivery_commissions (
      tenant_id, assignment_id, rider_id, online_order_id,
      base_amount, commission_pct, commission_amount
    ) VALUES (
      NEW.tenant_id, NEW.id, NEW.rider_id, NEW.online_order_id,
      v_base, v_pct, v_comm
    )
    RETURNING id INTO v_comm_id;

    INSERT INTO public.financial_events (
      tenant_id, event_type, source_table, source_id,
      amount, amount_in_base, currency, exchange_rate, payload
    ) VALUES (
      NEW.tenant_id, 'delivery_fee', 'delivery_commissions', v_comm_id,
      v_comm, v_comm, 'CUP', 1,
      jsonb_build_object('rider_id', NEW.rider_id, 'order_id', NEW.online_order_id)
    )
    ON CONFLICT (source_table, source_id, event_type) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_delivered_event ON public.delivery_assignments;
CREATE TRIGGER trg_delivery_delivered_event
  AFTER UPDATE ON public.delivery_assignments
  FOR EACH ROW EXECUTE FUNCTION public.trg_delivery_delivered_to_event();

-- ============================================================
-- TRIGGER: loyalty earn → evento loyalty_accrual
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_loyalty_to_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_value numeric := 0;
  v_setting record;
BEGIN
  IF NEW.movement_type <> 'earn' THEN RETURN NEW; END IF;

  SELECT value_per_point INTO v_setting
    FROM public.loyalty_settings WHERE tenant_id = NEW.tenant_id LIMIT 1;
  v_value := COALESCE(v_setting.value_per_point, 0.01) * NEW.points;

  IF v_value <= 0 THEN RETURN NEW; END IF;

  INSERT INTO public.financial_events (
    tenant_id, event_type, source_table, source_id,
    amount, amount_in_base, currency, exchange_rate, payload
  ) VALUES (
    NEW.tenant_id, 'loyalty_accrual', 'loyalty_movements', NEW.id,
    v_value, v_value, 'CUP', 1,
    jsonb_build_object('customer_id', NEW.customer_id, 'points', NEW.points)
  )
  ON CONFLICT (source_table, source_id, event_type) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_loyalty_event ON public.loyalty_movements;
CREATE TRIGGER trg_loyalty_event
  AFTER INSERT ON public.loyalty_movements
  FOR EACH ROW EXECUTE FUNCTION public.trg_loyalty_to_event();
