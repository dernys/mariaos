-- 1) numeración única para asientos de venta
CREATE OR REPLACE FUNCTION public.post_sale_journal_entry(p_sale_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sale record;
  v_entry_id uuid;
  v_cash_total numeric := 0;
  v_bank_total numeric := 0;
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
  IF NOT EXISTS (SELECT 1 FROM sale_items WHERE sale_id = p_sale_id) THEN RETURN NULL; END IF;

  PERFORM ensure_default_accounts(v_sale.tenant_id);
  v_acc_caja   := resolve_account_by_role(v_sale.tenant_id, 'sale_cash');
  v_acc_banco  := resolve_account_by_role(v_sale.tenant_id, 'sale_bank');
  v_acc_cxc    := resolve_account_by_role(v_sale.tenant_id, 'receivables');
  v_acc_ventas := resolve_account_by_role(v_sale.tenant_id, 'sales');
  v_acc_iva    := resolve_account_by_role(v_sale.tenant_id, 'tax_output');
  v_acc_cogs   := resolve_account_by_role(v_sale.tenant_id, 'cogs');
  v_acc_inv    := resolve_account_by_role(v_sale.tenant_id, 'inventory');
  v_cc         := v_sale.cost_center_id;

  SELECT COALESCE(SUM(amount_in_base) FILTER (WHERE public.payment_method_class(method) = 'cash'),0),
         COALESCE(SUM(amount_in_base) FILTER (WHERE public.payment_method_class(method) IN ('bank','digital')),0)
    INTO v_cash_total, v_bank_total
    FROM sale_payments WHERE sale_id = p_sale_id AND status = 'PAID';

  v_pending := GREATEST(0, round(COALESCE(v_sale.total,0) - (v_cash_total + v_bank_total), 2));

  SELECT COALESCE(SUM(si.qty * public.product_effective_cost(si.product_id)), 0) INTO v_cogs_total
    FROM sale_items si
    WHERE si.sale_id = p_sale_id AND si.product_id IS NOT NULL;

  INSERT INTO journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, status, created_by, source_module)
  VALUES (v_sale.tenant_id, 'V-'||substr(md5(p_sale_id::text),1,12), CURRENT_DATE,
          'Venta '||COALESCE(v_sale.ticket_number, p_sale_id::text), 'sale', p_sale_id, 'posted', auth.uid(), 'sales')
  RETURNING id INTO v_entry_id;

  IF v_cash_total > 0 AND v_acc_caja IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_caja, v_cash_total, 0, 'Cobro efectivo', v_cc);
  END IF;
  IF v_bank_total > 0 AND v_acc_banco IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_banco, v_bank_total, 0, 'Cobro bancario/digital', v_cc);
  END IF;
  IF v_pending > 0 AND v_acc_cxc IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_cxc, v_pending, 0, 'Saldo a cobrar / pagos por confirmar', v_cc);
  END IF;

  IF v_acc_ventas IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_ventas, 0, COALESCE(v_sale.subtotal,0), 'Ingreso por venta', v_cc);
  END IF;
  IF COALESCE(v_sale.tax,0) > 0 AND v_acc_iva IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_iva, 0, v_sale.tax, 'Impuestos cobrados', v_cc);
  END IF;

  IF v_cogs_total > 0 AND v_acc_cogs IS NOT NULL AND v_acc_inv IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_cogs, v_cogs_total, 0, 'Costo de ventas', v_cc);
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_inv, 0, v_cogs_total, 'Salida de inventario', v_cc);
  END IF;

  RETURN v_entry_id;
END; $$;

-- 2) renumerar duplicados históricos (con los guards desactivados durante la corrección)
ALTER TABLE public.journal_entries DISABLE TRIGGER zz_guard_posted_journal_entry;
ALTER TABLE public.journal_entries DISABLE TRIGGER zz_guard_closed_period;

WITH dup AS (
  SELECT id, entry_number, reference_id,
         row_number() OVER (PARTITION BY tenant_id, COALESCE(series,''), entry_number ORDER BY created_at, id) rn
  FROM public.journal_entries
)
UPDATE public.journal_entries je
SET entry_number = CASE
      WHEN je.reference_id IS NOT NULL THEN left(je.entry_number, 2) || substr(md5(je.reference_id::text),1,12)
      ELSE je.entry_number || '-' || substr(md5(je.id::text),1,4)
    END
FROM dup
WHERE dup.id = je.id AND dup.rn > 1;

-- segunda pasada defensiva para cualquier colisión residual
WITH dup AS (
  SELECT id, row_number() OVER (PARTITION BY tenant_id, COALESCE(series,''), entry_number ORDER BY created_at, id) rn
  FROM public.journal_entries
)
UPDATE public.journal_entries je
SET entry_number = je.entry_number || '-' || substr(md5(je.id::text),1,6)
FROM dup WHERE dup.id = je.id AND dup.rn > 1;

SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE public.journal_entries ENABLE TRIGGER zz_guard_posted_journal_entry;
ALTER TABLE public.journal_entries ENABLE TRIGGER zz_guard_closed_period;

CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_tenant_series_number_uk
  ON public.journal_entries (tenant_id, COALESCE(series,''), entry_number);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_tenant_series_number_uk
  ON public.invoices (tenant_id, COALESCE(series_code,''), invoice_number);