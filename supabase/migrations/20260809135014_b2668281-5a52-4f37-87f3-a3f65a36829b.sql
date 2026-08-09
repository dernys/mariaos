CREATE OR REPLACE FUNCTION public.post_purchase_journal_entry(p_purchase_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_p record; v_entry_id uuid;
  v_acc_inv uuid; v_acc_iva uuid; v_acc_cxp uuid; v_acc_caja uuid;
  v_total numeric; v_paid numeric; v_pending numeric;
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

  -- El asiento refleja el valor de la compra: el pago nunca puede exceder el total.
  v_total   := COALESCE(v_p.subtotal,0) + COALESCE(v_p.tax,0);
  v_paid    := LEAST(GREATEST(COALESCE(v_p.amount_paid,0),0), v_total);
  v_pending := GREATEST(0, v_total - v_paid);

  INSERT INTO journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, status, created_by, source_module)
  VALUES (v_p.tenant_id, 'C-'||substr(p_purchase_id::text,1,8), CURRENT_DATE,
          'Compra '||COALESCE(v_p.purchase_number, p_purchase_id::text), 'purchase', p_purchase_id, 'posted', auth.uid(), 'purchases')
  RETURNING id INTO v_entry_id;

  IF v_acc_inv IS NOT NULL AND COALESCE(v_p.subtotal,0) <> 0 THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_inv, COALESCE(v_p.subtotal,0), 0, 'Entrada inventario', v_cc);
  END IF;
  IF COALESCE(v_p.tax,0) > 0 AND v_acc_iva IS NOT NULL THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry_id, v_acc_iva, v_p.tax, 0, 'Impuesto acreditable', v_cc);
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
END $$;