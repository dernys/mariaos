
-- Phase 5: ONAT Cuban tax module - compute declarations from general_ledger + cost sheet recompute

-- 1) RPC: compute_cu_tax_declaration
-- Aggregates income (4xxx credit) and expenses (5xxx debit) from journal_entry_lines for a period
CREATE OR REPLACE FUNCTION public.compute_cu_tax_declaration(
  p_tenant uuid,
  p_period_id uuid,
  p_declaration_type text DEFAULT 'utilidades',
  p_tax_rate numeric DEFAULT 35.0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_income numeric := 0;
  v_expenses numeric := 0;
  v_deductible numeric := 0;
  v_base numeric := 0;
  v_tax numeric := 0;
  v_period public.accounting_periods%ROWTYPE;
  v_decl_id uuid;
  v_payload jsonb;
BEGIN
  SELECT * INTO v_period FROM public.accounting_periods WHERE id = p_period_id AND tenant_id = p_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Período no encontrado para este tenant';
  END IF;

  -- Income: sum of credit - debit on income accounts (4xxx)
  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0)
    INTO v_income
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounting_accounts a ON a.id = jel.account_id
  WHERE je.tenant_id = p_tenant
    AND je.period_id = p_period_id
    AND je.status IN ('posted','approved','draft')
    AND (a.code LIKE '4%' OR a.type IN ('income','revenue','ingreso'));

  -- Expenses: sum of debit - credit on expense accounts (5xxx)
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
    INTO v_expenses
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounting_accounts a ON a.id = jel.account_id
  WHERE je.tenant_id = p_tenant
    AND je.period_id = p_period_id
    AND je.status IN ('posted','approved','draft')
    AND (a.code LIKE '5%' OR a.type IN ('expense','cost','gasto'));

  -- For ONAT utilidades, deductible = expenses excluding ONAT tax itself (5401)
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
    INTO v_deductible
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounting_accounts a ON a.id = jel.account_id
  WHERE je.tenant_id = p_tenant
    AND je.period_id = p_period_id
    AND je.status IN ('posted','approved','draft')
    AND (a.code LIKE '5%' OR a.type IN ('expense','cost','gasto'))
    AND a.code NOT LIKE '5401%';

  v_base := GREATEST(v_income - v_deductible, 0);
  v_tax := ROUND(v_base * (p_tax_rate / 100.0), 2);

  v_payload := jsonb_build_object(
    'computed_at', now(),
    'income_breakdown', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('code', a.code, 'name', a.name, 'amount', x.amount) ORDER BY a.code), '[]'::jsonb)
      FROM (
        SELECT jel.account_id, SUM(jel.credit_amount - jel.debit_amount) AS amount
        FROM public.journal_entry_lines jel
        JOIN public.journal_entries je ON je.id = jel.journal_entry_id
        JOIN public.accounting_accounts a ON a.id = jel.account_id
        WHERE je.tenant_id = p_tenant AND je.period_id = p_period_id
          AND je.status IN ('posted','approved','draft')
          AND (a.code LIKE '4%' OR a.type IN ('income','revenue','ingreso'))
        GROUP BY jel.account_id
      ) x JOIN public.accounting_accounts a ON a.id = x.account_id
    ),
    'expense_breakdown', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('code', a.code, 'name', a.name, 'amount', x.amount) ORDER BY a.code), '[]'::jsonb)
      FROM (
        SELECT jel.account_id, SUM(jel.debit_amount - jel.credit_amount) AS amount
        FROM public.journal_entry_lines jel
        JOIN public.journal_entries je ON je.id = jel.journal_entry_id
        JOIN public.accounting_accounts a ON a.id = jel.account_id
        WHERE je.tenant_id = p_tenant AND je.period_id = p_period_id
          AND je.status IN ('posted','approved','draft')
          AND (a.code LIKE '5%' OR a.type IN ('expense','cost','gasto'))
        GROUP BY jel.account_id
      ) x JOIN public.accounting_accounts a ON a.id = x.account_id
    )
  );

  -- Upsert declaration (one per tenant/period/type)
  INSERT INTO public.cu_tax_declarations (
    tenant_id, declaration_type, period_id, fiscal_year, period_label,
    total_income, total_expenses, deductible_expenses, taxable_base,
    tax_rate, tax_due, status, payload
  ) VALUES (
    p_tenant, p_declaration_type, p_period_id, EXTRACT(YEAR FROM v_period.start_date)::int,
    to_char(v_period.start_date, 'YYYY-MM'),
    v_income, v_expenses, v_deductible, v_base,
    p_tax_rate, v_tax, 'draft', v_payload
  )
  ON CONFLICT (tenant_id, period_id, declaration_type) DO UPDATE SET
    total_income = EXCLUDED.total_income,
    total_expenses = EXCLUDED.total_expenses,
    deductible_expenses = EXCLUDED.deductible_expenses,
    taxable_base = EXCLUDED.taxable_base,
    tax_rate = EXCLUDED.tax_rate,
    tax_due = EXCLUDED.tax_due,
    payload = EXCLUDED.payload,
    updated_at = now()
  RETURNING id INTO v_decl_id;

  RETURN v_decl_id;
END;
$$;

-- Unique constraint for upsert
DO $$ BEGIN
  ALTER TABLE public.cu_tax_declarations
    ADD CONSTRAINT cu_tax_declarations_tenant_period_type_uk UNIQUE (tenant_id, period_id, declaration_type);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

-- 2) RPC: submit_cu_tax_declaration -- posts journal entry for the tax due
CREATE OR REPLACE FUNCTION public.submit_cu_tax_declaration(p_declaration_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_decl public.cu_tax_declarations%ROWTYPE;
  v_acc_expense uuid;
  v_acc_payable uuid;
  v_je_id uuid;
  v_entry_no text;
BEGIN
  SELECT * INTO v_decl FROM public.cu_tax_declarations WHERE id = p_declaration_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Declaración no encontrada'; END IF;
  IF v_decl.status = 'submitted' THEN RETURN jsonb_build_object('ok', false, 'msg', 'Ya enviada'); END IF;
  IF v_decl.tax_due <= 0 THEN
    UPDATE public.cu_tax_declarations SET status='submitted', submitted_at=now() WHERE id=p_declaration_id;
    RETURN jsonb_build_object('ok', true, 'msg', 'Sin impuesto a pagar');
  END IF;

  -- Resolve accounts: 5401 expense, 2110 payable (for utilidades)
  SELECT id INTO v_acc_expense FROM public.accounting_accounts
    WHERE tenant_id=v_decl.tenant_id AND code='5401' LIMIT 1;
  SELECT id INTO v_acc_payable FROM public.accounting_accounts
    WHERE tenant_id=v_decl.tenant_id AND code='2110' LIMIT 1;

  IF v_acc_expense IS NULL OR v_acc_payable IS NULL THEN
    RAISE EXCEPTION 'Faltan cuentas contables 5401/2110';
  END IF;

  v_entry_no := 'ONAT-' || to_char(now(), 'YYYYMMDDHH24MISS');

  INSERT INTO public.journal_entries (tenant_id, date, entry_number, description, status, period_id, reference_type, reference_id)
  VALUES (v_decl.tenant_id, CURRENT_DATE, v_entry_no,
          'Declaración ONAT ' || v_decl.declaration_type || ' ' || v_decl.period_label,
          'posted', v_decl.period_id, 'cu_tax_declaration', v_decl.id)
  RETURNING id INTO v_je_id;

  INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
  VALUES
    (v_je_id, v_acc_expense, v_decl.tax_due, 0, 'Impuesto ONAT devengado'),
    (v_je_id, v_acc_payable, 0, v_decl.tax_due, 'ONAT por pagar');

  UPDATE public.cu_tax_declarations
    SET status='submitted', submitted_at=now()
    WHERE id=p_declaration_id;

  RETURN jsonb_build_object('ok', true, 'journal_entry_id', v_je_id);
END;
$$;

-- 3) RPC: recompute_cu_cost_sheet -- aggregates items and recomputes unit_cost & suggested_price
CREATE OR REPLACE FUNCTION public.recompute_cu_cost_sheet(p_cost_sheet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw numeric := 0;
  v_labor numeric := 0;
  v_indirect numeric := 0;
  v_packaging numeric := 0;
  v_other numeric := 0;
  v_unit numeric := 0;
  v_margin numeric;
  v_price numeric;
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN lower(category)='materias_primas' THEN total END),0),
    COALESCE(SUM(CASE WHEN lower(category)='mano_obra' THEN total END),0),
    COALESCE(SUM(CASE WHEN lower(category)='indirectos' THEN total END),0),
    COALESCE(SUM(CASE WHEN lower(category)='empaque' THEN total END),0),
    COALESCE(SUM(CASE WHEN lower(category) NOT IN ('materias_primas','mano_obra','indirectos','empaque') THEN total END),0)
  INTO v_raw, v_labor, v_indirect, v_packaging, v_other
  FROM public.cu_cost_sheet_items
  WHERE cost_sheet_id = p_cost_sheet_id;

  v_unit := v_raw + v_labor + v_indirect + v_packaging + v_other;

  SELECT margin_pct INTO v_margin FROM public.cu_cost_sheets WHERE id = p_cost_sheet_id;
  v_price := ROUND(v_unit * (1 + COALESCE(v_margin,0)/100.0), 2);

  UPDATE public.cu_cost_sheets SET
    raw_materials_cost = v_raw,
    labor_cost = v_labor,
    indirect_cost = v_indirect,
    packaging_cost = v_packaging,
    other_cost = v_other,
    unit_cost = v_unit,
    suggested_price = v_price,
    updated_at = now()
  WHERE id = p_cost_sheet_id;

  RETURN jsonb_build_object('unit_cost', v_unit, 'suggested_price', v_price);
END;
$$;

-- Trigger to keep cost sheet in sync when items change
CREATE OR REPLACE FUNCTION public.trg_cu_cost_sheet_items_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_cu_cost_sheet(COALESCE(NEW.cost_sheet_id, OLD.cost_sheet_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_cu_cost_sheet_items_sync ON public.cu_cost_sheet_items;
CREATE TRIGGER trg_cu_cost_sheet_items_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.cu_cost_sheet_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_cu_cost_sheet_items_sync();

GRANT EXECUTE ON FUNCTION public.compute_cu_tax_declaration(uuid, uuid, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_cu_tax_declaration(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_cu_cost_sheet(uuid) TO authenticated;
