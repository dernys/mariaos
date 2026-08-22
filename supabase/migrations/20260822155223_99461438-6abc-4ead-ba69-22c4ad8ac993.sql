-- 1) Validación estricta del administrador de un negocio
CREATE OR REPLACE FUNCTION public.validate_business_admin(p_tenant uuid, p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_auth boolean; v_profile boolean; v_member boolean;
  v_owner boolean; v_role boolean; v_other int;
BEGIN
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user) INTO v_auth;
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_user) INTO v_profile;
  SELECT EXISTS (SELECT 1 FROM public.tenant_users WHERE tenant_id = p_tenant AND user_id = p_user) INTO v_member;
  SELECT EXISTS (SELECT 1 FROM public.tenant_users WHERE tenant_id = p_tenant AND user_id = p_user AND is_owner) INTO v_owner;
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user AND role = 'admin') INTO v_role;
  SELECT count(*) INTO v_other FROM public.tenant_users WHERE user_id = p_user AND tenant_id <> p_tenant;

  RETURN jsonb_build_object(
    'user_id', p_user,
    'auth_user', v_auth,
    'profile', v_profile,
    'membership', v_member,
    'is_owner', v_owner,
    'admin_role', v_role,
    'other_tenants', v_other,
    'isolated', v_other = 0,
    'ok', v_auth AND v_profile AND v_member AND v_owner AND v_role AND v_other = 0);
END;
$$;

REVOKE ALL ON FUNCTION public.validate_business_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_business_admin(uuid, uuid) TO service_role;

-- 2) Readiness: el check 'admin' se vuelve estricto
CREATE OR REPLACE FUNCTION public.validate_business_readiness(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_checks jsonb := '[]'::jsonb;
  v_missing text[] := '{}';
  v_key text;
  v_acc uuid;
  v_debit numeric; v_credit numeric;
  v_cross int; v_hist int;
  v_ready boolean;
  v_admin uuid; v_admin_report jsonb;
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

  -- Administrador: verificación estricta (auth + perfil + membresía + rol + propiedad + aislamiento)
  SELECT user_id INTO v_admin
    FROM public.tenant_users
   WHERE tenant_id = p_tenant
   ORDER BY is_owner DESC, created_at
   LIMIT 1;

  IF v_admin IS NULL THEN
    v_checks := v_checks || jsonb_build_object(
      'key','admin','label','Administrador asignado',
      'pass', false, 'detail', 'Sin administrador asignado');
  ELSE
    v_admin_report := public.validate_business_admin(p_tenant, v_admin);
    v_checks := v_checks || jsonb_build_object(
      'key','admin','label','Administrador asignado',
      'pass', (v_admin_report->>'ok')::boolean,
      'detail', CASE WHEN (v_admin_report->>'ok')::boolean
                     THEN 'Administrador con rol admin, propietario y aislado'
                     ELSE format('perfil=%s membresía=%s propietario=%s rol_admin=%s otros_negocios=%s',
                          v_admin_report->>'profile', v_admin_report->>'membership',
                          v_admin_report->>'is_owner', v_admin_report->>'admin_role',
                          v_admin_report->>'other_tenants') END,
      'admin', v_admin_report);
  END IF;

  SELECT bool_and((c->>'pass')::boolean) INTO v_ready
    FROM jsonb_array_elements(v_checks) c;

  RETURN jsonb_build_object(
    'tenant_id', p_tenant,
    'ready', COALESCE(v_ready, false),
    'missing_mappings', to_jsonb(v_missing),
    'checks', v_checks);
END;
$$;

-- 3) create_business_from_template: administrador obligatorio cuando se solicita
CREATE OR REPLACE FUNCTION public.create_business_from_template(p_template_code text, p_payload jsonb, p_admin_user_id uuid DEFAULT NULL::uuid, p_actor_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := COALESCE(auth.uid(), p_actor_user_id);
  v_tpl public.business_templates;
  v_cfg jsonb; v_ops jsonb; v_tenant uuid; v_store uuid; v_wh uuid;
  v_slug text; v_name text; v_biz text; v_country text;
  v_existing uuid; v_item jsonb; v_first boolean := true;
  v_report jsonb; v_maps int; v_boot jsonb; v_tax record;
  v_primary_currency text;
  v_admin_report jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.is_superadmin(v_actor) THEN
    RAISE EXCEPTION 'forbidden: solo un superadministrador puede crear negocios';
  END IF;

  SELECT * INTO v_tpl FROM public.business_templates
   WHERE code = p_template_code AND is_active;
  IF v_tpl IS NULL THEN
    RAISE EXCEPTION 'BUSINESS_TEMPLATE_UNKNOWN: plantilla "%" inexistente o inactiva', p_template_code;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT result_id INTO v_existing FROM public.operation_idempotency
     WHERE operation = 'create_business' AND idempotency_key = p_idempotency_key;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('tenant_id', v_existing, 'idempotent', true,
                                'validation', public.validate_business_readiness(v_existing));
    END IF;
  END IF;

  v_cfg  := COALESCE(v_tpl.config, '{}'::jsonb);
  v_ops  := COALESCE(p_payload->'operations', '{}'::jsonb);
  v_name := NULLIF(trim(p_payload->>'name'), '');
  v_slug := lower(regexp_replace(COALESCE(NULLIF(trim(p_payload->>'slug'),''), v_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  v_biz  := COALESCE(NULLIF(p_payload->>'business_type',''), v_tpl.business_type);
  v_country := COALESCE(NULLIF(p_payload->>'country_code',''), v_tpl.default_country_code);

  IF v_name IS NULL OR v_slug IS NULL OR v_slug = '' THEN
    RAISE EXCEPTION 'BUSINESS_INVALID_INPUT: nombre e identificador son obligatorios';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'BUSINESS_SLUG_TAKEN: el identificador "%" ya está en uso', v_slug;
  END IF;

  -- Validación temprana del administrador (antes de crear nada)
  IF p_admin_user_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_admin_user_id) THEN
      RAISE EXCEPTION 'BUSINESS_ADMIN_NOT_FOUND: el usuario administrador no existe en Auth';
    END IF;
    IF public.is_superadmin(p_admin_user_id) THEN
      RAISE EXCEPTION 'BUSINESS_ADMIN_INVALID: no se puede asignar un superadministrador como administrador del negocio';
    END IF;
    IF EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = p_admin_user_id) THEN
      RAISE EXCEPTION 'BUSINESS_ADMIN_REUSED: el usuario ya pertenece a otro negocio';
    END IF;
  END IF;

  INSERT INTO public.tenants (name, slug, email, phone, address, rfc, business_type,
                              country_code, accounting_profile_code, default_locale, is_active, is_demo)
  VALUES (v_name, v_slug, NULLIF(p_payload->>'email',''), NULLIF(p_payload->>'phone',''),
          NULLIF(p_payload->>'address',''), NULLIF(p_payload->>'rfc',''), v_biz, v_country,
          COALESCE(NULLIF(p_payload->>'accounting_profile_code',''), v_tpl.accounting_profile_code),
          COALESCE(NULLIF(p_payload->>'locale',''), 'es'), true, false)
  RETURNING id INTO v_tenant;

  PERFORM set_config('maria.provisioning_tenant', v_tenant::text, true);

  INSERT INTO public.module_settings (tenant_id, module, settings)
  VALUES (v_tenant, 'modules', jsonb_build_object(
            'enabled', COALESCE(v_cfg->'modules', '[]'::jsonb),
            'operations', v_ops,
            'template', v_tpl.code))
  ON CONFLICT (tenant_id, module) DO UPDATE SET settings = EXCLUDED.settings;

  INSERT INTO public.module_settings (tenant_id, module, settings)
  SELECT v_tenant, m.key, m.value
    FROM jsonb_each(COALESCE(v_cfg->'module_settings', '{}'::jsonb)) m
  ON CONFLICT (tenant_id, module) DO UPDATE SET settings = EXCLUDED.settings;

  INSERT INTO public.stores (tenant_id, name, address, phone, email, is_active, accepts_delivery, accepts_pickup, store_type)
  VALUES (v_tenant,
          COALESCE(NULLIF(p_payload#>>'{store,name}',''), v_name),
          COALESCE(NULLIF(p_payload#>>'{store,address}',''), NULLIF(p_payload->>'address','')),
          COALESCE(NULLIF(p_payload#>>'{store,phone}',''), NULLIF(p_payload->>'phone','')),
          NULLIF(p_payload->>'email',''), true,
          COALESCE((v_ops->>'delivery')::boolean, false), true,
          COALESCE(v_cfg->>'store_type', 'principal'))
  RETURNING id INTO v_store;

  FOR v_item IN
    SELECT * FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_payload->'warehouses') = 'array' AND jsonb_array_length(p_payload->'warehouses') > 0
           THEN p_payload->'warehouses'
           ELSE COALESCE(v_cfg->'warehouses', '[{"name":"Almacén principal","warehouse_type":"general"}]'::jsonb) END)
  LOOP
    INSERT INTO public.warehouses (tenant_id, name, location, warehouse_type, is_active)
    VALUES (v_tenant, COALESCE(NULLIF(v_item->>'name',''), 'Almacén'),
            NULLIF(v_item->>'location',''), COALESCE(NULLIF(v_item->>'warehouse_type',''), 'general'), true)
    RETURNING id INTO v_wh;

    INSERT INTO public.warehouse_stores (tenant_id, warehouse_id, store_id, is_primary)
    VALUES (v_tenant, v_wh, v_store, v_first);
    v_first := false;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_cfg->'currencies', '[]'::jsonb)) LOOP
    INSERT INTO public.currencies (tenant_id, code, name, symbol, exchange_rate, is_base, is_active)
    VALUES (v_tenant, v_item->>'code', v_item->>'name', v_item->>'symbol',
            COALESCE((v_item->>'exchange_rate')::numeric, 1),
            COALESCE((v_item->>'is_base')::boolean, false), true)
    ON CONFLICT DO NOTHING;
    IF COALESCE((v_item->>'is_base')::boolean, false) THEN
      v_primary_currency := v_item->>'code';
    END IF;
  END LOOP;

  FOR v_item IN
    SELECT * FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_payload->'payment_methods') = 'array' AND jsonb_array_length(p_payload->'payment_methods') > 0
           THEN p_payload->'payment_methods'
           ELSE COALESCE(v_cfg->'payment_methods', '[]'::jsonb) END)
  LOOP
    INSERT INTO public.payment_methods (tenant_id, name, type, requires_card_info, is_active)
    VALUES (v_tenant, COALESCE(NULLIF(v_item->>'name',''), v_item->>'type'),
            v_item->>'type', COALESCE((v_item->>'requires_card_info')::boolean, false), true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_cfg->'units', '[]'::jsonb)) LOOP
    INSERT INTO public.units_of_measure (tenant_id, code, name, decimals, factor, is_default, is_active)
    VALUES (v_tenant, v_item->>'code', v_item->>'name',
            COALESCE((v_item->>'decimals')::int, 2), COALESCE((v_item->>'factor')::numeric, 1),
            COALESCE((v_item->>'is_default')::boolean, false), true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_cfg->'categories', '[]'::jsonb)) LOOP
    INSERT INTO public.product_categories (tenant_id, name, color, is_active)
    VALUES (v_tenant, v_item->>'name', NULLIF(v_item->>'color',''), true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  v_boot := public.bootstrap_tenant_accounting(v_tenant);

  FOR v_tax IN
    SELECT * FROM public.tax_templates
     WHERE profile_code = COALESCE(NULLIF(p_payload->>'accounting_profile_code',''), v_tpl.accounting_profile_code)
  LOOP
    INSERT INTO public.tax_rates (tenant_id, code, name, rate, is_active, is_default)
    VALUES (v_tenant, v_tax.code, v_tax.name, v_tax.rate, true, false)
    ON CONFLICT DO NOTHING;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_cfg->'taxes', '[]'::jsonb)) LOOP
    INSERT INTO public.tax_rates (tenant_id, code, name, rate, is_active, is_default)
    VALUES (v_tenant, NULLIF(v_item->>'code',''), v_item->>'name',
            COALESCE((v_item->>'rate')::numeric, 0), true,
            COALESCE((v_item->>'is_default')::boolean, false))
    ON CONFLICT DO NOTHING;
  END LOOP;

  v_maps := public.sync_accounting_mappings(v_tenant);

  PERFORM public.ensure_pos_settings(v_tenant);
  UPDATE public.pos_settings SET
    tax_included        = COALESCE((p_payload#>>'{pos,tax_included}')::boolean, (v_cfg#>>'{pos,tax_included}')::boolean, tax_included),
    tip_enabled         = COALESCE((p_payload#>>'{pos,tip_enabled}')::boolean, (v_cfg#>>'{pos,tip_enabled}')::boolean, tip_enabled),
    allow_negative_stock= COALESCE((p_payload#>>'{pos,allow_negative_stock}')::boolean, (v_cfg#>>'{pos,allow_negative_stock}')::boolean, allow_negative_stock),
    allow_discounts     = COALESCE((v_cfg#>>'{pos,allow_discounts}')::boolean, allow_discounts),
    default_credit_days = COALESCE((p_payload#>>'{pos,default_credit_days}')::int, (v_cfg#>>'{pos,default_credit_days}')::int, default_credit_days),
    default_currency    = COALESCE(NULLIF(p_payload#>>'{pos,default_currency}',''), v_primary_currency, default_currency),
    default_tax_rate_id = COALESCE(default_tax_rate_id,
                            (SELECT id FROM public.tax_rates WHERE tenant_id = v_tenant AND is_default ORDER BY created_at LIMIT 1)),
    updated_at = now()
  WHERE tenant_id = v_tenant;

  IF COALESCE((v_ops->>'tables')::boolean, false) THEN
    INSERT INTO public.restaurant_tables (tenant_id, name, capacity, status, position_x, position_y)
    SELECT v_tenant, 'Mesa ' || g, COALESCE((v_ops->>'table_capacity')::int, 4), 'available',
           ((g - 1) % 4) * 120, ((g - 1) / 4) * 120
      FROM generate_series(1, LEAST(GREATEST(COALESCE((v_ops->>'tables_count')::int, 8), 1), 40)) g;
  END IF;

  IF COALESCE((v_ops->>'loyalty')::boolean, false) THEN
    INSERT INTO public.loyalty_settings (tenant_id, enabled) VALUES (v_tenant, true) ON CONFLICT DO NOTHING;
  END IF;

  IF COALESCE((v_ops->>'delivery')::boolean, false) THEN
    INSERT INTO public.delivery_zones (tenant_id, name, fee, estimated_minutes, is_active)
    VALUES (v_tenant, 'Zona local', 0, 30, true) ON CONFLICT DO NOTHING;
  END IF;

  IF p_admin_user_id IS NOT NULL THEN
    INSERT INTO public.tenant_users (tenant_id, user_id, is_owner)
    VALUES (v_tenant, p_admin_user_id, true)
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET is_owner = true;

    INSERT INTO public.user_roles (user_id, role) VALUES (p_admin_user_id, 'admin')
    ON CONFLICT DO NOTHING;

    -- El perfil es obligatorio para el login: se crea si falta
    INSERT INTO public.profiles (user_id, full_name)
    SELECT p_admin_user_id, COALESCE(u.raw_user_meta_data->>'full_name', u.email)
      FROM auth.users u WHERE u.id = p_admin_user_id
    ON CONFLICT (user_id) DO NOTHING;

    v_admin_report := public.validate_business_admin(v_tenant, p_admin_user_id);
    IF NOT (v_admin_report->>'ok')::boolean THEN
      RAISE EXCEPTION 'BUSINESS_ADMIN_FAILED: administrador incompleto %', v_admin_report::text;
    END IF;
  END IF;

  INSERT INTO public.activity_log (tenant_id, performed_by, action, entity_type, entity_id, description, metadata)
  VALUES (v_tenant, v_actor, 'business_created', 'tenant', v_tenant,
          format('Negocio "%s" creado desde plantilla %s', v_name, v_tpl.code),
          jsonb_build_object('template', v_tpl.code, 'accounting', v_boot,
                             'mappings', v_maps, 'store_id', v_store,
                             'admin_user_id', p_admin_user_id,
                             'admin_validation', v_admin_report, 'payload', p_payload));

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.operation_idempotency (tenant_id, operation, idempotency_key, result_id, user_id)
    VALUES (v_tenant, 'create_business', p_idempotency_key, v_tenant, v_actor)
    ON CONFLICT DO NOTHING;
  END IF;

  v_report := public.validate_business_readiness(v_tenant);

  IF NOT (v_report->>'ready')::boolean THEN
    DECLARE v_failed text;
    BEGIN
      SELECT string_agg(c->>'key' || ': ' || (c->>'detail'), ' | ')
        INTO v_failed
        FROM jsonb_array_elements(v_report->'checks') c
       WHERE (c->>'pass')::boolean = false
         AND NOT (c->>'key' = 'admin' AND p_admin_user_id IS NULL);
      IF v_failed IS NOT NULL THEN
        RAISE EXCEPTION 'BUSINESS_PROVISIONING_FAILED: %', v_failed;
      END IF;
    END;
  END IF;

  RETURN jsonb_build_object('tenant_id', v_tenant, 'slug', v_slug, 'template', v_tpl.code,
                            'admin_user_id', p_admin_user_id, 'admin_validation', v_admin_report,
                            'idempotent', false, 'validation', v_report);
END;
$function$;

-- 4) Rollback total de un negocio recién provisionado (sin operaciones)
CREATE OR REPLACE FUNCTION public.rollback_business_provisioning(p_tenant uuid, p_idempotency_key text DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_ops int;
BEGIN
  SELECT (SELECT count(*) FROM public.sales WHERE tenant_id = p_tenant)
       + (SELECT count(*) FROM public.purchases WHERE tenant_id = p_tenant)
       + (SELECT count(*) FROM public.inventory_movements WHERE tenant_id = p_tenant)
    INTO v_ops;
  IF v_ops > 0 THEN
    RAISE EXCEPTION 'ROLLBACK_REFUSED: el negocio ya tiene % operaciones', v_ops;
  END IF;

  PERFORM set_config('maria.provisioning_tenant', p_tenant::text, true);

  DELETE FROM public.operation_idempotency
   WHERE operation = 'create_business'
     AND (p_idempotency_key IS NULL OR idempotency_key = p_idempotency_key)
     AND result_id = p_tenant;

  DELETE FROM public.journal_entry_lines l USING public.journal_entries e
   WHERE l.entry_id = e.id AND e.tenant_id = p_tenant;
  DELETE FROM public.journal_entries WHERE tenant_id = p_tenant;
  DELETE FROM public.accounting_mappings WHERE tenant_id = p_tenant;
  DELETE FROM public.accounting_accounts WHERE tenant_id = p_tenant;
  DELETE FROM public.online_orders WHERE tenant_id = p_tenant;
  DELETE FROM public.kitchen_orders WHERE tenant_id = p_tenant;
  DELETE FROM public.restaurant_tables WHERE tenant_id = p_tenant;
  DELETE FROM public.product_recipes WHERE tenant_id = p_tenant;
  DELETE FROM public.products WHERE tenant_id = p_tenant;
  DELETE FROM public.product_categories WHERE tenant_id = p_tenant;
  DELETE FROM public.warehouse_stores WHERE tenant_id = p_tenant;
  DELETE FROM public.warehouses WHERE tenant_id = p_tenant;
  DELETE FROM public.sales_shifts WHERE tenant_id = p_tenant;
  DELETE FROM public.stores WHERE tenant_id = p_tenant;
  DELETE FROM public.payment_methods WHERE tenant_id = p_tenant;
  DELETE FROM public.currencies WHERE tenant_id = p_tenant;
  DELETE FROM public.tax_rates WHERE tenant_id = p_tenant;
  DELETE FROM public.system_settings WHERE tenant_id = p_tenant;
  DELETE FROM public.activity_log WHERE tenant_id = p_tenant;
  DELETE FROM public.tenants WHERE id = p_tenant;

  RETURN jsonb_build_object('rolled_back', true, 'tenant_id', p_tenant, 'reason', p_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_business_provisioning(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_business_provisioning(uuid, text, text) TO service_role;