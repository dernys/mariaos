-- ============ C) TRAZABILIDAD EN LA LÍNEA CONTABLE ============
ALTER TABLE public.journal_entry_lines
  ADD COLUMN IF NOT EXISTS mapping_key text,
  ADD COLUMN IF NOT EXISTS source_module text,
  ADD COLUMN IF NOT EXISTS source_operation text,
  ADD COLUMN IF NOT EXISTS correlation_id text;

CREATE INDEX IF NOT EXISTS idx_jel_mapping_key ON public.journal_entry_lines(mapping_key);
CREATE INDEX IF NOT EXISTS idx_jel_correlation ON public.journal_entry_lines(correlation_id);

-- ============ A/B) CATÁLOGO DE OPERACIONES CONFIGURABLES ============
CREATE OR REPLACE FUNCTION public.accounting_mapping_catalog()
 RETURNS TABLE(mapping_key text, module text, operation text, side text, account_type text, role_alias text, fallback_codes text[], sort_order integer)
 LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT * FROM (VALUES
    ('sale_revenue','sales','sale_completed','credit','income','sales',ARRAY['4100','400','700','401','4135'],10),
    ('sale_tax_payable','sales','sale_completed','credit','liability','tax_output',ARRAY['2200','210','477','208','2408'],20),
    ('sale_receivable','sales','sale_credit','debit','asset','receivables',ARRAY['1200','120','430','105','1305'],30),
    ('sale_cash','sales','sale_cash','debit','asset','cash',ARRAY['1100','101','570','1101'],40),
    ('sale_bank','sales','sale_card','debit','asset','bank',ARRAY['1110','110','572','102','1102'],50),
    ('sale_transfermovil','sales','sale_transfermovil','debit','asset',NULL,ARRAY['1110','110','572','102','1102'],51),
    ('sale_enzona','sales','sale_enzona','debit','asset',NULL,ARRAY['1110','110','572','102','1102'],52),
    ('sale_card','sales','sale_card_pos','debit','asset',NULL,ARRAY['1110','110','572','102','1102'],53),
    ('cogs','sales','sale_completed','debit','cost','cogs',ARRAY['5100','50','600','501','6135'],60),
    ('inventory','inventory','stock_movement','credit','asset','inventory',ARRAY['1300','130','300','115','1435'],70),
    ('inventory_adjustment','inventory','stock_adjustment','debit','expense',NULL,ARRAY['6900','690','659','6905'],71),
    ('sale_return_revenue','sales','sale_return','debit','income',NULL,ARRAY['4100','400','708','700','4175'],72),
    ('sale_return_cash','sales','sale_return','credit','asset',NULL,ARRAY['1100','101','570','1101'],73),
    ('purchase_inventory','purchases','purchase_received','debit','asset',NULL,ARRAY['1300','130','300','115','1435'],80),
    ('purchase_tax_receivable','purchases','purchase_received','debit','asset','tax_input',ARRAY['2200','472','118','2408'],90),
    ('purchase_payable','purchases','purchase_received','credit','liability','payables',ARRAY['2100','200','400','201','2205'],100),
    ('payment_cash','treasury','payment','debit','asset',NULL,ARRAY['1100','101','570','1101'],110),
    ('payment_bank','treasury','payment','debit','asset',NULL,ARRAY['1110','110','572','102','1102'],120),
    ('payment_transfermovil','treasury','payment_transfermovil','debit','asset',NULL,ARRAY['1110','110','572','102','1102'],121),
    ('payment_enzona','treasury','payment_enzona','debit','asset',NULL,ARRAY['1110','110','572','102','1102'],122),
    ('payment_card','treasury','payment_card','debit','asset',NULL,ARRAY['1110','110','572','102','1102'],123),
    ('bank_account','treasury','bank_movement','debit','asset','bank',ARRAY['1110','110','572','102','1102'],125),
    ('expense_general','expenses','expense_paid','debit','expense',NULL,ARRAY['6000','600','62','5200','5135'],126),
    ('other_income','income','other_income','credit','income',NULL,ARRAY['4900','490','790','4295'],127),
    ('owner_equity','equity','owner_movement','credit','equity',NULL,ARRAY['3000','300','100','3105'],128),
    ('tax_expense','tax','tax_accrual','debit','expense',NULL,ARRAY['6300','631','5400','5195'],129),
    ('payroll_expense','payroll','payroll_paid','debit','expense',NULL,ARRAY['6200','620','640','5201','5200'],130),
    ('payroll_liability','payroll','payroll_paid','credit','liability',NULL,ARRAY['2300','230','465','2104','2370'],140),
    ('payroll_ss_payable','payroll','payroll_paid','credit','liability',NULL,ARRAY['2106','476','4760','2300'],141),
    ('payroll_withholding','payroll','payroll_paid','credit','liability',NULL,ARRAY['2107','475','4751','2300'],142),
    ('payroll_cash','payroll','payroll_paid','credit','asset',NULL,ARRAY['1100','1101','101','570','1102'],143),
    ('cash_short','shifts','shift_close','debit','expense',NULL,ARRAY['6900','690','678'],150),
    ('cash_over','shifts','shift_close','credit','income',NULL,ARRAY['4900','490','778'],160)
  ) AS t(mapping_key, module, operation, side, account_type, role_alias, fallback_codes, sort_order);
$function$;

-- ============ EVENTO DE CONTROL ============
CREATE OR REPLACE FUNCTION public.log_accounting_control(
  p_tenant uuid, p_action text, p_key text, p_account uuid, p_module text, p_operation text, p_detail text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  INSERT INTO public.activity_log(tenant_id, entity_type, entity_id, action, description, metadata, performed_by)
  VALUES (p_tenant, 'accounting_mapping', COALESCE(p_account, p_tenant), p_action, p_detail,
          jsonb_build_object('mapping_key', p_key, 'module', p_module, 'operation', p_operation,
                             'account_id', p_account, 'actor_role', public.audit_actor_role(),
                             'server_time', now()),
          auth.uid());
EXCEPTION WHEN OTHERS THEN NULL;
END $function$;

-- ============ A) RESOLVER FAIL-CLOSED ============
CREATE OR REPLACE FUNCTION public.resolve_account_strict(
  p_tenant uuid, p_key text, p_module text DEFAULT NULL, p_operation text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_cat record; v_id uuid; v_acc record; v_alt text; v_cand uuid;
BEGIN
  SELECT * INTO v_cat FROM public.accounting_mapping_catalog() c
    WHERE c.mapping_key = p_key OR c.role_alias = p_key
    ORDER BY (c.mapping_key = p_key) DESC LIMIT 1;
  IF v_cat IS NULL THEN
    RAISE EXCEPTION 'ACCOUNTING_MAPPING_UNKNOWN: clave contable desconocida "%"', p_key;
  END IF;

  SELECT m.account_id INTO v_id FROM public.accounting_mappings m
    WHERE m.tenant_id = p_tenant AND m.mapping_key = v_cat.mapping_key AND COALESCE(m.is_active, true);

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_acc FROM public.accounting_accounts WHERE id = v_id AND tenant_id = p_tenant;
    IF v_acc IS NULL OR COALESCE(v_acc.is_active,true) = false OR COALESCE(v_acc.is_postable,false) = false THEN
      PERFORM public.log_accounting_control(p_tenant,'posting_blocked',v_cat.mapping_key,v_id,p_module,p_operation,
        'Cuenta configurada inactiva o no imputable');
      RAISE EXCEPTION 'ACCOUNTING_MAPPING_INVALID: la cuenta configurada para "%" está inactiva o no admite movimientos. Asigne un reemplazo en el Maestro de Cuentas.', v_cat.mapping_key;
    END IF;
    RETURN v_id;
  END IF;

  v_cand := COALESCE(
    public.resolve_account_by_pattern(p_tenant, COALESCE(v_cat.role_alias, v_cat.mapping_key)),
    public.find_account_by_codes(p_tenant, v_cat.fallback_codes));

  IF v_cand IS NULL THEN
    v_alt := CASE v_cat.mapping_key
      WHEN 'sale_transfermovil' THEN 'sale_bank' WHEN 'sale_enzona' THEN 'sale_bank' WHEN 'sale_card' THEN 'sale_bank'
      WHEN 'payment_transfermovil' THEN 'payment_bank' WHEN 'payment_enzona' THEN 'payment_bank' WHEN 'payment_card' THEN 'payment_bank'
      WHEN 'payroll_ss_payable' THEN 'payroll_liability' WHEN 'payroll_withholding' THEN 'payroll_liability'
      WHEN 'payroll_cash' THEN 'payment_cash' WHEN 'sale_return_cash' THEN 'sale_cash'
      WHEN 'sale_return_revenue' THEN 'sale_revenue' WHEN 'bank_account' THEN 'sale_bank'
      ELSE NULL END;
    IF v_alt IS NOT NULL THEN
      RETURN public.resolve_account_strict(p_tenant, v_alt, p_module, p_operation);
    END IF;
  END IF;

  IF v_cand IS NULL THEN
    PERFORM public.log_accounting_control(p_tenant,'posting_blocked',v_cat.mapping_key,NULL,p_module,p_operation,
      'Operación abortada: no existe cuenta configurada ni deducible');
    RAISE EXCEPTION 'ACCOUNTING_MAPPING_MISSING: no hay cuenta contable configurada para "%" (módulo %). Configúrela en el Maestro de Cuentas antes de registrar la operación.', v_cat.mapping_key, COALESCE(p_module,'contabilidad');
  END IF;

  INSERT INTO public.accounting_mappings(tenant_id, mapping_key, account_id, description, is_active)
  VALUES (p_tenant, v_cat.mapping_key, v_cand,
          'Vinculada automáticamente en el primer uso ('||COALESCE(p_module,'posting')||')', true)
  ON CONFLICT (tenant_id, mapping_key) DO NOTHING;

  PERFORM public.log_accounting_control(p_tenant,'mapping_autobound',v_cat.mapping_key,v_cand,p_module,p_operation,
    'Cuenta deducida y fijada en el Maestro de Cuentas (revisable por el contador)');
  RETURN v_cand;
END $function$;

-- ============ C) HELPER DE LÍNEA TRAZADA ============
CREATE OR REPLACE FUNCTION public.jel_add(
  p_entry uuid, p_account uuid, p_debit numeric, p_credit numeric, p_desc text,
  p_key text, p_module text, p_operation text, p_cc uuid DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $function$
  INSERT INTO public.journal_entry_lines
    (entry_id, account_id, debit, credit, description, cost_center_id,
     mapping_key, source_module, source_operation, correlation_id)
  SELECT p_entry, p_account, COALESCE(p_debit,0), COALESCE(p_credit,0), p_desc, p_cc,
         p_key, p_module, p_operation, je.reference_type || ':' || COALESCE(je.reference_id::text,'')
  FROM public.journal_entries je WHERE je.id = p_entry;
$function$;

-- ============ MÉTODO DE PAGO → CLAVE CONTABLE ============
CREATE OR REPLACE FUNCTION public.payment_account_role(p_method text, p_context text DEFAULT 'sale'::text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $function$
  SELECT CASE
    WHEN public.payment_method_class(p_method) = 'cash'
      THEN CASE WHEN p_context = 'payment' THEN 'payment_cash' ELSE 'sale_cash' END
    WHEN public.payment_method_norm(p_method) = 'TRANSFERMOVIL'
      THEN CASE WHEN p_context = 'payment' THEN 'payment_transfermovil' ELSE 'sale_transfermovil' END
    WHEN public.payment_method_norm(p_method) = 'ENZONA'
      THEN CASE WHEN p_context = 'payment' THEN 'payment_enzona' ELSE 'sale_enzona' END
    WHEN public.payment_method_norm(p_method) IN ('CARD','CARD_POS','DEBIT_CARD','CREDIT_CARD')
      THEN CASE WHEN p_context = 'payment' THEN 'payment_card' ELSE 'sale_card' END
    ELSE CASE WHEN p_context = 'payment' THEN 'payment_bank' ELSE 'sale_bank' END
  END;
$function$;

-- ============ POSTING: VENTA ============
CREATE OR REPLACE FUNCTION public.post_sale_journal_entry(p_sale_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_sale record; v_entry_id uuid;
  v_cash_total numeric := 0; v_bank_total numeric := 0; v_pending numeric := 0; v_cogs_total numeric := 0;
  v_acc_caja uuid; v_acc_banco uuid; v_acc_cxc uuid; v_acc_ventas uuid; v_acc_iva uuid;
  v_acc_cogs uuid; v_acc_inv uuid; v_cc uuid;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF v_sale IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE reference_type='sale' AND reference_id=p_sale_id) THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM sale_items WHERE sale_id = p_sale_id) THEN RETURN NULL; END IF;

  PERFORM ensure_default_accounts(v_sale.tenant_id);
  v_cc := v_sale.cost_center_id;

  SELECT COALESCE(SUM(amount_in_base) FILTER (WHERE public.payment_method_class(method) = 'cash'),0),
         COALESCE(SUM(amount_in_base) FILTER (WHERE public.payment_method_class(method) IN ('bank','digital')),0)
    INTO v_cash_total, v_bank_total
    FROM sale_payments WHERE sale_id = p_sale_id AND status = 'PAID';

  v_pending := GREATEST(0, round(COALESCE(v_sale.total,0) - (v_cash_total + v_bank_total), 2));

  SELECT COALESCE(SUM(si.qty * public.product_effective_cost(si.product_id)), 0) INTO v_cogs_total
    FROM sale_items si WHERE si.sale_id = p_sale_id AND si.product_id IS NOT NULL;

  -- Resolución fail-closed ANTES de crear el asiento
  v_acc_ventas := public.resolve_account_strict(v_sale.tenant_id,'sale_revenue','sales','sale_completed');
  IF v_cash_total > 0 THEN v_acc_caja := public.resolve_account_strict(v_sale.tenant_id,'sale_cash','sales','sale_cash'); END IF;
  IF v_bank_total > 0 THEN v_acc_banco := public.resolve_account_strict(v_sale.tenant_id,'sale_bank','sales','sale_card'); END IF;
  IF v_pending > 0 THEN v_acc_cxc := public.resolve_account_strict(v_sale.tenant_id,'sale_receivable','sales','sale_credit'); END IF;
  IF COALESCE(v_sale.tax,0) > 0 THEN v_acc_iva := public.resolve_account_strict(v_sale.tenant_id,'sale_tax_payable','sales','sale_completed'); END IF;
  IF v_cogs_total > 0 THEN
    v_acc_cogs := public.resolve_account_strict(v_sale.tenant_id,'cogs','sales','sale_completed');
    v_acc_inv  := public.resolve_account_strict(v_sale.tenant_id,'inventory','inventory','stock_movement');
  END IF;

  INSERT INTO journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, status, created_by, source_module)
  VALUES (v_sale.tenant_id, 'V-'||substr(md5(p_sale_id::text),1,12), CURRENT_DATE,
          'Venta '||COALESCE(v_sale.ticket_number, p_sale_id::text), 'sale', p_sale_id, 'posted', auth.uid(), 'sales')
  RETURNING id INTO v_entry_id;

  IF v_cash_total > 0 THEN PERFORM public.jel_add(v_entry_id, v_acc_caja, v_cash_total, 0, 'Cobro efectivo','sale_cash','sales','sale_cash',v_cc); END IF;
  IF v_bank_total > 0 THEN PERFORM public.jel_add(v_entry_id, v_acc_banco, v_bank_total, 0, 'Cobro bancario/digital','sale_bank','sales','sale_card',v_cc); END IF;
  IF v_pending > 0 THEN PERFORM public.jel_add(v_entry_id, v_acc_cxc, v_pending, 0, 'Saldo a cobrar / pagos por confirmar','sale_receivable','sales','sale_credit',v_cc); END IF;

  PERFORM public.jel_add(v_entry_id, v_acc_ventas, 0, COALESCE(v_sale.subtotal,0), 'Ingreso por venta','sale_revenue','sales','sale_completed',v_cc);
  IF COALESCE(v_sale.tax,0) > 0 THEN PERFORM public.jel_add(v_entry_id, v_acc_iva, 0, v_sale.tax, 'Impuestos cobrados','sale_tax_payable','sales','sale_completed',v_cc); END IF;

  IF v_cogs_total > 0 THEN
    PERFORM public.jel_add(v_entry_id, v_acc_cogs, v_cogs_total, 0, 'Costo de ventas','cogs','sales','sale_completed',v_cc);
    PERFORM public.jel_add(v_entry_id, v_acc_inv, 0, v_cogs_total, 'Salida de inventario','inventory','inventory','stock_movement',v_cc);
  END IF;

  RETURN v_entry_id;
END $function$;

-- ============ POSTING: COMPRA ============
CREATE OR REPLACE FUNCTION public.post_purchase_journal_entry(p_purchase_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_p record; v_entry_id uuid;
  v_acc_inv uuid; v_acc_iva uuid; v_acc_cxp uuid; v_acc_caja uuid;
  v_total numeric; v_paid numeric; v_pending numeric; v_cc uuid;
BEGIN
  SELECT * INTO v_p FROM purchases WHERE id = p_purchase_id;
  IF v_p IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE reference_type='purchase' AND reference_id=p_purchase_id) THEN RETURN NULL; END IF;

  PERFORM ensure_default_accounts(v_p.tenant_id);
  v_cc := v_p.cost_center_id;
  v_total   := COALESCE(v_p.subtotal,0) + COALESCE(v_p.tax,0);
  v_paid    := LEAST(GREATEST(COALESCE(v_p.amount_paid,0),0), v_total);
  v_pending := GREATEST(0, v_total - v_paid);

  IF COALESCE(v_p.subtotal,0) <> 0 THEN v_acc_inv := public.resolve_account_strict(v_p.tenant_id,'purchase_inventory','purchases','purchase_received'); END IF;
  IF COALESCE(v_p.tax,0) > 0 THEN v_acc_iva := public.resolve_account_strict(v_p.tenant_id,'purchase_tax_receivable','purchases','purchase_received'); END IF;
  IF v_paid > 0 THEN v_acc_caja := public.resolve_account_strict(v_p.tenant_id,'payment_cash','purchases','purchase_paid'); END IF;
  IF v_pending > 0 THEN v_acc_cxp := public.resolve_account_strict(v_p.tenant_id,'purchase_payable','purchases','purchase_received'); END IF;

  INSERT INTO journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, status, created_by, source_module)
  VALUES (v_p.tenant_id, 'C-'||substr(p_purchase_id::text,1,8), CURRENT_DATE,
          'Compra '||COALESCE(v_p.purchase_number, p_purchase_id::text), 'purchase', p_purchase_id, 'posted', auth.uid(), 'purchases')
  RETURNING id INTO v_entry_id;

  IF v_acc_inv IS NOT NULL THEN PERFORM public.jel_add(v_entry_id, v_acc_inv, COALESCE(v_p.subtotal,0), 0, 'Entrada inventario','purchase_inventory','purchases','purchase_received',v_cc); END IF;
  IF v_acc_iva IS NOT NULL THEN PERFORM public.jel_add(v_entry_id, v_acc_iva, v_p.tax, 0, 'Impuesto acreditable','purchase_tax_receivable','purchases','purchase_received',v_cc); END IF;
  IF v_acc_caja IS NOT NULL THEN PERFORM public.jel_add(v_entry_id, v_acc_caja, 0, v_paid, 'Pago al recibir','payment_cash','purchases','purchase_paid',v_cc); END IF;
  IF v_acc_cxp IS NOT NULL THEN PERFORM public.jel_add(v_entry_id, v_acc_cxp, 0, v_pending, 'Saldo por pagar','purchase_payable','purchases','purchase_received',v_cc); END IF;

  RETURN v_entry_id;
END $function$;

-- ============ POSTING: COBRO / PAGO ============
CREATE OR REPLACE FUNCTION public.post_payment_journal_entry(p_payment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_pay record; v_entry_id uuid; v_cash_acc uuid; v_party_acc uuid; v_amount numeric;
  v_cash_key text; v_party_key text;
BEGIN
  SELECT * INTO v_pay FROM account_payments WHERE id = p_payment_id;
  IF v_pay IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE reference_type='payment' AND reference_id=p_payment_id) THEN RETURN NULL; END IF;

  IF v_pay.reference_type IN ('sale','purchase') THEN
    IF NOT EXISTS (
      SELECT 1 FROM journal_entries
      WHERE reference_type = v_pay.reference_type AND reference_id = v_pay.reference_id
        AND created_at < v_pay.created_at - interval '5 seconds') THEN
      RETURN NULL;
    END IF;
  END IF;

  PERFORM ensure_default_accounts(v_pay.tenant_id);
  v_amount := COALESCE(v_pay.amount_in_base, v_pay.amount);

  v_cash_key  := public.payment_account_role(v_pay.method, 'payment');
  v_party_key := CASE WHEN v_pay.party_type = 'supplier' THEN 'purchase_payable' ELSE 'sale_receivable' END;
  v_cash_acc  := public.resolve_account_strict(v_pay.tenant_id, v_cash_key, 'treasury', 'payment');
  v_party_acc := public.resolve_account_strict(v_pay.tenant_id, v_party_key, 'treasury', 'payment');

  INSERT INTO journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, status, created_by)
  VALUES (v_pay.tenant_id, 'P-'||substr(p_payment_id::text,1,8), CURRENT_DATE,
          CASE WHEN v_pay.direction = 'in' THEN 'Cobro ' ELSE 'Pago ' END ||
          v_pay.party_type || ' ' || COALESCE(public.payment_method_norm(v_pay.method),''),
          'payment', p_payment_id, 'posted', auth.uid())
  RETURNING id INTO v_entry_id;

  IF v_pay.direction = 'in' THEN
    PERFORM public.jel_add(v_entry_id, v_cash_acc, v_amount, 0, 'Cobro '||public.payment_method_norm(v_pay.method), v_cash_key,'treasury','collection');
    PERFORM public.jel_add(v_entry_id, v_party_acc, 0, v_amount, 'Liquidación CxC', v_party_key,'treasury','collection');
  ELSE
    PERFORM public.jel_add(v_entry_id, v_party_acc, v_amount, 0, 'Liquidación CxP', v_party_key,'treasury','supplier_payment');
    PERFORM public.jel_add(v_entry_id, v_cash_acc, 0, v_amount, 'Pago '||public.payment_method_norm(v_pay.method), v_cash_key,'treasury','supplier_payment');
  END IF;

  RETURN v_entry_id;
END $function$;

-- ============ POSTING: DEVOLUCIÓN (sin hardcode) ============
CREATE OR REPLACE FUNCTION public.post_sale_return_journal_entry(p_return_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_r record; v_entry uuid; v_period uuid; v_acc_sales uuid; v_acc_cash uuid;
  v_number text; v_next bigint; v_cash_key text;
BEGIN
  SELECT * INTO v_r FROM sale_returns WHERE id = p_return_id;
  IF v_r IS NULL THEN RAISE EXCEPTION 'Devolución no encontrada'; END IF;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE reference_type='sale_return' AND reference_id=p_return_id AND status='posted') THEN RETURN NULL; END IF;

  v_cash_key := CASE WHEN public.payment_method_class(COALESCE(v_r.refund_method,'CASH')) = 'cash'
                     THEN 'sale_return_cash' ELSE 'sale_bank' END;
  v_acc_sales := public.resolve_account_strict(v_r.tenant_id,'sale_return_revenue','sales','sale_return');
  v_acc_cash  := public.resolve_account_strict(v_r.tenant_id, v_cash_key,'sales','sale_return');

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

  PERFORM public.jel_add(v_entry, v_acc_sales, v_r.total, 0, 'Reverso de venta','sale_return_revenue','sales','sale_return');
  PERFORM public.jel_add(v_entry, v_acc_cash, 0, v_r.total, 'Reembolso '||COALESCE(v_r.refund_method,''), v_cash_key,'sales','sale_return');

  RETURN v_entry;
END $function$;

-- ============ POSTING: NÓMINA (sin hardcode) ============
CREATE OR REPLACE FUNCTION public.post_payroll_journal_entry(_payroll_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _pr public.payroll_runs; _entry_id uuid;
  _exp_acc uuid; _ss_acc uuid; _irpf_acc uuid; _cash_acc uuid; _pay_acc uuid;
  _debit numeric := 0; _credit numeric := 0; _diff numeric; _period uuid; _fy uuid; _date date;
BEGIN
  SELECT * INTO _pr FROM public.payroll_runs WHERE id = _payroll_id;
  IF _pr.id IS NULL THEN RAISE EXCEPTION 'Nómina no encontrada'; END IF;
  IF _pr.journal_entry_id IS NOT NULL THEN RETURN _pr.journal_entry_id; END IF;

  _date := COALESCE(_pr.paid_at::date, _pr.period_end, CURRENT_DATE);

  _exp_acc  := public.resolve_account_strict(_pr.tenant_id,'payroll_expense','payroll','payroll_paid');
  _cash_acc := public.resolve_account_strict(_pr.tenant_id,'payroll_cash','payroll','payroll_paid');
  _pay_acc  := public.resolve_account_strict(_pr.tenant_id,'payroll_liability','payroll','payroll_paid');
  IF COALESCE(_pr.ss_company_amount,0) + COALESCE(_pr.ss_worker_amount,0) > 0 THEN
    _ss_acc := public.resolve_account_strict(_pr.tenant_id,'payroll_ss_payable','payroll','payroll_paid');
  END IF;
  IF COALESCE(_pr.irpf_amount,0) > 0 THEN
    _irpf_acc := public.resolve_account_strict(_pr.tenant_id,'payroll_withholding','payroll','payroll_paid');
  END IF;

  _period := public.resolve_period_id(_pr.tenant_id, _date);
  _fy     := public.resolve_fiscal_year_id(_pr.tenant_id, _date);

  INSERT INTO public.journal_entries(
    tenant_id, date, description, reference_type, reference_id,
    status, created_by, period_id, fiscal_year_id, entry_number, series, posted_at
  ) VALUES (
    _pr.tenant_id, _date, 'Nómina ' || COALESCE(_pr.receipt_number, substr(_pr.id::text,1,8)),
    'payroll', _pr.id, 'posted', auth.uid(), _period, _fy,
    'NOM-' || to_char(_date,'YYYYMM') || '-' || substr(_pr.id::text,1,8), 'NOM', now()
  ) RETURNING id INTO _entry_id;

  PERFORM public.jel_add(_entry_id, _exp_acc, COALESCE(_pr.gross_salary,_pr.net_pay,0), 0, 'Salario bruto','payroll_expense','payroll','payroll_paid');
  _debit := _debit + COALESCE(_pr.gross_salary, _pr.net_pay, 0);

  IF COALESCE(_pr.ss_company_amount,0) > 0 THEN
    PERFORM public.jel_add(_entry_id, _exp_acc, _pr.ss_company_amount, 0, 'Seguridad social empresa','payroll_expense','payroll','payroll_paid');
    _debit := _debit + _pr.ss_company_amount;
  END IF;

  IF _ss_acc IS NOT NULL THEN
    PERFORM public.jel_add(_entry_id, _ss_acc, 0, COALESCE(_pr.ss_company_amount,0)+COALESCE(_pr.ss_worker_amount,0), 'Seguridad social por pagar','payroll_ss_payable','payroll','payroll_paid');
    _credit := _credit + COALESCE(_pr.ss_company_amount,0) + COALESCE(_pr.ss_worker_amount,0);
  END IF;

  IF _irpf_acc IS NOT NULL THEN
    PERFORM public.jel_add(_entry_id, _irpf_acc, 0, _pr.irpf_amount, 'Retención de impuesto','payroll_withholding','payroll','payroll_paid');
    _credit := _credit + _pr.irpf_amount;
  END IF;

  PERFORM public.jel_add(_entry_id, _cash_acc, 0, COALESCE(_pr.net_pay,0), 'Pago neto a empleado','payroll_cash','payroll','payroll_paid');
  _credit := _credit + COALESCE(_pr.net_pay,0);

  _diff := round(_debit - _credit, 2);
  IF _diff > 0 THEN
    PERFORM public.jel_add(_entry_id, _pay_acc, 0, _diff, 'Otras deducciones / obligaciones','payroll_liability','payroll','payroll_paid');
  ELSIF _diff < 0 THEN
    PERFORM public.jel_add(_entry_id, _exp_acc, -_diff, 0, 'Ajuste de cuadre de nómina','payroll_expense','payroll','payroll_paid');
  END IF;

  UPDATE public.payroll_runs SET journal_entry_id = _entry_id WHERE id = _payroll_id;
  RETURN _entry_id;
END $function$;

-- ============ CAJA: CONTRAPARTIDA POR CLAVE CONFIGURABLE ============
CREATE OR REPLACE FUNCTION public.cash_category_mapping_key(p_category text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $function$
  SELECT CASE p_category
    WHEN 'bank_deposit' THEN 'bank_account'
    WHEN 'bank_withdrawal' THEN 'bank_account'
    WHEN 'supplier_payment' THEN 'purchase_payable'
    WHEN 'customer_collection' THEN 'sale_receivable'
    WHEN 'expense' THEN 'expense_general'
    WHEN 'owner_draw' THEN 'owner_equity'
    WHEN 'owner_contribution' THEN 'owner_equity'
    WHEN 'other_income' THEN 'other_income'
    ELSE 'expense_general'
  END;
$function$;

CREATE OR REPLACE FUNCTION public.register_shift_cash_movement(
  p_shift_id uuid, p_movement_type text, p_amount numeric, p_category text DEFAULT 'other'::text,
  p_reason text DEFAULT NULL, p_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_shift record; v_summary jsonb; v_base numeric;
  v_acc_cash uuid; v_acc_other uuid; v_entry_id uuid; v_mov_id uuid; v_key text;
BEGIN
  IF p_movement_type NOT IN ('in','out') THEN RAISE EXCEPTION 'Tipo de movimiento inválido'; END IF;
  IF COALESCE(p_amount,0) <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor que cero'; END IF;

  SELECT * INTO v_shift FROM public.sales_shifts WHERE id = p_shift_id FOR UPDATE;
  IF v_shift IS NULL THEN RAISE EXCEPTION 'Turno no encontrado'; END IF;
  IF NOT public.is_tenant_member(v_shift.tenant_id) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF v_shift.status <> 'open' OR v_shift.locked THEN RAISE EXCEPTION 'El turno está cerrado: no admite movimientos de caja'; END IF;

  v_base := ROUND(p_amount * COALESCE(NULLIF(p_exchange_rate,0),1), 2);

  IF p_movement_type = 'out' THEN
    v_summary := public.calculate_shift_summary(p_shift_id);
    IF COALESCE((v_summary->>'expected_cash')::numeric,0) < v_base - 0.01 THEN
      RAISE EXCEPTION 'Efectivo insuficiente en caja: disponible %', COALESCE((v_summary->>'expected_cash')::numeric,0);
    END IF;
  END IF;

  PERFORM public.ensure_default_accounts(v_shift.tenant_id);
  v_key       := public.cash_category_mapping_key(COALESCE(p_category,'other'));
  v_acc_cash  := public.resolve_account_strict(v_shift.tenant_id,'sale_cash','shifts','cash_movement');
  v_acc_other := public.resolve_account_strict(v_shift.tenant_id, v_key,'shifts','cash_movement');

  INSERT INTO public.journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, status, created_by)
  VALUES (v_shift.tenant_id, 'CJ-'||substr(p_shift_id::text,1,8)||'-'||to_char(now(),'HH24MISS'), CURRENT_DATE,
          CASE WHEN p_movement_type = 'in' THEN 'Ingreso de caja' ELSE 'Egreso de caja' END
            ||' ('||p_category||')'||COALESCE(' · '||p_reason,''),
          'shift_cash_movement', p_shift_id, 'draft', auth.uid())
  RETURNING id INTO v_entry_id;

  IF p_movement_type = 'in' THEN
    PERFORM public.jel_add(v_entry_id, v_acc_cash, v_base, 0, 'Entrada de efectivo','sale_cash','shifts','cash_in');
    PERFORM public.jel_add(v_entry_id, v_acc_other, 0, v_base, COALESCE(p_reason,p_category), v_key,'shifts','cash_in');
  ELSE
    PERFORM public.jel_add(v_entry_id, v_acc_other, v_base, 0, COALESCE(p_reason,p_category), v_key,'shifts','cash_out');
    PERFORM public.jel_add(v_entry_id, v_acc_cash, 0, v_base, 'Salida de efectivo','sale_cash','shifts','cash_out');
  END IF;

  PERFORM public.post_journal_entry(v_entry_id);

  INSERT INTO public.shift_cash_movements
    (tenant_id, shift_id, movement_type, category, amount, currency, exchange_rate, amount_in_base, reason, performed_by, journal_entry_id)
  VALUES (v_shift.tenant_id, p_shift_id, p_movement_type, COALESCE(p_category,'other'), p_amount,
          COALESCE(p_currency,'CUP'), COALESCE(NULLIF(p_exchange_rate,0),1), v_base, p_reason, auth.uid(), v_entry_id)
  RETURNING id INTO v_mov_id;

  UPDATE public.sales_shifts SET
    cash_in_total  = COALESCE(cash_in_total,0)  + CASE WHEN p_movement_type='in'  THEN v_base ELSE 0 END,
    cash_out_total = COALESCE(cash_out_total,0) + CASE WHEN p_movement_type='out' THEN v_base ELSE 0 END,
    updated_at = now()
  WHERE id = p_shift_id;

  RETURN jsonb_build_object('movement_id', v_mov_id, 'journal_entry_id', v_entry_id, 'amount_in_base', v_base);
END $function$;

-- ============ CIERRE Z ============
CREATE OR REPLACE FUNCTION public.close_shift_z(p_shift_id uuid, p_counted_cash numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_shift record; v_summary jsonb; v_expected numeric := 0; v_diff numeric := 0;
  v_entry_id uuid; v_acc_cash uuid; v_acc_loss uuid; v_acc_gain uuid;
BEGIN
  SELECT * INTO v_shift FROM public.sales_shifts WHERE id = p_shift_id FOR UPDATE;
  IF v_shift IS NULL THEN RAISE EXCEPTION 'Turno no encontrado'; END IF;
  IF NOT public.is_tenant_member(v_shift.tenant_id) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF v_shift.locked THEN RAISE EXCEPTION 'El turno ya está bloqueado por cierre Z'; END IF;

  v_summary := public.calculate_shift_summary(p_shift_id);
  v_expected := COALESCE((v_summary->>'expected_cash')::numeric, 0);
  v_diff := ROUND(COALESCE(p_counted_cash, v_expected) - v_expected, 2);

  IF ABS(v_diff) >= 0.01 THEN
    PERFORM public.ensure_default_accounts(v_shift.tenant_id);
    v_acc_cash := public.resolve_account_strict(v_shift.tenant_id,'sale_cash','shifts','shift_close');
    IF v_diff < 0 THEN
      v_acc_loss := public.resolve_account_strict(v_shift.tenant_id,'cash_short','shifts','shift_close');
    ELSE
      v_acc_gain := public.resolve_account_strict(v_shift.tenant_id,'cash_over','shifts','shift_close');
    END IF;

    INSERT INTO public.journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, status, created_by)
    VALUES (v_shift.tenant_id, 'Z-'||substr(p_shift_id::text,1,8), CURRENT_DATE,
            CASE WHEN v_diff < 0 THEN 'Faltante de caja · Cierre Z' ELSE 'Sobrante de caja · Cierre Z' END,
            'shift_z', p_shift_id, 'draft', auth.uid())
    RETURNING id INTO v_entry_id;

    IF v_diff < 0 THEN
      PERFORM public.jel_add(v_entry_id, v_acc_loss, ABS(v_diff), 0, 'Faltante de caja','cash_short','shifts','shift_close');
      PERFORM public.jel_add(v_entry_id, v_acc_cash, 0, ABS(v_diff), 'Ajuste de caja','sale_cash','shifts','shift_close');
    ELSE
      PERFORM public.jel_add(v_entry_id, v_acc_cash, v_diff, 0, 'Ajuste de caja','sale_cash','shifts','shift_close');
      PERFORM public.jel_add(v_entry_id, v_acc_gain, 0, v_diff, 'Sobrante de caja','cash_over','shifts','shift_close');
    END IF;

    PERFORM public.post_journal_entry(v_entry_id);
  END IF;

  v_summary := v_summary || jsonb_build_object(
    'counted_cash', COALESCE(p_counted_cash, v_expected),
    'cash_difference', v_diff, 'journal_entry_id', v_entry_id, 'closed_at', now());

  UPDATE public.sales_shifts SET
    status='closed', closed_at=now(),
    closing_cash=COALESCE(p_counted_cash, v_expected), declared_cash=COALESCE(p_counted_cash, v_expected),
    expected_cash=v_expected, cash_difference=v_diff,
    cash_in_total=COALESCE((v_summary->>'cash_in')::numeric,0),
    cash_out_total=COALESCE((v_summary->>'cash_out')::numeric,0),
    returns_total=COALESCE((v_summary->>'returns_cash')::numeric,0),
    total_sales=COALESCE((v_summary->>'total_sales')::numeric,0),
    total_transactions=COALESCE((v_summary->>'transactions')::int,0),
    z_journal_entry_id=v_entry_id, z_summary=v_summary, z_closed_at=now(),
    locked=true, updated_at=now()
  WHERE id = p_shift_id;

  RETURN v_summary;
END $function$;

-- ============ D) MAESTRO SEGURO ============
DROP POLICY IF EXISTS "Tenant insert accounts" ON public.accounting_accounts;
DROP POLICY IF EXISTS "Tenant update accounts" ON public.accounting_accounts;
DROP POLICY IF EXISTS "Superadmin can insert accounting_accounts" ON public.accounting_accounts;
DROP POLICY IF EXISTS "Superadmin can update accounting_accounts" ON public.accounting_accounts;
DROP POLICY IF EXISTS "Admin delete accounts" ON public.accounting_accounts;

CREATE POLICY "Accounting managers insert accounts" ON public.accounting_accounts
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_accounting(tenant_id));
CREATE POLICY "Accounting managers update accounts" ON public.accounting_accounts
  FOR UPDATE TO authenticated USING (public.can_manage_accounting(tenant_id))
  WITH CHECK (public.can_manage_accounting(tenant_id));
CREATE POLICY "Accounting managers delete accounts" ON public.accounting_accounts
  FOR DELETE TO authenticated USING (public.can_manage_accounting(tenant_id));

DROP TRIGGER IF EXISTS zz_audit_accounting_accounts ON public.accounting_accounts;
CREATE TRIGGER zz_audit_accounting_accounts
  AFTER INSERT OR UPDATE OR DELETE ON public.accounting_accounts
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

DROP TRIGGER IF EXISTS zz_audit_accounting_mappings ON public.accounting_mappings;
CREATE TRIGGER zz_audit_accounting_mappings
  AFTER INSERT OR UPDATE OR DELETE ON public.accounting_mappings
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- No desactivar cuentas en uso sin reemplazo configurado
CREATE OR REPLACE FUNCTION public.guard_account_deactivation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_keys text[];
BEGIN
  IF COALESCE(OLD.is_active,true) = true AND COALESCE(NEW.is_active,true) = false THEN
    SELECT array_agg(mapping_key) INTO v_keys FROM public.accounting_mappings
      WHERE tenant_id = OLD.tenant_id AND account_id = OLD.id AND COALESCE(is_active,true);
    IF v_keys IS NOT NULL THEN
      RAISE EXCEPTION 'ACCOUNT_IN_USE: la cuenta % está asignada a % y no puede desactivarse sin configurar antes una cuenta de reemplazo.', OLD.code, array_to_string(v_keys, ', ');
    END IF;
    PERFORM public.log_accounting_control(OLD.tenant_id,'account_deactivated',NULL,OLD.id,'accounting','deactivate',
      'Cuenta '||OLD.code||' desactivada');
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS zz_guard_account_deactivation ON public.accounting_accounts;
CREATE TRIGGER zz_guard_account_deactivation
  BEFORE UPDATE ON public.accounting_accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_account_deactivation();

-- ============ E) REPORTE DE INTEGRIDAD DE CONFIGURACIÓN ============
CREATE OR REPLACE FUNCTION public.accounting_config_report(p_tenant uuid)
RETURNS TABLE(mapping_key text, module text, operation text, status text, account_code text,
              account_name text, expected_type text, actual_type text, lines_count bigint,
              detail text, remediation text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  PERFORM public.assert_tenant_access(p_tenant);
  RETURN QUERY
  WITH cat AS (SELECT * FROM public.accounting_mapping_catalog()),
  m AS (SELECT * FROM public.accounting_mappings WHERE tenant_id = p_tenant AND COALESCE(is_active,true)),
  usage AS (
    SELECT jel.mapping_key AS mk, jel.account_id, COUNT(*) cnt
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.entry_id
    WHERE je.tenant_id = p_tenant GROUP BY 1,2),
  base AS (
    SELECT c.mapping_key, c.module, c.operation, c.account_type AS expected_type,
           m.account_id, a.code, a.name, a.type AS actual_type, a.is_active, a.is_postable,
           COALESCE((SELECT SUM(cnt) FROM usage u WHERE u.mk = c.mapping_key),0) AS lines_count,
           (SELECT COUNT(*) FROM m m2 WHERE m2.account_id = m.account_id AND m2.mapping_key <> c.mapping_key
              AND m2.mapping_key IN (SELECT mapping_key FROM cat c2 WHERE c2.account_type <> c.account_type)) AS conflicts
    FROM cat c
    LEFT JOIN m ON m.mapping_key = c.mapping_key
    LEFT JOIN public.accounting_accounts a ON a.id = m.account_id AND a.tenant_id = p_tenant)
  SELECT b.mapping_key, b.module, b.operation,
    CASE
      WHEN b.account_id IS NULL THEN 'MISSING'
      WHEN b.code IS NULL OR COALESCE(b.is_active,true)=false OR COALESCE(b.is_postable,false)=false THEN 'INVALID'
      WHEN b.actual_type IS DISTINCT FROM b.expected_type THEN 'INVALID'
      WHEN b.conflicts > 0 THEN 'CONFLICTING'
      WHEN b.lines_count > 0 THEN 'USED'
      ELSE 'UNUSED'
    END AS status,
    b.code, b.name, b.expected_type, b.actual_type, b.lines_count,
    CASE
      WHEN b.account_id IS NULL THEN 'Operación sin cuenta configurada: se bloqueará al contabilizar.'
      WHEN b.code IS NULL OR COALESCE(b.is_active,true)=false OR COALESCE(b.is_postable,false)=false THEN 'La cuenta asignada no existe, está inactiva o no admite movimientos.'
      WHEN b.actual_type IS DISTINCT FROM b.expected_type THEN 'La cuenta es de tipo '||COALESCE(b.actual_type,'?')||' y la operación exige '||b.expected_type||'.'
      WHEN b.conflicts > 0 THEN 'La misma cuenta se usa en operaciones de naturaleza distinta.'
      WHEN b.lines_count > 0 THEN 'Configurada y en uso.'
      ELSE 'Configurada, aún sin movimientos.'
    END,
    CASE
      WHEN b.account_id IS NULL THEN 'Asigne una cuenta de tipo '||b.expected_type||' en el Maestro de Cuentas.'
      WHEN b.actual_type IS DISTINCT FROM b.expected_type THEN 'Reasigne a una cuenta de tipo '||b.expected_type||'.'
      WHEN b.conflicts > 0 THEN 'Separe las operaciones en cuentas distintas.'
      ELSE 'Sin acción requerida.'
    END
  FROM base b
  UNION ALL
  SELECT m.mapping_key, 'desconocido', '—', 'ORPHAN', a.code, a.name, '—', a.type, 0,
         'Clave configurada que ya no forma parte del catálogo de operaciones.',
         'Elimine o revise esta configuración.'
  FROM m LEFT JOIN public.accounting_accounts a ON a.id = m.account_id
  WHERE m.mapping_key NOT IN (SELECT mapping_key FROM cat)
  ORDER BY 4, 1;
END $function$;

-- ============ F) CANDIDATOS DE RECLASIFICACIÓN (SOLO DIAGNÓSTICO) ============
CREATE OR REPLACE FUNCTION public.accounting_reclass_candidates(p_tenant uuid)
RETURNS TABLE(account_id uuid, account_code text, account_name text, actual_type text,
              mapping_key text, expected_type text, lines_count bigint, amount numeric,
              proposal text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  PERFORM public.assert_tenant_access(p_tenant);
  RETURN QUERY
  WITH cat AS (SELECT * FROM public.accounting_mapping_catalog()),
  lines AS (
    SELECT jel.account_id, jel.mapping_key, COUNT(*) cnt, SUM(COALESCE(jel.debit,0)+COALESCE(jel.credit,0)) amt
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.entry_id
    WHERE je.tenant_id = p_tenant AND jel.mapping_key IS NOT NULL
    GROUP BY 1,2)
  SELECT a.id, a.code, a.name, a.type, l.mapping_key, c.account_type, l.cnt, l.amt,
    'Propuesta: reclasificar movimientos de '||a.code||' ('||a.type||') a una cuenta de tipo '||c.account_type||
    '. No se modifican asientos posteados; requiere asiento de reclasificación aprobado por contabilidad.'
  FROM lines l
  JOIN public.accounting_accounts a ON a.id = l.account_id
  JOIN cat c ON c.mapping_key = l.mapping_key
  WHERE a.type IS DISTINCT FROM c.account_type
  ORDER BY l.amt DESC;
END $function$;

-- ============ GRANTS ============
REVOKE EXECUTE ON FUNCTION public.resolve_account_strict(uuid,text,text,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.jel_add(uuid,uuid,numeric,numeric,text,text,text,text,uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_accounting_control(uuid,text,text,uuid,text,text,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_account_deactivation() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_config_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_reclass_candidates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cash_category_mapping_key(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.accounting_config_report(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.accounting_reclass_candidates(uuid) FROM anon;