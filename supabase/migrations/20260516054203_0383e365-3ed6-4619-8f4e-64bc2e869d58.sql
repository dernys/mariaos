
-- ============ BANK ACCOUNTS ============
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  bank_name text,
  account_number text,
  currency text NOT NULL DEFAULT 'CUP',
  current_balance numeric NOT NULL DEFAULT 0,
  accounting_account_id uuid REFERENCES public.accounting_accounts(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_bank_accounts" ON public.bank_accounts
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
CREATE TRIGGER trg_bank_accounts_tenant BEFORE INSERT ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION autofill_tenant_id();
CREATE TRIGGER trg_bank_accounts_updated BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============ BANK STATEMENTS (batches) ============
CREATE TABLE IF NOT EXISTS public.bank_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  statement_date date NOT NULL,
  opening_balance numeric NOT NULL DEFAULT 0,
  closing_balance numeric NOT NULL DEFAULT 0,
  file_name text,
  imported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_bank_statements" ON public.bank_statements
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
CREATE TRIGGER trg_bank_statements_tenant BEFORE INSERT ON public.bank_statements
  FOR EACH ROW EXECUTE FUNCTION autofill_tenant_id();

-- ============ BANK TRANSACTIONS ============
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  statement_id uuid REFERENCES public.bank_statements(id) ON DELETE SET NULL,
  transaction_date date NOT NULL,
  description text,
  reference text,
  amount numeric NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  balance_after numeric,
  matched_payment_id uuid REFERENCES public.account_payments(id) ON DELETE SET NULL,
  matched_at timestamptz,
  matched_by uuid,
  status text NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched','matched','ignored')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_bank_transactions" ON public.bank_transactions
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
CREATE INDEX IF NOT EXISTS idx_bank_tx_account ON public.bank_transactions(bank_account_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_tx_status ON public.bank_transactions(tenant_id, status);
CREATE TRIGGER trg_bank_tx_tenant BEFORE INSERT ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION autofill_tenant_id();

-- ============ RECONCILIATIONS ============
CREATE TABLE IF NOT EXISTS public.bank_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  bank_balance numeric NOT NULL DEFAULT 0,
  book_balance numeric NOT NULL DEFAULT 0,
  difference numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_at timestamptz,
  closed_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bank_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_bank_recon" ON public.bank_reconciliations
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
CREATE TRIGGER trg_bank_recon_tenant BEFORE INSERT ON public.bank_reconciliations
  FOR EACH ROW EXECUTE FUNCTION autofill_tenant_id();

-- ============ TREASURY FORECAST ============
CREATE TABLE IF NOT EXISTS public.treasury_forecast (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  category text,
  description text,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'CUP',
  reference_type text,
  reference_id uuid,
  party_type text,
  party_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','cancelled')),
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.treasury_forecast ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_treasury_forecast" ON public.treasury_forecast
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
CREATE INDEX IF NOT EXISTS idx_treasury_due ON public.treasury_forecast(tenant_id, due_date, status);
CREATE TRIGGER trg_treasury_tenant BEFORE INSERT ON public.treasury_forecast
  FOR EACH ROW EXECUTE FUNCTION autofill_tenant_id();
CREATE TRIGGER trg_treasury_updated BEFORE UPDATE ON public.treasury_forecast
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============ MATCH BANK TX TO PAYMENT ============
CREATE OR REPLACE FUNCTION public.match_bank_transaction(p_tx_id uuid, p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_tx record; v_pay record;
BEGIN
  SELECT * INTO v_tx FROM bank_transactions WHERE id = p_tx_id FOR UPDATE;
  IF v_tx IS NULL THEN RAISE EXCEPTION 'Movimiento bancario no encontrado'; END IF;
  SELECT * INTO v_pay FROM account_payments WHERE id = p_payment_id;
  IF v_pay IS NULL THEN RAISE EXCEPTION 'Pago no encontrado'; END IF;
  IF v_pay.tenant_id <> v_tx.tenant_id THEN RAISE EXCEPTION 'Tenant no coincide'; END IF;

  UPDATE bank_transactions SET
    matched_payment_id = p_payment_id,
    matched_at = now(),
    matched_by = auth.uid(),
    status = 'matched'
  WHERE id = p_tx_id;
END $$;

CREATE OR REPLACE FUNCTION public.ignore_bank_transaction(p_tx_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE bank_transactions SET status = 'ignored' WHERE id = p_tx_id;
$$;

-- ============ HELPER: get account by code ============
CREATE OR REPLACE FUNCTION public.find_account_by_codes(p_tenant uuid, p_codes text[])
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM accounting_accounts
  WHERE tenant_id = p_tenant AND code = ANY(p_codes) AND is_postable = true
  ORDER BY array_position(p_codes, code) NULLS LAST LIMIT 1;
$$;

-- ============ AUTO JOURNAL: PAYROLL ============
CREATE OR REPLACE FUNCTION public.post_payroll_journal_entry(p_payroll_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_p record;
  v_entry uuid;
  v_period uuid;
  v_acc_salary uuid;
  v_acc_deduction uuid;
  v_acc_cash uuid;
  v_number text;
  v_next bigint;
BEGIN
  SELECT * INTO v_p FROM payroll_runs WHERE id = p_payroll_id;
  IF v_p IS NULL THEN RAISE EXCEPTION 'Nómina no encontrada'; END IF;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE reference_type='payroll' AND reference_id=p_payroll_id AND status='posted') THEN
    RETURN NULL;
  END IF;

  v_acc_salary := find_account_by_codes(v_p.tenant_id, ARRAY['640','601','5105','6210']);
  v_acc_deduction := find_account_by_codes(v_p.tenant_id, ARRAY['476','216','2408','2370']);
  v_acc_cash := find_account_by_codes(v_p.tenant_id, ARRAY['570','572','101','102','1101','1102']);

  IF v_acc_salary IS NULL OR v_acc_cash IS NULL THEN
    RAISE NOTICE 'No hay plan contable suficiente, no se generó asiento de nómina';
    RETURN NULL;
  END IF;

  v_period := resolve_period(v_p.tenant_id, v_p.period_end);
  SELECT COALESCE(MAX(NULLIF(regexp_replace(entry_number,'\D','','g'),'')::bigint),0)+1
    INTO v_next FROM journal_entries WHERE tenant_id = v_p.tenant_id;
  v_number := 'NOM-' || lpad(v_next::text, 6, '0');

  INSERT INTO journal_entries (tenant_id, entry_number, date, description, status, series,
    reference_type, reference_id, period_id, created_by, posted_at, posted_by)
  VALUES (v_p.tenant_id, v_number, v_p.period_end,
    'Nómina ' || v_p.period_start || ' a ' || v_p.period_end,
    'posted', 'NOM', 'payroll', p_payroll_id, v_period, auth.uid(), now(), auth.uid())
  RETURNING id INTO v_entry;

  -- Dr Sueldos (base + bonus)
  INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
  VALUES (v_entry, v_acc_salary, v_p.base_salary + v_p.bonus, 0, 'Salario base + bonificación');

  -- Cr Deducciones si existen
  IF v_p.deductions > 0 AND v_acc_deduction IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
    VALUES (v_entry, v_acc_deduction, 0, v_p.deductions, 'Deducciones / Retenciones');
  ELSIF v_p.deductions > 0 THEN
    -- sin cuenta de deducción, las restamos del salario
    UPDATE journal_entry_lines SET debit = debit - v_p.deductions
      WHERE entry_id = v_entry AND account_id = v_acc_salary;
  END IF;

  -- Cr Caja/Banco por net_pay
  INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
  VALUES (v_entry, v_acc_cash, 0, v_p.net_pay, 'Pago neto al empleado');

  RETURN v_entry;
END $$;

CREATE OR REPLACE FUNCTION public.trg_post_payroll_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status <> 'paid') THEN
    PERFORM post_payroll_journal_entry(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_payroll_journal ON public.payroll_runs;
CREATE TRIGGER trg_payroll_journal AFTER INSERT OR UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION trg_post_payroll_journal();

-- ============ AUTO JOURNAL: SALE RETURNS ============
CREATE OR REPLACE FUNCTION public.post_sale_return_journal_entry(p_return_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_r record;
  v_entry uuid;
  v_period uuid;
  v_acc_sales uuid;
  v_acc_cash uuid;
  v_number text;
  v_next bigint;
BEGIN
  SELECT * INTO v_r FROM sale_returns WHERE id = p_return_id;
  IF v_r IS NULL THEN RAISE EXCEPTION 'Devolución no encontrada'; END IF;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE reference_type='sale_return' AND reference_id=p_return_id AND status='posted') THEN
    RETURN NULL;
  END IF;

  v_acc_sales := find_account_by_codes(v_r.tenant_id, ARRAY['708','700','4135','401','4100']);
  v_acc_cash := find_account_by_codes(v_r.tenant_id, ARRAY['570','572','101','102','1101','1102','1100','1110']);

  IF v_acc_sales IS NULL OR v_acc_cash IS NULL THEN
    RAISE NOTICE 'Plan contable insuficiente para devolución';
    RETURN NULL;
  END IF;

  v_period := resolve_period(v_r.tenant_id, CURRENT_DATE);
  SELECT COALESCE(MAX(NULLIF(regexp_replace(entry_number,'\D','','g'),'')::bigint),0)+1
    INTO v_next FROM journal_entries WHERE tenant_id = v_r.tenant_id;
  v_number := 'DEV-' || lpad(v_next::text, 6, '0');

  INSERT INTO journal_entries (tenant_id, entry_number, date, description, status, series,
    reference_type, reference_id, period_id, created_by, posted_at, posted_by)
  VALUES (v_r.tenant_id, v_number, CURRENT_DATE,
    'Devolución de venta ' || COALESCE(v_r.return_number,''),
    'posted', 'DEV', 'sale_return', p_return_id, v_period, auth.uid(), now(), auth.uid())
  RETURNING id INTO v_entry;

  -- Dr Devoluciones sobre ventas (contra-ingreso)
  INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
  VALUES (v_entry, v_acc_sales, v_r.total, 0, 'Reverso de venta');
  -- Cr Caja/Banco por reembolso
  INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
  VALUES (v_entry, v_acc_cash, 0, v_r.total, 'Reembolso ' || v_r.refund_method);

  RETURN v_entry;
END $$;

CREATE OR REPLACE FUNCTION public.trg_post_sale_return_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    PERFORM post_sale_return_journal_entry(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sale_return_journal ON public.sale_returns;
CREATE TRIGGER trg_sale_return_journal AFTER INSERT ON public.sale_returns
  FOR EACH ROW EXECUTE FUNCTION trg_post_sale_return_journal();
