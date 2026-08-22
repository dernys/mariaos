CREATE OR REPLACE FUNCTION public.required_business_mapping_keys()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY[
    'sale_revenue','sale_cash','sale_receivable','sale_tax_payable',
    'inventory','cogs',
    'purchase_inventory','purchase_payable',
    'payment_cash','expense_general'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.validate_business_readiness(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_checks jsonb := '[]'::jsonb;
  v_missing text[] := '{}';
  v_key text;
  v_acc uuid;
  v_debit numeric; v_credit numeric;
  v_cross int; v_hist int;
  v_ready boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant) THEN
    RAISE EXCEPTION 'BUSINESS_NOT_FOUND';
  END IF;

  v_checks := v_checks || jsonb_build_object(
    'key','structure','label','Local y almacenes',
    'pass', EXISTS (SELECT 1 FROM public.stores WHERE tenant_id = p_tenant)
        AND EXISTS (SELECT 1 FROM public.warehouses WHERE tenant_id = p_tenant)
        AND EXISTS (SELECT 1 FROM public.warehouse_stores WHERE tenant_id = p_tenant),
    'detail', format('%s locales, %s almacenes',
      (SELECT count(*) FROM public.stores WHERE tenant_id = p_tenant),
      (SELECT count(*) FROM public.warehouses WHERE tenant_id = p_tenant)));

  v_checks := v_checks || jsonb_build_object(
    'key','payments','label','Monedas y medios de pago',
    'pass', EXISTS (SELECT 1 FROM public.payment_methods WHERE tenant_id = p_tenant AND is_active)
        AND EXISTS (SELECT 1 FROM public.currencies WHERE tenant_id = p_tenant AND is_base),
    'detail', format('%s medios de pago',
      (SELECT count(*) FROM public.payment_methods WHERE tenant_id = p_tenant)));

  v_checks := v_checks || jsonb_build_object(
    'key','chart','label','Maestro de cuentas propio',
    'pass', (SELECT count(*) FROM public.accounting_accounts WHERE tenant_id = p_tenant) > 10
        AND EXISTS (SELECT 1 FROM public.accounting_periods WHERE tenant_id = p_tenant),
    'detail', format('%s cuentas, %s períodos',
      (SELECT count(*) FROM public.accounting_accounts WHERE tenant_id = p_tenant),
      (SELECT count(*) FROM public.accounting_periods WHERE tenant_id = p_tenant)));

  FOREACH v_key IN ARRAY public.required_business_mapping_keys()
  LOOP
    SELECT account_id INTO v_acc
      FROM public.accounting_mappings
     WHERE tenant_id = p_tenant AND mapping_key = v_key AND is_active
     LIMIT 1;
    IF v_acc IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.accounting_accounts
       WHERE id = v_acc AND tenant_id = p_tenant AND is_active AND is_postable
    ) THEN
      v_missing := v_missing || v_key;
    END IF;
  END LOOP;

  v_checks := v_checks || jsonb_build_object(
    'key','mappings','label','Mapeo contable obligatorio',
    'pass', array_length(v_missing,1) IS NULL,
    'detail', COALESCE('Faltan: ' || array_to_string(v_missing, ', '), 'Todas las claves obligatorias resueltas'));

  SELECT count(*) INTO v_cross
    FROM public.accounting_mappings m
    JOIN public.accounting_accounts a ON a.id = m.account_id
   WHERE m.tenant_id = p_tenant AND a.tenant_id <> p_tenant;

  v_checks := v_checks || jsonb_build_object(
    'key','isolation','label','Aislamiento contable',
    'pass', v_cross = 0,
    'detail', format('%s referencias a cuentas de otro negocio', v_cross));

  SELECT COALESCE(sum(l.debit),0), COALESCE(sum(l.credit),0)
    INTO v_debit, v_credit
    FROM public.journal_entry_lines l
    JOIN public.journal_entries e ON e.id = l.entry_id
   WHERE e.tenant_id = p_tenant;

  v_checks := v_checks || jsonb_build_object(
    'key','balance','label','Partida doble (DEBE = HABER)',
    'pass', round(v_debit,2) = round(v_credit,2),
    'detail', format('Debe %s / Haber %s', round(v_debit,2), round(v_credit,2)));

  SELECT (SELECT count(*) FROM public.sales WHERE tenant_id = p_tenant)
       + (SELECT count(*) FROM public.purchases WHERE tenant_id = p_tenant)
       + (SELECT count(*) FROM public.inventory_movements WHERE tenant_id = p_tenant)
    INTO v_hist;

  v_checks := v_checks || jsonb_build_object(
    'key','clean_start','label','Historial en cero',
    'pass', v_hist = 0,
    'detail', format('%s operaciones históricas', v_hist));

  v_checks := v_checks || jsonb_build_object(
    'key','admin','label','Administrador asignado',
    'pass', EXISTS (SELECT 1 FROM public.tenant_users WHERE tenant_id = p_tenant),
    'detail', format('%s usuarios', (SELECT count(*) FROM public.tenant_users WHERE tenant_id = p_tenant)));

  SELECT bool_and((c->>'pass')::boolean) INTO v_ready
    FROM jsonb_array_elements(v_checks) c;

  RETURN jsonb_build_object(
    'tenant_id', p_tenant,
    'ready', COALESCE(v_ready, false),
    'missing_mappings', to_jsonb(v_missing),
    'checks', v_checks);
END;
$$;

REVOKE ALL ON FUNCTION public.validate_business_readiness(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.required_business_mapping_keys() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_business_readiness(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.required_business_mapping_keys() TO authenticated, service_role;