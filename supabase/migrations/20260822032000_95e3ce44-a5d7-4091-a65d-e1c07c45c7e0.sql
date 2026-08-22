
-- Costo unitario efectivo: coste propio del producto o coste de su receta
CREATE OR REPLACE FUNCTION public.product_effective_cost(p_product_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(p.cost, 0) > 0 THEN p.cost
    ELSE COALESCE((
      SELECT SUM(r.quantity * COALESCE(ing.cost, 0))
      FROM public.product_recipes r
      JOIN public.products ing ON ing.id = r.ingredient_id
      WHERE r.product_id = p.id
    ), 0)
  END
  FROM public.products p
  WHERE p.id = p_product_id;
$$;

REVOKE ALL ON FUNCTION public.product_effective_cost(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.product_effective_cost(uuid) TO authenticated, service_role;

-- post_sale_journal_entry: usa el costo efectivo (producto o receta)
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

  INSERT INTO journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, status, created_by)
  VALUES (v_sale.tenant_id, 'V-'||substr(p_sale_id::text,1,8), CURRENT_DATE,
          'Venta '||COALESCE(v_sale.ticket_number, p_sale_id::text), 'sale', p_sale_id, 'posted', auth.uid())
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
END;
$$;

-- Ajuste auditado del costo de ventas no contabilizado (no muta asientos posteados)
CREATE OR REPLACE FUNCTION public.post_missing_cogs(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
  v_cogs numeric;
  v_acc_cogs uuid; v_acc_inv uuid;
  v_entry uuid;
  v_count int := 0;
  v_total numeric := 0;
BEGIN
  IF NOT public.assert_tenant_access(p_tenant) THEN
    RAISE EXCEPTION 'No autorizado en este negocio';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contador') OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'Solo administración o contabilidad puede registrar ajustes';
  END IF;

  PERFORM ensure_default_accounts(p_tenant);
  v_acc_cogs := resolve_account_by_role(p_tenant, 'cogs');
  v_acc_inv  := resolve_account_by_role(p_tenant, 'inventory');
  IF v_acc_cogs IS NULL OR v_acc_inv IS NULL THEN
    RAISE EXCEPTION 'Faltan cuentas de costo de ventas o inventario';
  END IF;

  FOR v_sale IN
    SELECT s.id, s.ticket_number, s.cost_center_id
    FROM public.sales s
    WHERE s.tenant_id = p_tenant
      AND COALESCE(s.status,'') <> 'cancelled'
      AND EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.reference_type='sale' AND e.reference_id=s.id AND e.status='posted')
      AND NOT EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.reference_type='sale_cogs_adjustment' AND e.reference_id=s.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.journal_entries e
        JOIN public.journal_entry_lines l ON l.entry_id = e.id
        JOIN public.accounting_accounts a ON a.id = l.account_id
        WHERE e.reference_type='sale' AND e.reference_id=s.id AND a.type='cost'
      )
  LOOP
    SELECT COALESCE(SUM(si.qty * public.product_effective_cost(si.product_id)), 0) INTO v_cogs
      FROM public.sale_items si
      WHERE si.sale_id = v_sale.id AND si.product_id IS NOT NULL;

    IF COALESCE(v_cogs,0) <= 0 THEN CONTINUE; END IF;

    INSERT INTO public.journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, status, created_by, posted_at, posted_by)
    VALUES (p_tenant, 'AJC-'||substr(v_sale.id::text,1,8), CURRENT_DATE,
            'Ajuste de costo de ventas '||COALESCE(v_sale.ticket_number, v_sale.id::text),
            'sale_cogs_adjustment', v_sale.id, 'posted', auth.uid(), now(), auth.uid())
    RETURNING id INTO v_entry;

    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry, v_acc_cogs, v_cogs, 0, 'Costo de ventas (ajuste)', v_sale.cost_center_id);
    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description, cost_center_id)
    VALUES (v_entry, v_acc_inv, 0, v_cogs, 'Salida de inventario (ajuste)', v_sale.cost_center_id);

    v_count := v_count + 1;
    v_total := v_total + v_cogs;
  END LOOP;

  INSERT INTO public.activity_log(tenant_id, entity_type, entity_id, action, description, metadata, performed_by)
  VALUES (p_tenant, 'accounting', p_tenant, 'cogs_adjustment',
          format('Ajuste de costo de ventas en %s ventas por %s', v_count, round(v_total,2)),
          jsonb_build_object('sales', v_count, 'amount', round(v_total,2)), auth.uid());

  RETURN jsonb_build_object('sales_adjusted', v_count, 'amount', round(v_total,2));
END;
$$;

REVOKE ALL ON FUNCTION public.post_missing_cogs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_missing_cogs(uuid) TO authenticated, service_role;
