
-- =====================================================================
-- BLOCK B: Accounting synchronization (COGS + payment posting + roles)
-- =====================================================================

-- 1) Semantic account resolver across plan templates
CREATE OR REPLACE FUNCTION public.resolve_account_by_role(p_tenant uuid, p_role text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template text;
  v_id uuid;
  v_patterns text[];
  v_pat text;
BEGIN
  SELECT plan_template INTO v_template FROM public.accounting_accounts
    WHERE tenant_id = p_tenant AND plan_template IS NOT NULL
    ORDER BY created_at LIMIT 1;

  v_patterns := CASE p_role
    WHEN 'cash' THEN
      CASE v_template
        WHEN 'cu_onat'      THEN ARRAY['101','10']
        WHEN 'es_pgc'       THEN ARRAY['570']
        WHEN 'mx_sat'       THEN ARRAY['101']
        WHEN 'niif_generic' THEN ARRAY['1101']
        ELSE ARRAY['1100','101','570']
      END
    WHEN 'bank' THEN
      CASE v_template
        WHEN 'cu_onat'      THEN ARRAY['110','11']
        WHEN 'es_pgc'       THEN ARRAY['572']
        WHEN 'mx_sat'       THEN ARRAY['102']
        WHEN 'niif_generic' THEN ARRAY['1102']
        ELSE ARRAY['1110','110','572']
      END
    WHEN 'receivables' THEN
      CASE v_template
        WHEN 'cu_onat'      THEN ARRAY['120']
        WHEN 'es_pgc'       THEN ARRAY['430']
        WHEN 'mx_sat'       THEN ARRAY['105']
        WHEN 'niif_generic' THEN ARRAY['1305']
        ELSE ARRAY['1200','120','430']
      END
    WHEN 'payables' THEN
      CASE v_template
        WHEN 'cu_onat'      THEN ARRAY['200']
        WHEN 'es_pgc'       THEN ARRAY['400']
        WHEN 'mx_sat'       THEN ARRAY['201']
        WHEN 'niif_generic' THEN ARRAY['2205']
        ELSE ARRAY['2100','200','400']
      END
    WHEN 'sales' THEN
      CASE v_template
        WHEN 'cu_onat'      THEN ARRAY['400','40']
        WHEN 'es_pgc'       THEN ARRAY['700']
        WHEN 'mx_sat'       THEN ARRAY['401']
        WHEN 'niif_generic' THEN ARRAY['4135']
        ELSE ARRAY['4100','400','700']
      END
    WHEN 'tax_output' THEN
      CASE v_template
        WHEN 'cu_onat'      THEN ARRAY['210']
        WHEN 'es_pgc'       THEN ARRAY['477']
        WHEN 'mx_sat'       THEN ARRAY['208']
        WHEN 'niif_generic' THEN ARRAY['2408']
        ELSE ARRAY['2200','210','477']
      END
    WHEN 'tax_input' THEN
      CASE v_template
        WHEN 'cu_onat'      THEN ARRAY['210']
        WHEN 'es_pgc'       THEN ARRAY['472']
        WHEN 'mx_sat'       THEN ARRAY['118']
        WHEN 'niif_generic' THEN ARRAY['2408']
        ELSE ARRAY['2200','472','118']
      END
    WHEN 'inventory' THEN
      CASE v_template
        WHEN 'cu_onat'      THEN ARRAY['130','13']
        WHEN 'es_pgc'       THEN ARRAY['300']
        WHEN 'mx_sat'       THEN ARRAY['115']
        WHEN 'niif_generic' THEN ARRAY['1435']
        ELSE ARRAY['1300','130','300']
      END
    WHEN 'cogs' THEN
      CASE v_template
        WHEN 'cu_onat'      THEN ARRAY['50']
        WHEN 'es_pgc'       THEN ARRAY['600']
        WHEN 'mx_sat'       THEN ARRAY['501']
        WHEN 'niif_generic' THEN ARRAY['6135']
        ELSE ARRAY['5100','50','600']
      END
    ELSE ARRAY[]::text[]
  END;

  FOREACH v_pat IN ARRAY v_patterns LOOP
    SELECT id INTO v_id FROM public.accounting_accounts
      WHERE tenant_id = p_tenant
        AND is_postable = true
        AND code LIKE v_pat || '%'
      ORDER BY length(code) DESC, code
      LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

-- 2) Sales journal entry: roles + COGS
CREATE OR REPLACE FUNCTION public.post_sale_journal_entry(p_sale_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
  v_entry_id uuid;
  v_cash_total numeric := 0;
  v_card_total numeric := 0;
  v_pending numeric := 0;
  v_cogs_total numeric := 0;
  v_acc_caja uuid; v_acc_banco uuid; v_acc_cxc uuid;
  v_acc_ventas uuid; v_acc_iva uuid;
  v_acc_cogs uuid; v_acc_inv uuid;
  v_cc uuid;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF v_sale IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE reference_type='sale' AND reference_id=p_sale_id) THEN
    RETURN NULL;
  END IF;

  PERFORM ensure_default_accounts(v_sale.tenant_id);
  v_acc_caja   := resolve_account_by_role(v_sale.tenant_id, 'cash');
  v_acc_banco  := resolve_account_by_role(v_sale.tenant_id, 'bank');
  v_acc_cxc    := resolve_account_by_role(v_sale.tenant_id, 'receivables');
  v_acc_ventas := resolve_account_by_role(v_sale.tenant_id, 'sales');
  v_acc_iva    := resolve_account_by_role(v_sale.tenant_id, 'tax_output');
  v_acc_cogs   := resolve_account_by_role(v_sale.tenant_id, 'cogs');
  v_acc_inv    := resolve_account_by_role(v_sale.tenant_id, 'inventory');
  v_cc         := v_sale.cost_center_id;

  SELECT COALESCE(SUM(amount_in_base) FILTER (WHERE method='cash'),0),
         COALESCE(SUM(amount_in_base) FILTER (WHERE method IN ('card','qr','transfer')),0)
    INTO v_cash_total, v_card_total
    FROM sale_payments WHERE sale_id = p_sale_id;

  v_pending := GREATEST(0, COALESCE(v_sale.total,0) - COALESCE(v_sale.amount_paid,0));

  -- COGS total from sale_items joined with products.cost
  SELECT COALESCE(SUM(si.qty * COALESCE(p.cost,0)), 0) INTO v_cogs_total
    FROM sale_items si
    LEFT JOIN products p ON p.id = si.product_id
    WHERE si.sale_id = p_sale_id;

  INSERT INTO journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, status, created_by)
  VALUES (v_sale.tenant_id, 'V-'||substr(p_sale_id::text,1,8), CURRENT_DATE,
          'Venta '||COALESCE(v_sale.ticket_number, p_sale_id::text), 'sale', p_sale_id, 'posted', auth.uid())
  RETURNING id INTO v_entry_id;

  -- Debits (revenue side)
  IF v_cash_total > 0 AND v_acc_caja IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_caja, v_cash_total, 0, 'Cobro efectivo', v_cc);
  END IF;
  IF v_card_total > 0 AND v_acc_banco IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_banco, v_card_total, 0, 'Cobro tarjeta/transferencia', v_cc);
  END IF;
  IF v_pending > 0 AND v_acc_cxc IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_cxc, v_pending, 0, 'Saldo a cobrar', v_cc);
  END IF;

  -- Credits (revenue side)
  IF v_acc_ventas IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_ventas, 0, COALESCE(v_sale.subtotal,0), 'Ingreso por venta', v_cc);
  END IF;
  IF COALESCE(v_sale.tax,0) > 0 AND v_acc_iva IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_iva, 0, v_sale.tax, 'Impuestos cobrados', v_cc);
  END IF;

  -- COGS leg: Dr. Cost of sales / Cr. Inventory
  IF v_cogs_total > 0 AND v_acc_cogs IS NOT NULL AND v_acc_inv IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_cogs, v_cogs_total, 0, 'Costo de ventas', v_cc);
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_inv, 0, v_cogs_total, 'Salida de inventario', v_cc);
  END IF;

  RETURN v_entry_id;
END; $$;

-- 3) Purchases: use roles + cost center
CREATE OR REPLACE FUNCTION public.post_purchase_journal_entry(p_purchase_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p record; v_entry_id uuid;
  v_acc_inv uuid; v_acc_iva uuid; v_acc_cxp uuid; v_acc_caja uuid;
  v_paid numeric; v_pending numeric;
  v_cc uuid;
BEGIN
  SELECT * INTO v_p FROM purchases WHERE id = p_purchase_id;
  IF v_p IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE reference_type='purchase' AND reference_id=p_purchase_id) THEN
    RETURN NULL;
  END IF;

  PERFORM ensure_default_accounts(v_p.tenant_id);
  v_acc_inv  := resolve_account_by_role(v_p.tenant_id, 'inventory');
  v_acc_iva  := resolve_account_by_role(v_p.tenant_id, 'tax_input');
  v_acc_cxp  := resolve_account_by_role(v_p.tenant_id, 'payables');
  v_acc_caja := resolve_account_by_role(v_p.tenant_id, 'cash');
  v_cc       := v_p.cost_center_id;

  v_paid := COALESCE(v_p.amount_paid,0);
  v_pending := GREATEST(0, COALESCE(v_p.total,0) - v_paid);

  INSERT INTO journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, status, created_by)
  VALUES (v_p.tenant_id, 'C-'||substr(p_purchase_id::text,1,8), CURRENT_DATE,
          'Compra '||COALESCE(v_p.purchase_number, p_purchase_id::text), 'purchase', p_purchase_id, 'posted', auth.uid())
  RETURNING id INTO v_entry_id;

  IF v_acc_inv IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_inv, COALESCE(v_p.subtotal,0), 0, 'Entrada inventario', v_cc);
  END IF;
  IF COALESCE(v_p.tax,0) > 0 AND v_acc_iva IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_iva, v_p.tax, 0, 'IVA acreditable', v_cc);
  END IF;
  IF v_paid > 0 AND v_acc_caja IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_caja, 0, v_paid, 'Pago al recibir', v_cc);
  END IF;
  IF v_pending > 0 AND v_acc_cxp IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_cxp, 0, v_pending, 'Saldo por pagar', v_cc);
  END IF;

  RETURN v_entry_id;
END; $$;

-- 4) Payment journal entry (idempotent per payment)
CREATE OR REPLACE FUNCTION public.post_payment_journal_entry(p_payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay record;
  v_entry_id uuid;
  v_cash_acc uuid;
  v_party_acc uuid;
  v_amount numeric;
BEGIN
  SELECT * INTO v_pay FROM account_payments WHERE id = p_payment_id;
  IF v_pay IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE reference_type='payment' AND reference_id=p_payment_id) THEN
    RETURN NULL;
  END IF;

  -- Skip payments that belong to a sale/purchase already posted with their cobro embebido
  -- (sale entry includes cash and CxC, so a separate payment posting would double-count
  -- unless the payment settles previously pending CxC/CxP).
  -- Strategy: only post if the payment has NO reference (general movement) or its reference_type
  -- is 'invoice' (CxC settlement) — sale/purchase original receipts are already in their entries.
  IF v_pay.reference_type IN ('sale','purchase') THEN
    -- The sale/purchase entry already booked the initial cash leg.
    -- Subsequent partial collections against pending balance: post Dr.Caja / Cr.CxC.
    -- Detect: only post if a sale/purchase entry exists AND this payment is later than that entry.
    IF NOT EXISTS (
      SELECT 1 FROM journal_entries
      WHERE reference_type = v_pay.reference_type
        AND reference_id = v_pay.reference_id
        AND created_at < v_pay.created_at - interval '5 seconds'
    ) THEN
      RETURN NULL;
    END IF;
  END IF;

  PERFORM ensure_default_accounts(v_pay.tenant_id);
  v_amount := COALESCE(v_pay.amount_in_base, v_pay.amount);

  -- Cash/bank by method
  IF v_pay.method IN ('cash') THEN
    v_cash_acc := resolve_account_by_role(v_pay.tenant_id, 'cash');
  ELSE
    v_cash_acc := resolve_account_by_role(v_pay.tenant_id, 'bank');
  END IF;

  -- Counterparty account
  IF v_pay.party_type = 'supplier' THEN
    v_party_acc := resolve_account_by_role(v_pay.tenant_id, 'payables');
  ELSE
    v_party_acc := resolve_account_by_role(v_pay.tenant_id, 'receivables');
  END IF;

  IF v_cash_acc IS NULL OR v_party_acc IS NULL THEN RETURN NULL; END IF;

  INSERT INTO journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, status, created_by)
  VALUES (v_pay.tenant_id, 'P-'||substr(p_payment_id::text,1,8), CURRENT_DATE,
          CASE WHEN v_pay.direction = 'in' THEN 'Cobro ' ELSE 'Pago ' END ||
          v_pay.party_type || ' ' || COALESCE(v_pay.method,''),
          'payment', p_payment_id, 'posted', auth.uid())
  RETURNING id INTO v_entry_id;

  IF v_pay.direction = 'in' THEN
    -- Dr. Caja/Banco / Cr. CxC
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
    VALUES (v_entry_id, v_cash_acc, v_amount, 0, 'Cobro ' || v_pay.method);
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
    VALUES (v_entry_id, v_party_acc, 0, v_amount, 'Liquidación CxC');
  ELSE
    -- Dr. CxP / Cr. Caja/Banco
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
    VALUES (v_entry_id, v_party_acc, v_amount, 0, 'Liquidación CxP');
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
    VALUES (v_entry_id, v_cash_acc, 0, v_amount, 'Pago ' || v_pay.method);
  END IF;

  RETURN v_entry_id;
END; $$;

-- 5) Trigger to auto-post payments
CREATE OR REPLACE FUNCTION public.trg_post_payment_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.post_payment_journal_entry(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'post_payment_journal_entry failed: %', SQLERRM;
  END;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_post_payment_journal ON public.account_payments;
CREATE TRIGGER trg_post_payment_journal
AFTER INSERT ON public.account_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_post_payment_journal();
