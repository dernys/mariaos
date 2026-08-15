CREATE OR REPLACE FUNCTION public.post_sale_journal_entry(p_sale_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Sin líneas la venta aún no está formada: se contabiliza al completarse
  IF NOT EXISTS (SELECT 1 FROM sale_items WHERE sale_id = p_sale_id) THEN
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

  -- Pendiente = total - cobros reales registrados (mantiene el asiento cuadrado)
  v_pending := GREATEST(0, COALESCE(v_sale.total,0) - (v_cash_total + v_card_total));

  SELECT COALESCE(SUM(si.qty * COALESCE(p.cost,0)), 0) INTO v_cogs_total
    FROM sale_items si
    LEFT JOIN products p ON p.id = si.product_id
    WHERE si.sale_id = p_sale_id;

  INSERT INTO journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, status, created_by)
  VALUES (v_sale.tenant_id, 'V-'||substr(p_sale_id::text,1,8), CURRENT_DATE,
          'Venta '||COALESCE(v_sale.ticket_number, p_sale_id::text), 'sale', p_sale_id, 'posted', auth.uid())
  RETURNING id INTO v_entry_id;

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
END; $function$;