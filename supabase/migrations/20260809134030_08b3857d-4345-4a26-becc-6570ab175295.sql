-- =============================================================
-- FINANCIAL CORE HARDENING
-- =============================================================

-- 1. CHART OF ACCOUNTS ENRICHMENT ----------------------------------
ALTER TABLE public.accounting_accounts
  ADD COLUMN IF NOT EXISTS account_subtype text,
  ADD COLUMN IF NOT EXISTS is_control_account boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS control_role text,
  ADD COLUMN IF NOT EXISTS allows_manual_entry boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS requires_reconciliation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_category text,
  ADD COLUMN IF NOT EXISTS statement_section text,
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

UPDATE public.accounting_accounts SET statement_section = CASE type
  WHEN 'asset' THEN 'balance_sheet_assets'
  WHEN 'liability' THEN 'balance_sheet_liabilities'
  WHEN 'equity' THEN 'balance_sheet_equity'
  WHEN 'income' THEN 'income_statement_revenue'
  WHEN 'cost' THEN 'income_statement_cost_of_sales'
  WHEN 'expense' THEN 'income_statement_expenses'
  ELSE 'unclassified' END
WHERE statement_section IS NULL;

-- Cuentas globales (plantilla) quedan marcadas como sistema
UPDATE public.accounting_accounts SET is_system = true WHERE tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_acc_accounts_control ON public.accounting_accounts (tenant_id, control_role) WHERE control_role IS NOT NULL;

-- 2. ACCOUNTING MAPPING ENGINE ------------------------------------
CREATE TABLE IF NOT EXISTS public.accounting_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  mapping_key text NOT NULL,
  account_id uuid NOT NULL REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, mapping_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_mappings TO authenticated;
GRANT ALL ON public.accounting_mappings TO service_role;
ALTER TABLE public.accounting_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members view mappings" ON public.accounting_mappings
  FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()) OR tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()));

CREATE POLICY "Accounting managers insert mappings" ON public.accounting_mappings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_superadmin(auth.uid()) OR (
      tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid())
      AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contador'))
    )
  );

CREATE POLICY "Accounting managers update mappings" ON public.accounting_mappings
  FOR UPDATE TO authenticated
  USING (
    public.is_superadmin(auth.uid()) OR (
      tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid())
      AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contador'))
    )
  );

CREATE POLICY "Accounting managers delete mappings" ON public.accounting_mappings
  FOR DELETE TO authenticated
  USING (
    public.is_superadmin(auth.uid()) OR (
      tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid())
      AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contador'))
    )
  );

CREATE TRIGGER trg_acc_mappings_updated BEFORE UPDATE ON public.accounting_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Resolución de cuenta: mapeo explícito -> fallback por códigos
CREATE OR REPLACE FUNCTION public.resolve_mapped_account(p_tenant uuid, p_key text, p_codes text[] DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT m.account_id INTO v_id
  FROM public.accounting_mappings m
  JOIN public.accounting_accounts a ON a.id = m.account_id
  WHERE m.tenant_id = p_tenant AND m.mapping_key = p_key AND m.is_active
    AND a.is_active AND a.is_postable
  LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  IF p_codes IS NOT NULL THEN
    SELECT a.id INTO v_id
    FROM public.accounting_accounts a
    WHERE a.tenant_id = p_tenant AND a.is_active AND a.is_postable AND a.code = ANY(p_codes)
    ORDER BY array_position(p_codes, a.code)
    LIMIT 1;
  END IF;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.resolve_mapped_account(uuid, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_mapped_account(uuid, text, text[]) TO authenticated, service_role;

-- 3. JOURNAL HEADER / LINE DIMENSIONS -----------------------------
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS exchange_rate numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source_module text,
  ADD COLUMN IF NOT EXISTS correlation_id text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.journal_entry_lines
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS exchange_rate numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS store_id uuid,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid;

CREATE INDEX IF NOT EXISTS idx_jel_entity ON public.journal_entry_lines (entity_type, entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_je_correlation ON public.journal_entries (correlation_id) WHERE correlation_id IS NOT NULL;

-- 4. INMUTABILIDAD DE ASIENTOS CONTABILIZADOS ---------------------
CREATE OR REPLACE FUNCTION public.guard_posted_journal_entry()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'posted' THEN
      RAISE EXCEPTION 'Un asiento contabilizado no puede eliminarse (use reverse_journal_entry)';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'posted' THEN
    IF NEW.date <> OLD.date
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.entry_number IS DISTINCT FROM OLD.entry_number
       OR NEW.series IS DISTINCT FROM OLD.series THEN
      RAISE EXCEPTION 'Un asiento contabilizado es inmutable en fecha, empresa, número y serie';
    END IF;
    IF NEW.status NOT IN ('posted','reversed','cancelled','void') THEN
      RAISE EXCEPTION 'Transición de estado no permitida desde posted a %', NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS zz_guard_posted_journal_entry ON public.journal_entries;
CREATE TRIGGER zz_guard_posted_journal_entry
  BEFORE UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_posted_journal_entry();

CREATE OR REPLACE FUNCTION public.guard_posted_journal_line()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_status text; v_entry uuid;
BEGIN
  v_entry := COALESCE(OLD.entry_id, NEW.entry_id);
  SELECT status INTO v_status FROM public.journal_entries WHERE id = v_entry;
  IF v_status = 'posted' AND TG_OP IN ('UPDATE','DELETE') THEN
    RAISE EXCEPTION 'Las líneas de un asiento contabilizado no pueden modificarse ni eliminarse (use un reverso)';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS zz_guard_posted_journal_line ON public.journal_entry_lines;
CREATE TRIGGER zz_guard_posted_journal_line
  BEFORE UPDATE OR DELETE ON public.journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_posted_journal_line();

-- 5. CUADRE DIFERIDO AL COMMIT ------------------------------------
CREATE OR REPLACE FUNCTION public.assert_journal_entry_balanced()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_entry uuid; v_status text; v_d numeric; v_c numeric;
BEGIN
  v_entry := CASE WHEN TG_TABLE_NAME = 'journal_entries'
                  THEN COALESCE(NEW.id, OLD.id)
                  ELSE COALESCE(NEW.entry_id, OLD.entry_id) END;
  SELECT status INTO v_status FROM public.journal_entries WHERE id = v_entry;
  IF v_status IS NULL OR v_status <> 'posted' THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO v_d, v_c
  FROM public.journal_entry_lines WHERE entry_id = v_entry;

  IF round(v_d,2) <> round(v_c,2) THEN
    RAISE EXCEPTION 'Partida doble violada en el asiento %: debe % <> haber %', v_entry, v_d, v_c;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS zz_assert_balanced_lines ON public.journal_entry_lines;
CREATE CONSTRAINT TRIGGER zz_assert_balanced_lines
  AFTER INSERT OR UPDATE OR DELETE ON public.journal_entry_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_journal_entry_balanced();

DROP TRIGGER IF EXISTS zz_assert_balanced_entry ON public.journal_entries;
CREATE CONSTRAINT TRIGGER zz_assert_balanced_entry
  AFTER INSERT OR UPDATE ON public.journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_journal_entry_balanced();

-- 6. BLOQUEO DE PERÍODOS CERRADOS ---------------------------------
CREATE OR REPLACE FUNCTION public.guard_closed_period()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
  SELECT status INTO v_status FROM public.accounting_periods
   WHERE tenant_id = NEW.tenant_id AND NEW.date BETWEEN start_date AND end_date
   ORDER BY start_date DESC LIMIT 1;
  IF v_status IN ('closed','locked') THEN
    RAISE EXCEPTION 'El período contable de la fecha % está %; registre un ajuste en un período abierto', NEW.date, v_status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS zz_guard_closed_period ON public.journal_entries;
CREATE TRIGGER zz_guard_closed_period
  BEFORE INSERT ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_closed_period();

-- 7. FINANCIAL HEALTH CHECK ---------------------------------------
CREATE OR REPLACE FUNCTION public.financial_health_check(p_tenant uuid)
RETURNS TABLE(area text, check_name text, status text, metric numeric, detail text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v numeric; v2 numeric; v3 numeric;
BEGIN
  IF NOT (public.is_superadmin(auth.uid()) OR public.is_tenant_member(p_tenant)) THEN
    RAISE EXCEPTION 'Acceso denegado a la empresa indicada';
  END IF;

  -- Chart of accounts
  SELECT count(*) INTO v FROM public.accounting_accounts WHERE tenant_id = p_tenant AND is_active;
  RETURN QUERY SELECT 'chart_of_accounts','accounts_active',
    CASE WHEN v = 0 THEN 'CRITICAL' WHEN v < 20 THEN 'WARNING' ELSE 'PASS' END, v,
    v || ' cuentas activas en el plan de la empresa';

  SELECT count(*) INTO v FROM public.accounting_accounts a
   WHERE a.tenant_id = p_tenant AND a.parent_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.accounting_accounts p WHERE p.id = a.parent_id);
  RETURN QUERY SELECT 'chart_of_accounts','hierarchy_orphans',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'CRITICAL' END, v, v || ' cuentas con padre inexistente';

  SELECT count(*) INTO v FROM (
    SELECT code FROM public.accounting_accounts WHERE tenant_id = p_tenant GROUP BY code HAVING count(*) > 1) z;
  RETURN QUERY SELECT 'chart_of_accounts','duplicate_codes',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'CRITICAL' END, v, v || ' códigos de cuenta duplicados';

  SELECT count(*) INTO v FROM public.journal_entry_lines l
    JOIN public.journal_entries e ON e.id = l.entry_id
    JOIN public.accounting_accounts a ON a.id = l.account_id
   WHERE e.tenant_id = p_tenant AND (a.is_postable = false OR a.is_active = false);
  RETURN QUERY SELECT 'chart_of_accounts','postings_on_invalid_accounts',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'CRITICAL' END, v, v || ' líneas sobre cuentas no imputables o inactivas';

  -- Double entry
  SELECT count(*) INTO v FROM (
    SELECT l.entry_id FROM public.journal_entry_lines l
      JOIN public.journal_entries e ON e.id = l.entry_id
     WHERE e.tenant_id = p_tenant AND e.status = 'posted'
     GROUP BY l.entry_id HAVING round(sum(l.debit),2) <> round(sum(l.credit),2)) z;
  RETURN QUERY SELECT 'accounting','double_entry',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'CRITICAL' END, v, v || ' asientos posteados descuadrados';

  SELECT count(*) INTO v FROM public.journal_entry_lines l
   WHERE NOT EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id = l.entry_id);
  RETURN QUERY SELECT 'accounting','orphan_lines',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'CRITICAL' END, v, v || ' líneas sin asiento';

  -- Balance equation
  SELECT COALESCE(SUM(CASE a.type WHEN 'asset' THEN l.debit - l.credit ELSE 0 END),0),
         COALESCE(SUM(CASE a.type WHEN 'liability' THEN l.credit - l.debit WHEN 'equity' THEN l.credit - l.debit ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN a.type = 'income' THEN l.credit - l.debit WHEN a.type IN ('expense','cost') THEN l.debit - l.credit ELSE 0 END),0)
    INTO v, v2, v3
  FROM public.journal_entry_lines l
  JOIN public.journal_entries e ON e.id = l.entry_id
  JOIN public.accounting_accounts a ON a.id = l.account_id
  WHERE e.tenant_id = p_tenant AND e.status = 'posted';
  RETURN QUERY SELECT 'accounting','balance_equation',
    CASE WHEN abs(v - (v2 + v3)) < 0.02 THEN 'PASS' ELSE 'CRITICAL' END, round(v - (v2 + v3), 2),
    'Activo ' || round(v,2) || ' = Pasivo+Patrimonio ' || round(v2,2) || ' + Resultado ' || round(v3,2);

  -- Ledger projection
  SELECT count(*) INTO v FROM public.general_ledger WHERE tenant_id = p_tenant;
  RETURN QUERY SELECT 'ledger','projection_rows',
    CASE WHEN v = 0 THEN 'WARNING' ELSE 'PASS' END, v,
    CASE WHEN v = 0 THEN 'Mayor sin proyección: ejecute la reconstrucción' ELSE v || ' filas de mayor por período' END;

  -- Module -> accounting coverage
  SELECT count(*) INTO v FROM public.sales s
   WHERE s.tenant_id = p_tenant AND s.status = 'completed'
     AND NOT EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.reference_type = 'sale' AND j.reference_id = s.id);
  RETURN QUERY SELECT 'sales','sales_posted',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'CRITICAL' END, v, v || ' ventas completadas sin asiento';

  SELECT count(*) INTO v FROM public.purchases p
   WHERE p.tenant_id = p_tenant AND p.status IN ('received','partial','paid')
     AND NOT EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.reference_type = 'purchase' AND j.reference_id = p.id);
  RETURN QUERY SELECT 'purchases','purchases_posted',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'CRITICAL' END, v, v || ' compras recibidas sin asiento';

  SELECT count(*) INTO v FROM public.payroll_runs r
   WHERE r.tenant_id = p_tenant AND r.status = 'paid' AND r.journal_entry_id IS NULL;
  RETURN QUERY SELECT 'payroll','payroll_posted',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'CRITICAL' END, v, v || ' nóminas pagadas sin asiento';

  -- Accounts payable / receivable consistency
  SELECT count(*) INTO v FROM public.accounts_payable ap
   WHERE ap.tenant_id = p_tenant AND (COALESCE(ap.amount_paid,0) > COALESCE(ap.amount,0) + 0.01);
  RETURN QUERY SELECT 'accounts_payable','overpaid_bills',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'CRITICAL' END, v, v || ' cuentas por pagar con pagos superiores al importe';

  SELECT count(*) INTO v FROM public.customers c WHERE c.tenant_id = p_tenant AND COALESCE(c.balance,0) < -0.01;
  RETURN QUERY SELECT 'accounts_receivable','negative_customer_balance',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'WARNING' END, v, v || ' clientes con saldo negativo (crédito a favor)';

  -- Inventory
  SELECT count(*) INTO v FROM public.product_stock ps
   WHERE ps.tenant_id = p_tenant AND COALESCE(ps.quantity,0) < 0;
  RETURN QUERY SELECT 'inventory','negative_stock',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'WARNING' END, v, v || ' existencias negativas';

  -- Taxes / fiscal profile
  SELECT count(*) INTO v FROM public.fiscal_rules WHERE tenant_id = p_tenant AND is_active;
  RETURN QUERY SELECT 'tax','fiscal_rules_configured',
    CASE WHEN v = 0 THEN 'WARNING' ELSE 'PASS' END, v,
    CASE WHEN v = 0 THEN 'Sin reglas fiscales activas: la empresa no tiene perfil fiscal configurado' ELSE v || ' reglas fiscales activas' END;

  -- Multicurrency
  SELECT count(*) INTO v FROM public.sales s
   WHERE s.tenant_id = p_tenant AND (s.currency IS NULL OR COALESCE(s.exchange_rate,0) <= 0);
  RETURN QUERY SELECT 'multicurrency','sales_fx_defined',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'CRITICAL' END, v, v || ' ventas sin moneda o tipo de cambio válido';

  -- Multi-tenant isolation
  SELECT count(*) INTO v FROM public.journal_entries WHERE tenant_id IS NULL;
  RETURN QUERY SELECT 'security','entries_without_tenant',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'CRITICAL' END, v, v || ' asientos sin empresa (global)';

  SELECT count(*) INTO v FROM public.journal_entry_lines l
    JOIN public.journal_entries e ON e.id = l.entry_id
    JOIN public.accounting_accounts a ON a.id = l.account_id
   WHERE e.tenant_id = p_tenant AND a.tenant_id IS NOT NULL AND a.tenant_id <> e.tenant_id;
  RETURN QUERY SELECT 'security','cross_tenant_lines',
    CASE WHEN v = 0 THEN 'PASS' ELSE 'CRITICAL' END, v, v || ' líneas que usan cuentas de otra empresa';

  -- Accounting mapping coverage
  SELECT count(*) INTO v FROM public.accounting_mappings WHERE tenant_id = p_tenant AND is_active;
  RETURN QUERY SELECT 'mapping','mappings_defined',
    CASE WHEN v = 0 THEN 'WARNING' ELSE 'PASS' END, v,
    CASE WHEN v = 0 THEN 'Sin mapeos explícitos: se usan códigos de cuenta por convención' ELSE v || ' mapeos contables definidos' END;
END $$;

REVOKE ALL ON FUNCTION public.financial_health_check(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.financial_health_check(uuid) TO authenticated, service_role;