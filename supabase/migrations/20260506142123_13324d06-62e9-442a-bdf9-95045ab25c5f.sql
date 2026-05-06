
-- 1. Saldo en empleados (deudas/adelantos)
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS balance numeric NOT NULL DEFAULT 0;

-- 2. Tabla account_payments (abonos a cuentas por cobrar/pagar)
CREATE TABLE IF NOT EXISTS public.account_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  party_type text NOT NULL CHECK (party_type IN ('customer','employee','supplier')),
  party_id uuid NOT NULL,
  reference_type text CHECK (reference_type IN ('sale','purchase','adjustment')),
  reference_id uuid,
  direction text NOT NULL CHECK (direction IN ('in','out')), -- in=cobramos, out=pagamos
  method text NOT NULL DEFAULT 'cash',
  currency text NOT NULL DEFAULT 'CUP',
  amount numeric NOT NULL CHECK (amount > 0),
  amount_in_base numeric NOT NULL,
  exchange_rate numeric NOT NULL DEFAULT 1,
  notes text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_payments_party ON public.account_payments(tenant_id, party_type, party_id);
CREATE INDEX IF NOT EXISTS idx_account_payments_ref ON public.account_payments(reference_type, reference_id);

ALTER TABLE public.account_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant view account_payments" ON public.account_payments FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant insert account_payments" ON public.account_payments FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Superadmin all account_payments" ON public.account_payments FOR ALL TO authenticated
  USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));

-- 3. Trigger: actualiza balance al registrar un abono
CREATE OR REPLACE FUNCTION public.apply_account_payment_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  -- in (cobro): reduce deuda del cliente/empleado (balance positivo = nos deben)
  -- out (pago): reduce deuda al proveedor (balance positivo = les debemos)
  IF NEW.party_type = 'customer' THEN
    UPDATE customers SET balance = balance - NEW.amount_in_base, updated_at = now()
      WHERE id = NEW.party_id;
  ELSIF NEW.party_type = 'employee' THEN
    UPDATE employees SET balance = balance - NEW.amount_in_base, updated_at = now()
      WHERE id = NEW.party_id;
  ELSIF NEW.party_type = 'supplier' THEN
    UPDATE suppliers SET balance = balance - NEW.amount_in_base, updated_at = now()
      WHERE id = NEW.party_id;
  END IF;

  -- Si está atado a venta o compra, suma a amount_paid y actualiza status
  IF NEW.reference_type = 'sale' AND NEW.reference_id IS NOT NULL THEN
    UPDATE sales SET amount_paid = amount_paid + NEW.amount_in_base,
      status = CASE WHEN amount_paid + NEW.amount_in_base >= total - 0.01 THEN 'paid' ELSE 'partial' END,
      updated_at = now()
    WHERE id = NEW.reference_id;
  ELSIF NEW.reference_type = 'purchase' AND NEW.reference_id IS NOT NULL THEN
    UPDATE purchases SET amount_paid = amount_paid + NEW.amount_in_base,
      status = CASE WHEN amount_paid + NEW.amount_in_base >= total - 0.01 THEN 'paid' ELSE COALESCE(status, 'partial') END,
      updated_at = now()
    WHERE id = NEW.reference_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_apply_account_payment_balance ON public.account_payments;
CREATE TRIGGER trg_apply_account_payment_balance
  AFTER INSERT ON public.account_payments
  FOR EACH ROW EXECUTE FUNCTION public.apply_account_payment_balance();

-- 4. RPC: registrar abono de forma controlada
CREATE OR REPLACE FUNCTION public.register_account_payment(
  p_party_type text,
  p_party_id uuid,
  p_amount numeric,
  p_method text DEFAULT 'cash',
  p_currency text DEFAULT 'CUP',
  p_exchange_rate numeric DEFAULT 1,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_tenant uuid;
  v_dir text;
  v_id uuid;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Monto debe ser mayor a 0'; END IF;

  -- Resolver tenant a partir del party
  IF p_party_type = 'customer' THEN
    SELECT tenant_id INTO v_tenant FROM customers WHERE id = p_party_id;
    v_dir := 'in';
  ELSIF p_party_type = 'employee' THEN
    SELECT tenant_id INTO v_tenant FROM employees WHERE id = p_party_id;
    v_dir := 'in';
  ELSIF p_party_type = 'supplier' THEN
    SELECT tenant_id INTO v_tenant FROM suppliers WHERE id = p_party_id;
    v_dir := 'out';
  ELSE
    RAISE EXCEPTION 'party_type inválido';
  END IF;

  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Entidad no encontrada'; END IF;

  INSERT INTO account_payments (
    tenant_id, party_type, party_id, reference_type, reference_id,
    direction, method, currency, amount, amount_in_base, exchange_rate, notes, performed_by
  ) VALUES (
    v_tenant, p_party_type, p_party_id, p_reference_type, p_reference_id,
    v_dir, p_method, p_currency, p_amount, p_amount * COALESCE(p_exchange_rate,1),
    COALESCE(p_exchange_rate,1), p_notes, auth.uid()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END; $$;

-- 5. Cuando una venta se crea como parcial → suma deuda al cliente o empleado
CREATE OR REPLACE FUNCTION public.apply_sale_credit_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_pending numeric;
BEGIN
  v_pending := COALESCE(NEW.total,0) - COALESCE(NEW.amount_paid,0);
  IF v_pending > 0.01 AND NEW.status IN ('partial','pending') THEN
    IF NEW.customer_id IS NOT NULL THEN
      UPDATE customers SET balance = balance + v_pending, updated_at = now()
        WHERE id = NEW.customer_id;
    ELSIF NEW.employee_id IS NOT NULL THEN
      UPDATE employees SET balance = balance + v_pending, updated_at = now()
        WHERE id = NEW.employee_id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_apply_sale_credit_balance ON public.sales;
CREATE TRIGGER trg_apply_sale_credit_balance
  AFTER INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.apply_sale_credit_balance();

-- 6. Cuando una compra se crea con saldo pendiente → suma deuda al proveedor
CREATE OR REPLACE FUNCTION public.apply_purchase_credit_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_pending numeric;
BEGIN
  v_pending := COALESCE(NEW.total,0) - COALESCE(NEW.amount_paid,0);
  IF v_pending > 0.01 AND NEW.supplier_id IS NOT NULL THEN
    UPDATE suppliers SET balance = balance + v_pending, updated_at = now()
      WHERE id = NEW.supplier_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_apply_purchase_credit_balance ON public.purchases;
CREATE TRIGGER trg_apply_purchase_credit_balance
  AFTER INSERT ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.apply_purchase_credit_balance();
