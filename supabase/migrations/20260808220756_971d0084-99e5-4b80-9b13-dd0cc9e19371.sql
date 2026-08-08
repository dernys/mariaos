-- =====================================================================
-- FASE B/C — Corrección de errores bloqueantes e integridad financiera
-- =====================================================================

-- 1) BACKFILL: filas huérfanas sin tenant_id -------------------------
UPDATE public.purchases p
   SET tenant_id = s.tenant_id
  FROM public.suppliers s
 WHERE p.tenant_id IS NULL AND s.id = p.supplier_id AND s.tenant_id IS NOT NULL;

UPDATE public.journal_entries je
   SET tenant_id = sub.tenant_id
  FROM (
    SELECT l.entry_id, MIN(a.tenant_id::text)::uuid AS tenant_id
      FROM public.journal_entry_lines l
      JOIN public.accounting_accounts a ON a.id = l.account_id
     WHERE a.tenant_id IS NOT NULL
     GROUP BY l.entry_id
  ) sub
 WHERE je.tenant_id IS NULL AND sub.entry_id = je.id;

-- 2) PREVENCIÓN: compras heredan tenant del proveedor ----------------
CREATE OR REPLACE FUNCTION public.purchases_tenant_from_supplier()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL AND NEW.supplier_id IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM public.suppliers WHERE id = NEW.supplier_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS zz_purchases_tenant_from_supplier ON public.purchases;
CREATE TRIGGER zz_purchases_tenant_from_supplier
  BEFORE INSERT OR UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.purchases_tenant_from_supplier();

-- 3) PREVENCIÓN: ningún asiento sin tenant ---------------------------
CREATE OR REPLACE FUNCTION public.journal_entries_require_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'journal_entries.tenant_id no puede ser NULL (aislamiento multi-tenant)';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS zz_journal_entries_require_tenant ON public.journal_entries;
CREATE TRIGGER zz_journal_entries_require_tenant
  BEFORE INSERT OR UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.journal_entries_require_tenant();

-- 4) FIX: asiento de nómina (columnas inexistentes + plan genérico) --
CREATE OR REPLACE FUNCTION public.post_payroll_journal_entry(_payroll_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _pr public.payroll_runs;
  _entry_id uuid;
  _exp_acc uuid; _ss_acc uuid; _irpf_acc uuid; _cash_acc uuid; _pay_acc uuid;
  _debit numeric := 0; _credit numeric := 0; _diff numeric;
  _period uuid; _fy uuid; _date date;
BEGIN
  SELECT * INTO _pr FROM public.payroll_runs WHERE id = _payroll_id;
  IF _pr.id IS NULL THEN RAISE EXCEPTION 'Nómina no encontrada'; END IF;
  IF _pr.journal_entry_id IS NOT NULL THEN RETURN _pr.journal_entry_id; END IF;

  _date := COALESCE(_pr.paid_at::date, _pr.period_end, CURRENT_DATE);

  _exp_acc  := public.find_account_by_codes(_pr.tenant_id, ARRAY['5201','6401','640','5200']);
  _pay_acc  := public.find_account_by_codes(_pr.tenant_id, ARRAY['2104','4650','465','2100']);
  _ss_acc   := public.find_account_by_codes(_pr.tenant_id, ARRAY['2106','4760','476','2104']);
  _irpf_acc := public.find_account_by_codes(_pr.tenant_id, ARRAY['2107','4751','475','2104']);
  _cash_acc := public.find_account_by_codes(_pr.tenant_id, ARRAY['1101','1102','5720','572']);

  IF _exp_acc IS NULL OR _cash_acc IS NULL THEN
    RAISE NOTICE 'Plan contable incompleto para nómina (tenant %)', _pr.tenant_id;
    RETURN NULL;
  END IF;
  _pay_acc  := COALESCE(_pay_acc, _cash_acc);
  _ss_acc   := COALESCE(_ss_acc, _pay_acc);
  _irpf_acc := COALESCE(_irpf_acc, _pay_acc);

  _period := public.resolve_period_id(_pr.tenant_id, _date);
  _fy     := public.resolve_fiscal_year_id(_pr.tenant_id, _date);

  INSERT INTO public.journal_entries(
    tenant_id, date, description, reference_type, reference_id,
    status, created_by, period_id, fiscal_year_id, entry_number, series, posted_at
  ) VALUES (
    _pr.tenant_id, _date,
    'Nómina ' || COALESCE(_pr.receipt_number, substr(_pr.id::text,1,8)),
    'payroll', _pr.id, 'posted', auth.uid(), _period, _fy,
    'NOM-' || to_char(_date,'YYYYMM') || '-' || substr(_pr.id::text,1,8), 'NOM', now()
  ) RETURNING id INTO _entry_id;

  -- Debe: gasto de salario (bruto + SS empresa)
  INSERT INTO public.journal_entry_lines(entry_id, account_id, debit, credit, description)
  VALUES (_entry_id, _exp_acc, COALESCE(_pr.gross_salary, _pr.net_pay, 0), 0, 'Salario bruto');
  _debit := _debit + COALESCE(_pr.gross_salary, _pr.net_pay, 0);

  IF COALESCE(_pr.ss_company_amount,0) > 0 THEN
    INSERT INTO public.journal_entry_lines(entry_id, account_id, debit, credit, description)
    VALUES (_entry_id, _exp_acc, _pr.ss_company_amount, 0, 'Seguridad social empresa');
    _debit := _debit + _pr.ss_company_amount;
  END IF;

  -- Haber: obligaciones y pago
  IF COALESCE(_pr.ss_company_amount,0) + COALESCE(_pr.ss_worker_amount,0) > 0 THEN
    INSERT INTO public.journal_entry_lines(entry_id, account_id, debit, credit, description)
    VALUES (_entry_id, _ss_acc, 0, COALESCE(_pr.ss_company_amount,0) + COALESCE(_pr.ss_worker_amount,0), 'Seguridad social por pagar');
    _credit := _credit + COALESCE(_pr.ss_company_amount,0) + COALESCE(_pr.ss_worker_amount,0);
  END IF;

  IF COALESCE(_pr.irpf_amount,0) > 0 THEN
    INSERT INTO public.journal_entry_lines(entry_id, account_id, debit, credit, description)
    VALUES (_entry_id, _irpf_acc, 0, _pr.irpf_amount, 'Retención de impuesto');
    _credit := _credit + _pr.irpf_amount;
  END IF;

  INSERT INTO public.journal_entry_lines(entry_id, account_id, debit, credit, description)
  VALUES (_entry_id, _cash_acc, 0, COALESCE(_pr.net_pay,0), 'Pago neto a empleado');
  _credit := _credit + COALESCE(_pr.net_pay,0);

  -- Cuadre por diferencias (otras deducciones / redondeos)
  _diff := round(_debit - _credit, 2);
  IF _diff > 0 THEN
    INSERT INTO public.journal_entry_lines(entry_id, account_id, debit, credit, description)
    VALUES (_entry_id, _pay_acc, 0, _diff, 'Otras deducciones / obligaciones');
  ELSIF _diff < 0 THEN
    INSERT INTO public.journal_entry_lines(entry_id, account_id, debit, credit, description)
    VALUES (_entry_id, _exp_acc, -_diff, 0, 'Ajuste de cuadre de nómina');
  END IF;

  UPDATE public.payroll_runs SET journal_entry_id = _entry_id WHERE id = _payroll_id;
  RETURN _entry_id;
END $$;

-- 5) pay_payroll ahora contabiliza (idempotente) ---------------------
CREATE OR REPLACE FUNCTION public.pay_payroll(_payroll_id uuid, _method text DEFAULT 'transfer'::text, _notes text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _pr public.payroll_runs;
  _ap public.accounts_payable;
  _pay_id uuid;
BEGIN
  SELECT * INTO _pr FROM public.payroll_runs WHERE id = _payroll_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nómina no encontrada'; END IF;
  IF _pr.status = 'paid' THEN RAISE EXCEPTION 'Nómina ya pagada'; END IF;

  SELECT * INTO _ap FROM public.accounts_payable
    WHERE source_type='payroll' AND source_id = _payroll_id LIMIT 1;

  INSERT INTO public.account_payments(
    tenant_id, party_type, party_id, reference_type, reference_id,
    direction, method, currency, amount, amount_in_base, exchange_rate, notes, performed_by
  ) VALUES (
    _pr.tenant_id, 'employee', _pr.employee_id, 'adjustment', _payroll_id,
    'out', _method, 'CUP', _pr.net_pay, _pr.net_pay, 1,
    COALESCE(_notes, 'Pago nómina ' || _pr.period_start || '→' || _pr.period_end),
    auth.uid()
  ) RETURNING id INTO _pay_id;

  UPDATE public.payroll_runs
    SET status='paid', paid_at = now()
    WHERE id = _payroll_id;

  IF _ap.id IS NOT NULL THEN
    UPDATE public.accounts_payable
      SET amount_paid = _ap.amount, status='paid', updated_at = now()
      WHERE id = _ap.id;
  END IF;

  -- compensar el efecto del trigger account_payments en employee.balance
  UPDATE public.employees
    SET balance = balance + _pr.net_pay, updated_at = now()
    WHERE id = _pr.employee_id;

  -- contabilizar la nómina (no bloquea el pago si el plan está incompleto)
  BEGIN
    PERFORM public.post_payroll_journal_entry(_payroll_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Nómina pagada sin asiento: %', SQLERRM;
  END;

  RETURN _pay_id;
END $$;

-- 6) FINANCIAL INTEGRITY CERTIFICATION -------------------------------
CREATE OR REPLACE FUNCTION public.certify_financial_integrity(p_tenant uuid)
RETURNS TABLE(check_name text, status text, expected numeric, actual numeric, detail text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d numeric; c numeric; n int;
  a numeric; l numeric; e numeric; inc numeric; exp numeric;
BEGIN
  IF NOT (public.is_superadmin(auth.uid()) OR public.is_tenant_member(p_tenant)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- 1. Partida doble global
  SELECT COALESCE(SUM(jl.debit),0), COALESCE(SUM(jl.credit),0)
    INTO d, c
    FROM public.journal_entry_lines jl
    JOIN public.journal_entries je ON je.id = jl.entry_id
   WHERE je.tenant_id = p_tenant AND je.status = 'posted';
  RETURN QUERY SELECT 'double_entry_global',
    CASE WHEN abs(d-c) < 0.01 THEN 'pass' ELSE 'fail' END, d, c,
    'Debe vs Haber (asientos contabilizados)';

  -- 2. Partida doble por asiento
  SELECT count(*) INTO n FROM (
    SELECT je.id FROM public.journal_entries je
      JOIN public.journal_entry_lines jl ON jl.entry_id = je.id
     WHERE je.tenant_id = p_tenant AND je.status = 'posted'
     GROUP BY je.id
    HAVING abs(COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0)) >= 0.01
  ) x;
  RETURN QUERY SELECT 'double_entry_per_entry',
    CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 0::numeric, n::numeric,
    'Asientos descuadrados';

  -- 3. Ecuación patrimonial ACTIVO = PASIVO + PATRIMONIO + RESULTADO
  SELECT
    COALESCE(SUM(CASE WHEN aa.type='asset' THEN jl.debit-jl.credit END),0),
    COALESCE(SUM(CASE WHEN aa.type='liability' THEN jl.credit-jl.debit END),0),
    COALESCE(SUM(CASE WHEN aa.type='equity' THEN jl.credit-jl.debit END),0),
    COALESCE(SUM(CASE WHEN aa.type='income' THEN jl.credit-jl.debit END),0),
    COALESCE(SUM(CASE WHEN aa.type IN ('expense','cost') THEN jl.debit-jl.credit END),0)
    INTO a, l, e, inc, exp
    FROM public.journal_entry_lines jl
    JOIN public.journal_entries je ON je.id = jl.entry_id
    JOIN public.accounting_accounts aa ON aa.id = jl.account_id
   WHERE je.tenant_id = p_tenant AND je.status = 'posted';
  RETURN QUERY SELECT 'balance_equation',
    CASE WHEN abs(a - (l + e + inc - exp)) < 0.01 THEN 'pass' ELSE 'fail' END,
    a, (l + e + inc - exp), 'Activo vs Pasivo+Patrimonio+Resultado';

  RETURN QUERY SELECT 'net_income', 'info', (inc - exp), (inc - exp),
    'Ingresos - Costos/Gastos';

  -- 4. Asientos sin tenant (aislamiento)
  SELECT count(*) INTO n FROM public.journal_entries WHERE tenant_id IS NULL;
  RETURN QUERY SELECT 'journal_tenant_scope',
    CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 0::numeric, n::numeric,
    'Asientos sin empresa asignada';

  -- 5. Ventas completadas sin asiento
  SELECT count(*) INTO n FROM public.sales s
   WHERE s.tenant_id = p_tenant AND s.status = 'completed'
     AND NOT EXISTS (SELECT 1 FROM public.journal_entries je
                      WHERE je.reference_type='sale' AND je.reference_id = s.id);
  RETURN QUERY SELECT 'sales_posted',
    CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 0::numeric, n::numeric,
    'Ventas completadas sin asiento contable';

  -- 6. Compras recibidas sin asiento
  SELECT count(*) INTO n FROM public.purchases p
   WHERE p.tenant_id = p_tenant AND p.status IN ('received','partial','paid')
     AND NOT EXISTS (SELECT 1 FROM public.journal_entries je
                      WHERE je.reference_type='purchase' AND je.reference_id = p.id);
  RETURN QUERY SELECT 'purchases_posted',
    CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 0::numeric, n::numeric,
    'Compras recibidas sin asiento contable';

  -- 7. Cuadre de ventas: total = subtotal + impuesto
  SELECT count(*) INTO n FROM public.sales s
   WHERE s.tenant_id = p_tenant AND s.status = 'completed'
     AND abs(COALESCE(s.total,0) - (COALESCE(s.subtotal,0) + COALESCE(s.tax,0))) >= 0.01;
  RETURN QUERY SELECT 'sale_totals',
    CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 0::numeric, n::numeric,
    'Ventas donde total <> subtotal + impuesto';

  -- 8. Cuadre de líneas de venta vs subtotal
  SELECT count(*) INTO n FROM (
    SELECT s.id FROM public.sales s
      JOIN public.sale_items si ON si.sale_id = s.id
     WHERE s.tenant_id = p_tenant AND s.status = 'completed'
     GROUP BY s.id, s.subtotal
    HAVING abs(COALESCE(SUM(si.total),0) - COALESCE(s.subtotal,0)) >= 0.05
  ) x;
  RETURN QUERY SELECT 'sale_lines_match',
    CASE WHEN n = 0 THEN 'pass' ELSE 'warn' END, 0::numeric, n::numeric,
    'Ventas donde las líneas no suman el subtotal';

  -- 9. Cuentas por pagar coherentes
  SELECT count(*) INTO n FROM public.accounts_payable ap
   WHERE ap.tenant_id = p_tenant
     AND (COALESCE(ap.amount_paid,0) > COALESCE(ap.amount,0) + 0.01
          OR (ap.status = 'paid' AND COALESCE(ap.amount_paid,0) < COALESCE(ap.amount,0) - 0.01));
  RETURN QUERY SELECT 'accounts_payable_consistency',
    CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 0::numeric, n::numeric,
    'CxP con pagos mayores al importe o estado incoherente';

  -- 10. Cobros/pagos con moneda o tasa inválida
  SELECT count(*) INTO n FROM public.account_payments ap
   WHERE ap.tenant_id = p_tenant
     AND (ap.currency IS NULL OR COALESCE(ap.exchange_rate,0) <= 0
          OR abs(COALESCE(ap.amount_in_base,0) - COALESCE(ap.amount,0)*COALESCE(ap.exchange_rate,1)) >= 0.05);
  RETURN QUERY SELECT 'fx_consistency',
    CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 0::numeric, n::numeric,
    'Pagos con moneda/tasa inválida o base mal convertida';

  -- 11. Inventario: existencia vs movimientos
  SELECT count(*) INTO n FROM (
    SELECT p.id
      FROM public.products p
      JOIN public.inventory_movements im ON im.product_id = p.id
     WHERE p.tenant_id = p_tenant
     GROUP BY p.id, p.stock
    HAVING abs(COALESCE(MAX(im.new_stock) FILTER (WHERE im.created_at = (
              SELECT MAX(i2.created_at) FROM public.inventory_movements i2 WHERE i2.product_id = p.id)),
            p.stock) - COALESCE(p.stock,0)) >= 0.001
  ) x;
  RETURN QUERY SELECT 'inventory_continuity',
    CASE WHEN n = 0 THEN 'pass' ELSE 'warn' END, 0::numeric, n::numeric,
    'Productos cuyo último movimiento no coincide con la existencia actual';
END $$;

GRANT EXECUTE ON FUNCTION public.certify_financial_integrity(uuid) TO authenticated;
