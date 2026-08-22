-- =============================================================
-- P1 — AUDIT TRAIL + INMUTABILIDAD + PERIODOS + EXCEPCIONES
-- =============================================================

-- 1) Rol del actor (para auditoría)
CREATE OR REPLACE FUNCTION public.audit_actor_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT 'superadmin' FROM public.superadmins s WHERE s.user_id = auth.uid() LIMIT 1),
    (SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id = auth.uid()
      ORDER BY CASE ur.role::text
        WHEN 'admin' THEN 1 WHEN 'gerente' THEN 2 WHEN 'contador' THEN 3
        WHEN 'supervisor' THEN 4 WHEN 'cajero' THEN 5 WHEN 'inventarista' THEN 6 ELSE 7 END
      LIMIT 1),
    'system')
$$;
REVOKE ALL ON FUNCTION public.audit_actor_role() FROM anon;

-- 2) audit_trigger enriquecido (aplica a los ~20 triggers existentes)
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid; v_entity_id uuid; v_action text;
  v_old jsonb; v_new jsonb; v_diff jsonb := '{}'::jsonb; v_key text; v_row jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create'; v_new := to_jsonb(NEW); v_row := v_new;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update'; v_old := to_jsonb(OLD); v_new := to_jsonb(NEW); v_row := v_new;
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      IF v_new->v_key IS DISTINCT FROM v_old->v_key AND v_key NOT IN ('updated_at','created_at') THEN
        v_diff := v_diff || jsonb_build_object(v_key, jsonb_build_object('old', v_old->v_key, 'new', v_new->v_key));
      END IF;
    END LOOP;
    IF v_diff = '{}'::jsonb THEN RETURN NEW; END IF;
  ELSE
    v_action := 'delete'; v_old := to_jsonb(OLD); v_row := v_old;
  END IF;

  v_tenant := NULLIF(v_row->>'tenant_id','')::uuid;
  v_entity_id := NULLIF(v_row->>'id','')::uuid;
  IF v_entity_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  INSERT INTO public.activity_log (entity_type, entity_id, action, description, metadata, performed_by, tenant_id)
  VALUES (
    TG_TABLE_NAME, v_entity_id, v_action, TG_TABLE_NAME || ' ' || v_action,
    jsonb_strip_nulls(
      jsonb_build_object(
        'actor_role', public.audit_actor_role(),
        'actor_label', public.current_actor_label(),
        'server_time', now(),
        'amount', COALESCE(v_row->'amount', v_row->'total'),
        'currency', v_row->'currency',
        'status', v_row->'status',
        'reference', COALESCE(v_row->'reference', v_row->'reference_id', v_row->'entry_number',
                              v_row->'ticket_number', v_row->'purchase_number', v_row->'code'),
        'reason', COALESCE(v_row->'reason', v_row->'notes')
      )
      || CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('diff', v_diff)
              WHEN TG_OP = 'INSERT' THEN jsonb_build_object('new', v_new)
              ELSE jsonb_build_object('old', v_old) END
    ),
    auth.uid(), v_tenant
  );
  RETURN COALESCE(NEW, OLD);
END; $$;
REVOKE ALL ON FUNCTION public.audit_trigger() FROM anon, authenticated;

-- 3) Auditoría de líneas / tablas hijas (tenant resuelto desde el padre)
CREATE OR REPLACE FUNCTION public.audit_trigger_child()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parent text := TG_ARGV[0]; v_fk text := TG_ARGV[1];
  v_row jsonb; v_action text; v_tenant uuid; v_parent_id uuid; v_diff jsonb := '{}'::jsonb; v_key text;
BEGIN
  IF TG_OP = 'INSERT' THEN v_action := 'create'; v_row := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update'; v_row := to_jsonb(NEW);
    FOR v_key IN SELECT jsonb_object_keys(v_row) LOOP
      IF v_row->v_key IS DISTINCT FROM (to_jsonb(OLD))->v_key AND v_key NOT IN ('updated_at','created_at') THEN
        v_diff := v_diff || jsonb_build_object(v_key, jsonb_build_object('old', (to_jsonb(OLD))->v_key, 'new', v_row->v_key));
      END IF;
    END LOOP;
    IF v_diff = '{}'::jsonb THEN RETURN NEW; END IF;
  ELSE v_action := 'delete'; v_row := to_jsonb(OLD);
  END IF;

  v_parent_id := NULLIF(v_row->>v_fk,'')::uuid;
  IF v_parent_id IS NOT NULL THEN
    EXECUTE format('SELECT tenant_id FROM public.%I WHERE id = $1', v_parent) INTO v_tenant USING v_parent_id;
  END IF;

  INSERT INTO public.activity_log (entity_type, entity_id, action, description, metadata, performed_by, tenant_id)
  VALUES (
    TG_TABLE_NAME, NULLIF(v_row->>'id','')::uuid, v_action, TG_TABLE_NAME || ' ' || v_action,
    jsonb_strip_nulls(jsonb_build_object(
      'actor_role', public.audit_actor_role(),
      'actor_label', public.current_actor_label(),
      'server_time', now(),
      'parent_table', v_parent, 'parent_id', v_parent_id,
      'amount', COALESCE(v_row->'amount', v_row->'total'),
      'currency', v_row->'currency',
      'status', v_row->'status',
      'diff', CASE WHEN TG_OP='UPDATE' THEN v_diff ELSE NULL END,
      'row', CASE WHEN TG_OP<>'UPDATE' THEN v_row ELSE NULL END
    )),
    auth.uid(), v_tenant
  );
  RETURN COALESCE(NEW, OLD);
END; $$;
REVOKE ALL ON FUNCTION public.audit_trigger_child() FROM anon, authenticated;

-- 4) Cobertura de auditoría faltante (maestros y documentos con tenant_id)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accounting_accounts','accounting_mappings','accounting_periods','fiscal_years',
    'tax_rates','payment_methods','currencies','exchange_rates_history','fiscal_rules',
    'role_permissions','system_settings','product_supplier_costs','data_backups',
    'physical_counts','sale_returns','coupons','invoice_series',
    'shift_cash_movements','bank_transactions','stock_transfer_items','warehouses','stores'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t)
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='tenant_id')
       AND NOT EXISTS (
         SELECT 1 FROM pg_trigger tg JOIN pg_class c ON c.oid=tg.tgrelid JOIN pg_proc p ON p.oid=tg.tgfoid
         WHERE c.relname=t AND p.proname IN ('audit_trigger','universal_audit_trigger') AND NOT tg.tgisinternal)
    THEN
      EXECUTE format('CREATE TRIGGER zz_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()', t);
    END IF;
  END LOOP;
END $$;

-- 5) Auditoría de líneas
DROP TRIGGER IF EXISTS zz_audit_sale_payments ON public.sale_payments;
CREATE TRIGGER zz_audit_sale_payments AFTER INSERT OR UPDATE OR DELETE ON public.sale_payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_child('sales','sale_id');

DROP TRIGGER IF EXISTS zz_audit_sale_items ON public.sale_items;
CREATE TRIGGER zz_audit_sale_items AFTER UPDATE OR DELETE ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_child('sales','sale_id');

DROP TRIGGER IF EXISTS zz_audit_purchase_items ON public.purchase_items;
CREATE TRIGGER zz_audit_purchase_items AFTER UPDATE OR DELETE ON public.purchase_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_child('purchases','purchase_id');

DROP TRIGGER IF EXISTS zz_audit_sale_return_items ON public.sale_return_items;
CREATE TRIGGER zz_audit_sale_return_items AFTER UPDATE OR DELETE ON public.sale_return_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_child('sale_returns','return_id');

-- 6) Inmutabilidad de registros económicos
CREATE OR REPLACE FUNCTION public.guard_append_only_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION '% es un registro inmutable: use una operación compensatoria (reversa, devolución o movimiento contrario) en lugar de % ',
    TG_TABLE_NAME, lower(TG_OP);
END; $$;
REVOKE ALL ON FUNCTION public.guard_append_only_row() FROM anon, authenticated;

DROP TRIGGER IF EXISTS zz_guard_inventory_movements_immutable ON public.inventory_movements;
CREATE TRIGGER zz_guard_inventory_movements_immutable BEFORE UPDATE OR DELETE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.guard_append_only_row();

DROP TRIGGER IF EXISTS zz_guard_shift_cash_movements_immutable ON public.shift_cash_movements;
CREATE TRIGGER zz_guard_shift_cash_movements_immutable BEFORE UPDATE OR DELETE ON public.shift_cash_movements
  FOR EACH ROW EXECUTE FUNCTION public.guard_append_only_row();

CREATE OR REPLACE FUNCTION public.guard_confirmed_sale_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un pago registrado no se elimina: registre una devolución o reversa';
  END IF;
  IF COALESCE(OLD.status,'confirmed') IN ('confirmed','completed','reversed') THEN
    IF NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.method IS DISTINCT FROM OLD.method
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.sale_id IS DISTINCT FROM OLD.sale_id
       OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'reversed') THEN
      RAISE EXCEPTION 'Pago confirmado inmutable: importe, medio, moneda y venta no pueden cambiar';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_confirmed_sale_payment() FROM anon, authenticated;

DROP TRIGGER IF EXISTS zz_guard_sale_payment_immutable ON public.sale_payments;
CREATE TRIGGER zz_guard_sale_payment_immutable BEFORE UPDATE OR DELETE ON public.sale_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_confirmed_sale_payment();

-- 7) Períodos: permisos + auditoría + motivo en reapertura
CREATE OR REPLACE FUNCTION public.can_manage_accounting(_tenant uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (public.is_tenant_member(_tenant) OR _tenant = public.sa_active_tenant())
     AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador')
          OR EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid()))
$$;

CREATE OR REPLACE FUNCTION public.close_accounting_period(p_period uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_period public.accounting_periods%ROWTYPE; v_drafts int; v_gl_count int;
BEGIN
  SELECT * INTO v_period FROM public.accounting_periods WHERE id = p_period;
  IF NOT FOUND THEN RAISE EXCEPTION 'Período no encontrado'; END IF;
  IF NOT public.can_manage_accounting(v_period.tenant_id) THEN
    RAISE EXCEPTION 'Solo administración o contabilidad pueden cerrar períodos';
  END IF;
  IF v_period.status <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_' || v_period.status);
  END IF;

  SELECT count(*) INTO v_drafts FROM public.journal_entries
    WHERE tenant_id = v_period.tenant_id AND status = 'draft'
      AND date BETWEEN v_period.start_date AND v_period.end_date;
  IF v_drafts > 0 THEN RAISE EXCEPTION 'No se puede cerrar: % asientos en borrador', v_drafts; END IF;

  v_gl_count := public.rebuild_general_ledger(v_period.tenant_id, p_period);

  UPDATE public.accounting_periods
    SET status = 'closed', closed_at = now(), closed_by = auth.uid()
    WHERE id = p_period;

  INSERT INTO public.activity_log (entity_type, entity_id, action, description, metadata, performed_by, tenant_id)
  VALUES ('accounting_periods', p_period, 'period_close',
          'Cierre de período ' || v_period.name,
          jsonb_build_object('actor_role', public.audit_actor_role(), 'server_time', now(),
                             'gl_rows', v_gl_count, 'from', v_period.start_date, 'to', v_period.end_date),
          auth.uid(), v_period.tenant_id);

  RETURN jsonb_build_object('ok', true, 'gl_rows', v_gl_count, 'period', v_period.name);
END; $$;

DROP FUNCTION IF EXISTS public.reopen_accounting_period(uuid);
CREATE OR REPLACE FUNCTION public.reopen_accounting_period(p_period_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_period public.accounting_periods%ROWTYPE;
BEGIN
  SELECT * INTO v_period FROM public.accounting_periods WHERE id = p_period_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Período no encontrado'; END IF;
  IF NOT public.can_manage_accounting(v_period.tenant_id) THEN
    RAISE EXCEPTION 'Solo administración o contabilidad pueden reabrir períodos';
  END IF;
  IF COALESCE(btrim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'La reapertura de un período exige un motivo';
  END IF;
  IF v_period.status <> 'closed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_closed');
  END IF;

  UPDATE public.accounting_periods SET status='open', closed_at=NULL, closed_by=NULL WHERE id = p_period_id;

  INSERT INTO public.activity_log (entity_type, entity_id, action, description, metadata, performed_by, tenant_id)
  VALUES ('accounting_periods', p_period_id, 'period_reopen',
          'Reapertura excepcional del período ' || v_period.name,
          jsonb_build_object('actor_role', public.audit_actor_role(), 'server_time', now(),
                             'reason', p_reason, 'previously_closed_at', v_period.closed_at,
                             'previously_closed_by', v_period.closed_by),
          auth.uid(), v_period.tenant_id);

  RETURN jsonb_build_object('ok', true, 'period', v_period.name);
END; $$;
REVOKE ALL ON FUNCTION public.reopen_accounting_period(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reopen_accounting_period(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.close_accounting_period(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_accounting_period(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.can_manage_accounting(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_accounting(uuid) TO authenticated;

-- 8) Panel de excepciones de control interno
CREATE OR REPLACE FUNCTION public.financial_exceptions_report(p_tenant uuid DEFAULT NULL)
RETURNS TABLE (
  code text, severity text, entity_type text, entity_id uuid,
  reference text, amount numeric, occurred_at timestamptz, detail text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid := COALESCE(p_tenant, public.sa_active_tenant());
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Negocio no resuelto'; END IF;
  PERFORM public.assert_tenant_access(v_tenant);

  -- asientos posteados sin documento origen
  RETURN QUERY
  SELECT 'journal_without_source','warning','journal_entries', je.id, je.entry_number, NULL::numeric, je.created_at,
         'Asiento posteado sin referencia a documento origen'
  FROM public.journal_entries je
  WHERE je.tenant_id = v_tenant AND je.status='posted'
    AND (je.reference_type IS NULL OR je.reference_id IS NULL)
    AND COALESCE(je.source_module,'') <> 'manual';

  -- ventas completadas sin asiento
  RETURN QUERY
  SELECT 'sale_without_journal','critical','sales', s.id, s.ticket_number, s.total, s.created_at,
         'Venta completada sin asiento contable'
  FROM public.sales s
  WHERE s.tenant_id = v_tenant AND s.status = 'completed'
    AND NOT EXISTS (SELECT 1 FROM public.journal_entries je
                    WHERE je.tenant_id = s.tenant_id AND je.reference_id = s.id
                      AND je.reference_type LIKE 'sale%' AND je.status='posted');

  -- compras recibidas sin asiento
  RETURN QUERY
  SELECT 'purchase_without_journal','critical','purchases', p.id, p.purchase_number, p.total, p.created_at,
         'Compra recibida sin asiento contable'
  FROM public.purchases p
  WHERE p.tenant_id = v_tenant AND p.status IN ('received','partial','paid')
    AND NOT EXISTS (SELECT 1 FROM public.journal_entries je
                    WHERE je.tenant_id = p.tenant_id AND je.reference_id = p.id
                      AND je.reference_type LIKE 'purchase%' AND je.status='posted');

  -- pagos digitales pendientes antiguos
  RETURN QUERY
  SELECT 'payment_pending_stale','warning','sale_payments', sp.id, sp.reference, sp.amount, sp.created_at,
         'Pago pendiente de confirmación con más de 3 días'
  FROM public.sale_payments sp
  JOIN public.sales s ON s.id = sp.sale_id
  WHERE s.tenant_id = v_tenant AND sp.status = 'pending' AND sp.created_at < now() - interval '3 days';

  -- CxP/CxC inconsistentes
  RETURN QUERY
  SELECT 'payable_inconsistent','critical','accounts_payable', ap.id, ap.description, ap.amount, ap.created_at,
         format('Cobrado/pagado %s excede el importe %s o estado incoherente', ap.amount_paid, ap.amount)
  FROM public.accounts_payable ap
  WHERE ap.tenant_id = v_tenant
    AND (ap.amount_paid > ap.amount + 0.01
         OR (ap.status = 'paid' AND ap.amount_paid < ap.amount - 0.01));

  -- líneas de venta sin costo (COGS)
  RETURN QUERY
  SELECT 'sale_line_without_cost','warning','sale_items', si.id, s.ticket_number, si.total, si.created_at,
         'Línea de venta sin costo unitario: COGS incompleto'
  FROM public.sale_items si
  JOIN public.sales s ON s.id = si.sale_id
  WHERE s.tenant_id = v_tenant AND s.status='completed'
    AND (si.unit_cost IS NULL OR si.unit_cost = 0);

  -- diferencias de caja sin motivo
  RETURN QUERY
  SELECT 'cash_difference_unexplained','critical','sales_shifts', sh.id, sh.store_name, sh.cash_difference, sh.closed_at,
         'Diferencia de caja al cierre sin motivo documentado'
  FROM public.sales_shifts sh
  WHERE sh.tenant_id = v_tenant AND sh.status <> 'open'
    AND COALESCE(abs(sh.cash_difference),0) > 0.01
    AND COALESCE(btrim(sh.notes),'') = '';

  -- documentos duplicados (mismo número)
  RETURN QUERY
  SELECT 'duplicate_document','critical','journal_entries', min(je.id), je.entry_number, NULL::numeric, min(je.created_at),
         format('%s asientos comparten el número %s', count(*), je.entry_number)
  FROM public.journal_entries je
  WHERE je.tenant_id = v_tenant AND je.entry_number IS NOT NULL
  GROUP BY je.entry_number HAVING count(*) > 1;

  RETURN QUERY
  SELECT 'duplicate_document','critical','invoices', min(i.id), i.invoice_number, NULL::numeric, min(i.created_at),
         format('%s facturas comparten serie/número %s', count(*), i.invoice_number)
  FROM public.invoices i
  WHERE i.tenant_id = v_tenant AND i.invoice_number IS NOT NULL
  GROUP BY i.series_code, i.invoice_number HAVING count(*) > 1;

  -- reversas y ajustes manuales (informativo, requieren revisión)
  RETURN QUERY
  SELECT 'journal_reversed','info','journal_entries', je.id, je.entry_number, NULL::numeric, je.created_at,
         'Asiento reversado: revise la causa de la corrección'
  FROM public.journal_entries je
  WHERE je.tenant_id = v_tenant AND (je.reverses IS NOT NULL OR je.reversed_by IS NOT NULL);

  RETURN QUERY
  SELECT 'period_reopened','warning','accounting_periods', al.entity_id, al.description, NULL::numeric, al.created_at,
         COALESCE(al.metadata->>'reason','Reapertura sin motivo registrado')
  FROM public.activity_log al
  WHERE al.tenant_id = v_tenant AND al.action = 'period_reopen';

  -- conciliación bancaria fallida / pendiente antigua
  RETURN QUERY
  SELECT 'bank_unmatched','warning','bank_transactions', bt.id, bt.reference, bt.amount, bt.created_at,
         'Movimiento bancario sin conciliar con más de 7 días'
  FROM public.bank_transactions bt
  WHERE bt.tenant_id = v_tenant AND COALESCE(bt.status,'pending') IN ('pending','unmatched','mismatch')
    AND bt.transaction_date < current_date - 7;
END; $$;
REVOKE ALL ON FUNCTION public.financial_exceptions_report(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.financial_exceptions_report(uuid) TO authenticated;

-- 9) shift_cash_movements: quitar ALL de superadmin (append-only real)
DROP POLICY IF EXISTS "Superadmin all shift_cash_movements" ON public.shift_cash_movements;
CREATE POLICY "Superadmin view shift_cash_movements" ON public.shift_cash_movements
  FOR SELECT TO authenticated USING (tenant_id = public.sa_active_tenant());
CREATE POLICY "Superadmin insert shift_cash_movements" ON public.shift_cash_movements
  FOR INSERT TO authenticated WITH CHECK (tenant_id = public.sa_active_tenant());
