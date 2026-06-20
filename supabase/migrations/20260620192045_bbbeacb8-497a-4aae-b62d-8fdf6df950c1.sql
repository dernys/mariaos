
-- ============================================================
-- FASE 3.A — Auto-bootstrap contable al crear un tenant
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_tenant_auto_bootstrap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Asignar perfil contable por defecto si no viene definido
  IF NEW.accounting_profile_code IS NULL THEN
    NEW.accounting_profile_code := 'CU-MIPYME';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_default_profile ON public.tenants;
CREATE TRIGGER trg_tenant_default_profile
  BEFORE INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.trg_tenant_auto_bootstrap();

CREATE OR REPLACE FUNCTION public.trg_tenant_after_insert_bootstrap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Clona plan de cuentas + año fiscal + períodos
  PERFORM public.bootstrap_tenant_accounting(NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- No bloquear creación de tenant si bootstrap falla
  RAISE WARNING 'bootstrap_tenant_accounting falló para tenant %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_bootstrap_accounting ON public.tenants;
CREATE TRIGGER trg_tenant_bootstrap_accounting
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.trg_tenant_after_insert_bootstrap();

-- ============================================================
-- FASE 3.B — Nuevas reglas contables (bank / cierre de caja)
-- ============================================================
INSERT INTO public.posting_rules
  (profile_code, event_type, sequence, description, debit_account_code, credit_account_code, amount_field, active)
VALUES
  (NULL, 'bank_deposit',      1, 'Depósito bancario',           '1102', '1101', 'amount', true),
  (NULL, 'bank_withdrawal',   1, 'Retiro bancario',             '1101', '1102', 'amount', true),
  (NULL, 'bank_charge',       1, 'Cargo bancario / comisión',   '5202', '1102', 'amount', true),
  (NULL, 'bank_interest',     1, 'Interés bancario recibido',   '1102', '4101', 'amount', true),
  (NULL, 'shift_cash_short',  1, 'Faltante de caja (turno)',    '5104', '1101', 'amount', true),
  (NULL, 'shift_cash_over',   1, 'Sobrante de caja (turno)',    '1101', '4101', 'amount', true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- FASE 3.C — Conectar inventory_movements
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_inventory_movement_to_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost numeric;
  v_amount numeric;
  v_event text;
BEGIN
  -- Solo procesar ajustes/mermas directos. Compras y ventas ya emiten su propio evento.
  IF NEW.reference_type IN ('purchase','sale','stock_transfer','recipe_consumption') THEN
    RETURN NEW;
  END IF;
  IF NEW.movement_type NOT IN ('adjust','out','loss','waste','shrinkage') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(cost, price, 0) INTO v_cost
    FROM public.products WHERE id = NEW.product_id;

  v_amount := ABS(NEW.quantity) * COALESCE(v_cost, 0);
  IF v_amount = 0 OR NEW.tenant_id IS NULL THEN RETURN NEW; END IF;

  v_event := 'inventory_adjust';

  INSERT INTO public.financial_events
    (tenant_id, event_type, source_table, source_id, event_date,
     currency, exchange_rate, amount, amount_in_base, payload, created_by)
  VALUES
    (NEW.tenant_id, v_event, 'inventory_movements', NEW.id, NEW.created_at::date,
     'CUP', 1, v_amount, v_amount,
     jsonb_build_object('product_id', NEW.product_id, 'qty', NEW.quantity,
                        'reason', NEW.reason, 'movement_type', NEW.movement_type),
     NEW.performed_by)
  ON CONFLICT (source_table, source_id, event_type) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_movement_event ON public.inventory_movements;
CREATE TRIGGER trg_inventory_movement_event
  AFTER INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.trg_inventory_movement_to_event();

-- ============================================================
-- FASE 3.D — Conectar bank_transactions
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_bank_tx_to_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event text;
BEGIN
  -- Si la tx ya está conciliada con un pago, ese pago ya emitió su asiento
  IF NEW.matched_payment_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.status = 'ignored' THEN RETURN NEW; END IF;
  IF NEW.amount IS NULL OR NEW.amount = 0 THEN RETURN NEW; END IF;

  v_event := CASE WHEN NEW.direction = 'in' THEN 'bank_deposit' ELSE 'bank_withdrawal' END;

  INSERT INTO public.financial_events
    (tenant_id, event_type, source_table, source_id, event_date,
     currency, exchange_rate, amount, amount_in_base, payload)
  VALUES
    (NEW.tenant_id, v_event, 'bank_transactions', NEW.id, NEW.transaction_date,
     'CUP', 1, ABS(NEW.amount), ABS(NEW.amount),
     jsonb_build_object('bank_account_id', NEW.bank_account_id,
                        'reference', NEW.reference, 'description', NEW.description))
  ON CONFLICT (source_table, source_id, event_type) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bank_tx_event ON public.bank_transactions;
CREATE TRIGGER trg_bank_tx_event
  AFTER INSERT ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_bank_tx_to_event();

-- ============================================================
-- FASE 3.E — Conectar delivery_commissions
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_delivery_commission_to_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.commission_amount IS NULL OR NEW.commission_amount = 0 THEN RETURN NEW; END IF;
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.financial_events
    (tenant_id, event_type, source_table, source_id, event_date,
     currency, exchange_rate, amount, amount_in_base, payload)
  VALUES
    (NEW.tenant_id, 'delivery_fee', 'delivery_commissions', NEW.id, NEW.created_at::date,
     COALESCE(NEW.currency,'CUP'), 1, NEW.commission_amount, NEW.commission_amount,
     jsonb_build_object('rider_id', NEW.rider_id, 'assignment_id', NEW.assignment_id,
                        'commission_pct', NEW.commission_pct))
  ON CONFLICT (source_table, source_id, event_type) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_commission_event ON public.delivery_commissions;
CREATE TRIGGER trg_delivery_commission_event
  AFTER INSERT ON public.delivery_commissions
  FOR EACH ROW EXECUTE FUNCTION public.trg_delivery_commission_to_event();

-- ============================================================
-- FASE 3.F — Conectar cierre de turno (cash variance)
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_shift_close_to_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_diff numeric;
  v_event text;
BEGIN
  IF NEW.status <> 'closed' OR OLD.status = 'closed' THEN RETURN NEW; END IF;
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;

  v_diff := COALESCE(NEW.cash_difference,
                     COALESCE(NEW.declared_cash,0) - COALESCE(NEW.expected_cash,0));

  IF v_diff IS NULL OR v_diff = 0 THEN RETURN NEW; END IF;

  v_event := CASE WHEN v_diff < 0 THEN 'shift_cash_short' ELSE 'shift_cash_over' END;

  INSERT INTO public.financial_events
    (tenant_id, event_type, source_table, source_id, event_date,
     currency, exchange_rate, amount, amount_in_base, payload, created_by)
  VALUES
    (NEW.tenant_id, v_event, 'sales_shifts', NEW.id,
     COALESCE(NEW.closed_at, now())::date,
     'CUP', 1, ABS(v_diff), ABS(v_diff),
     jsonb_build_object('expected_cash', NEW.expected_cash,
                        'declared_cash', NEW.declared_cash,
                        'store_id', NEW.store_id,
                        'employee_id', NEW.employee_id),
     NEW.user_id)
  ON CONFLICT (source_table, source_id, event_type) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shift_close_event ON public.sales_shifts;
CREATE TRIGGER trg_shift_close_event
  AFTER UPDATE ON public.sales_shifts
  FOR EACH ROW EXECUTE FUNCTION public.trg_shift_close_to_event();

-- ============================================================
-- FASE 3.G — Backfill: emitir eventos para registros históricos
-- ============================================================
-- inventory adjustments existentes
INSERT INTO public.financial_events
  (tenant_id, event_type, source_table, source_id, event_date,
   currency, exchange_rate, amount, amount_in_base, payload, created_by)
SELECT
  im.tenant_id, 'inventory_adjust', 'inventory_movements', im.id, im.created_at::date,
  'CUP', 1,
  ABS(im.quantity) * COALESCE(p.cost, p.price, 0),
  ABS(im.quantity) * COALESCE(p.cost, p.price, 0),
  jsonb_build_object('product_id', im.product_id, 'qty', im.quantity,
                     'reason', im.reason, 'movement_type', im.movement_type),
  im.performed_by
FROM public.inventory_movements im
JOIN public.products p ON p.id = im.product_id
WHERE im.tenant_id IS NOT NULL
  AND im.movement_type IN ('adjust','out','loss','waste','shrinkage')
  AND COALESCE(im.reference_type,'') NOT IN ('purchase','sale','stock_transfer','recipe_consumption')
  AND ABS(im.quantity) * COALESCE(p.cost, p.price, 0) > 0
ON CONFLICT (source_table, source_id, event_type) DO NOTHING;

-- bank transactions sin conciliar
INSERT INTO public.financial_events
  (tenant_id, event_type, source_table, source_id, event_date,
   currency, exchange_rate, amount, amount_in_base, payload)
SELECT
  bt.tenant_id,
  CASE WHEN bt.direction = 'in' THEN 'bank_deposit' ELSE 'bank_withdrawal' END,
  'bank_transactions', bt.id, bt.transaction_date,
  'CUP', 1, ABS(bt.amount), ABS(bt.amount),
  jsonb_build_object('bank_account_id', bt.bank_account_id,
                     'reference', bt.reference, 'description', bt.description)
FROM public.bank_transactions bt
WHERE bt.matched_payment_id IS NULL
  AND bt.status <> 'ignored'
  AND COALESCE(bt.amount,0) <> 0
ON CONFLICT (source_table, source_id, event_type) DO NOTHING;

-- delivery commissions
INSERT INTO public.financial_events
  (tenant_id, event_type, source_table, source_id, event_date,
   currency, exchange_rate, amount, amount_in_base, payload)
SELECT
  dc.tenant_id, 'delivery_fee', 'delivery_commissions', dc.id, dc.created_at::date,
  COALESCE(dc.currency,'CUP'), 1, dc.commission_amount, dc.commission_amount,
  jsonb_build_object('rider_id', dc.rider_id, 'assignment_id', dc.assignment_id,
                     'commission_pct', dc.commission_pct)
FROM public.delivery_commissions dc
WHERE dc.tenant_id IS NOT NULL AND COALESCE(dc.commission_amount,0) <> 0
ON CONFLICT (source_table, source_id, event_type) DO NOTHING;

-- cierres de turno con diferencia
INSERT INTO public.financial_events
  (tenant_id, event_type, source_table, source_id, event_date,
   currency, exchange_rate, amount, amount_in_base, payload, created_by)
SELECT
  s.tenant_id,
  CASE WHEN COALESCE(s.cash_difference,0) < 0 THEN 'shift_cash_short' ELSE 'shift_cash_over' END,
  'sales_shifts', s.id, COALESCE(s.closed_at, s.updated_at)::date,
  'CUP', 1, ABS(COALESCE(s.cash_difference,0)), ABS(COALESCE(s.cash_difference,0)),
  jsonb_build_object('expected_cash', s.expected_cash, 'declared_cash', s.declared_cash,
                     'store_id', s.store_id, 'employee_id', s.employee_id),
  s.user_id
FROM public.sales_shifts s
WHERE s.tenant_id IS NOT NULL
  AND s.status = 'closed'
  AND COALESCE(s.cash_difference,0) <> 0
ON CONFLICT (source_table, source_id, event_type) DO NOTHING;
