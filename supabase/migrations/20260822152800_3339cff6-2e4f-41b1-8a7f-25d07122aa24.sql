-- =====================================================================
-- BUSINESS SETUP WIZARD — plantillas de negocio + provisionamiento
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.business_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  business_type text NOT NULL,
  name text NOT NULL,
  description text,
  icon text,
  accounting_profile_code text NOT NULL DEFAULT 'CU-MIPYME',
  default_country_code text NOT NULL DEFAULT 'CU',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  required_mapping_keys text[] NOT NULL DEFAULT ARRAY[
    'sale_revenue','sale_cash','sale_receivable','cogs','inventory',
    'purchase_inventory','purchase_payable','payment_cash','expense_general',
    'payroll_expense','payroll_liability','cash_short','cash_over'
  ],
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.business_templates TO authenticated;
GRANT ALL ON public.business_templates TO service_role;

ALTER TABLE public.business_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business_templates_read" ON public.business_templates;
CREATE POLICY "business_templates_read" ON public.business_templates
  FOR SELECT TO authenticated USING (is_active);

DROP TRIGGER IF EXISTS trg_business_templates_updated ON public.business_templates;
CREATE TRIGGER trg_business_templates_updated
  BEFORE UPDATE ON public.business_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- Ventana de provisionamiento: permite que las funciones de bootstrap
-- (que exigen pertenencia al tenant) operen sobre el tenant que se está
-- creando dentro de la MISMA transacción. El flag es LOCAL (set_config
-- con is_local = true) y solo lo fija create_business_from_template.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_tenant_access(_tenant uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN true;
  END IF;
  IF public.sa_global_mode() THEN
    RETURN true;
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'forbidden: missing tenant scope';
  END IF;
  -- Provisionamiento en curso del propio tenant (transaccional, no persiste)
  IF _tenant = NULLIF(current_setting('maria.provisioning_tenant', true), '')::uuid THEN
    RETURN true;
  END IF;
  IF public.is_tenant_member(_tenant) THEN
    RETURN true;
  END IF;
  RAISE EXCEPTION 'forbidden: tenant scope violation';
END;
$$;

-- ---------------------------------------------------------------------
-- Validación post-creación (reutilizable por la UI)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_business_readiness(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t record; v_checks jsonb := '[]'::jsonb; v_missing text[] := '{}';
  v_key record; v_acc uuid; v_ok boolean;
  v_stores int; v_wh int; v_links int; v_accounts int; v_maps int;
  v_ops int; v_debit numeric; v_credit numeric; v_admin int; v_audit int;
  v_cross int; v_mods int;
  fn_add text;
BEGIN
  SELECT * INTO v_t FROM public.tenants WHERE id = p_tenant;
  IF v_t IS NULL THEN
    RETURN jsonb_build_object('ready', false, 'checks',
      jsonb_build_array(jsonb_build_object('key','tenant','pass',false,'detail','Negocio inexistente')));
  END IF;

  SELECT count(*) INTO v_stores FROM public.stores WHERE tenant_id = p_tenant;
  SELECT count(*) INTO v_wh FROM public.warehouses WHERE tenant_id = p_tenant;
  SELECT count(*) INTO v_links FROM public.warehouse_stores WHERE tenant_id = p_tenant;
  SELECT count(*) INTO v_accounts FROM public.accounting_accounts
    WHERE tenant_id = p_tenant AND is_postable AND COALESCE(is_active, true);
  SELECT count(*) INTO v_maps FROM public.accounting_mappings
    WHERE tenant_id = p_tenant AND COALESCE(is_active, true);
  SELECT count(*) INTO v_mods FROM public.module_settings WHERE tenant_id = p_tenant;

  -- Mappings que apuntan a cuentas de otro negocio (nunca debe ocurrir)
  SELECT count(*) INTO v_cross
    FROM public.accounting_mappings m
    LEFT JOIN public.accounting_accounts a ON a.id = m.account_id
   WHERE m.tenant_id = p_tenant AND (a.id IS NULL OR a.tenant_id <> p_tenant);

  -- Todas las claves del catálogo deben resolver (fail-closed real)
  FOR v_key IN SELECT mapping_key FROM public.accounting_mapping_catalog() LOOP
    BEGIN
      v_acc := public.resolve_account_strict(p_tenant, v_key.mapping_key, 'validation', 'readiness');
      IF v_acc IS NULL THEN v_missing := v_missing || v_key.mapping_key; END IF;
    EXCEPTION WHEN OTHERS THEN
      v_missing := v_missing || v_key.mapping_key;
    END;
  END LOOP;

  SELECT count(*) INTO v_admin
    FROM public.tenant_users tu
    JOIN public.user_roles ur ON ur.user_id = tu.user_id AND ur.role = 'admin'
   WHERE tu.tenant_id = p_tenant;

  SELECT
    (SELECT count(*) FROM public.sales WHERE tenant_id = p_tenant)
  + (SELECT count(*) FROM public.purchases WHERE tenant_id = p_tenant)
  + (SELECT count(*) FROM public.sale_payments sp JOIN public.sales s ON s.id = sp.sale_id WHERE s.tenant_id = p_tenant)
  + (SELECT count(*) FROM public.sales_shifts WHERE tenant_id = p_tenant)
  + (SELECT count(*) FROM public.inventory_movements WHERE tenant_id = p_tenant)
  + (SELECT count(*) FROM public.journal_entries WHERE tenant_id = p_tenant)
  INTO v_ops;

  SELECT COALESCE(sum(l.debit),0), COALESCE(sum(l.credit),0)
    INTO v_debit, v_credit
    FROM public.journal_entry_lines l
    JOIN public.journal_entries e ON e.id = l.journal_entry_id
   WHERE e.tenant_id = p_tenant;

  SELECT count(*) INTO v_audit FROM public.activity_log
   WHERE tenant_id = p_tenant AND action IN ('business_created', 'business_provisioned');

  v_checks := jsonb_build_array(
    jsonb_build_object('key','config','pass', v_t.is_active AND length(COALESCE(v_t.name,'')) > 0 AND length(COALESCE(v_t.slug,'')) > 0,
      'detail', format('%s (%s)', v_t.name, v_t.business_type)),
    jsonb_build_object('key','modules','pass', v_mods > 0, 'detail', format('%s módulos configurados', v_mods)),
    jsonb_build_object('key','store','pass', v_stores > 0, 'detail', format('%s local(es)', v_stores)),
    jsonb_build_object('key','warehouse','pass', v_wh > 0 AND v_links > 0, 'detail', format('%s almacén(es), %s vínculo(s)', v_wh, v_links)),
    jsonb_build_object('key','accounts','pass', v_accounts > 0, 'detail', format('%s cuentas imputables propias', v_accounts)),
    jsonb_build_object('key','mappings','pass', v_maps > 0 AND array_length(v_missing,1) IS NULL,
      'detail', CASE WHEN array_length(v_missing,1) IS NULL THEN format('%s mappings, catálogo completo', v_maps)
                     ELSE 'Sin resolver: ' || array_to_string(v_missing, ', ') END),
    jsonb_build_object('key','resolver','pass', array_length(v_missing,1) IS NULL, 'detail','resolve_account_strict operativo'),
    jsonb_build_object('key','isolation','pass', v_cross = 0, 'detail', format('%s referencias cross-tenant', v_cross)),
    jsonb_build_object('key','admin','pass', v_admin > 0, 'detail', format('%s administrador(es)', v_admin)),
    jsonb_build_object('key','clean_start','pass', v_ops = 0, 'detail', format('%s operaciones históricas', v_ops)),
    jsonb_build_object('key','balance','pass', v_debit = v_credit, 'detail', format('DEBE %s = HABER %s', v_debit, v_credit)),
    jsonb_build_object('key','audit','pass', v_audit > 0, 'detail', format('%s registro(s) de auditoría', v_audit))
  );

  SELECT bool_and((c->>'pass')::boolean) INTO v_ok
    FROM jsonb_array_elements(v_checks) c;

  RETURN jsonb_build_object('ready', COALESCE(v_ok,false), 'tenant_id', p_tenant,
                            'missing_mappings', to_jsonb(v_missing), 'checks', v_checks);
END;
$$;

REVOKE ALL ON FUNCTION public.validate_business_readiness(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_business_readiness(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Provisionamiento único, transaccional e idempotente
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_business_from_template(
  p_template_code text,
  p_payload jsonb,
  p_admin_user_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := COALESCE(auth.uid(), p_actor_user_id);
  v_tpl public.business_templates;
  v_cfg jsonb; v_ops jsonb; v_tenant uuid; v_store uuid; v_wh uuid;
  v_slug text; v_name text; v_biz text; v_country text;
  v_existing uuid; v_item jsonb; v_first boolean := true;
  v_report jsonb; v_maps int; v_boot jsonb; v_tax record;
  v_primary_currency text;
BEGIN
  IF v_actor IS NULL OR NOT public.is_superadmin(v_actor) THEN
    RAISE EXCEPTION 'forbidden: solo un superadministrador puede crear negocios';
  END IF;

  SELECT * INTO v_tpl FROM public.business_templates
   WHERE code = p_template_code AND is_active;
  IF v_tpl IS NULL THEN
    RAISE EXCEPTION 'BUSINESS_TEMPLATE_UNKNOWN: plantilla "%" inexistente o inactiva', p_template_code;
  END IF;

  -- Idempotencia
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

  -- 1. Tenant
  INSERT INTO public.tenants (name, slug, email, phone, address, rfc, business_type,
                              country_code, accounting_profile_code, default_locale, is_active, is_demo)
  VALUES (v_name, v_slug, NULLIF(p_payload->>'email',''), NULLIF(p_payload->>'phone',''),
          NULLIF(p_payload->>'address',''), NULLIF(p_payload->>'rfc',''), v_biz, v_country,
          COALESCE(NULLIF(p_payload->>'accounting_profile_code',''), v_tpl.accounting_profile_code),
          COALESCE(NULLIF(p_payload->>'locale',''), 'es'), true, false)
  RETURNING id INTO v_tenant;

  -- Ventana de provisionamiento (transaccional)
  PERFORM set_config('maria.provisioning_tenant', v_tenant::text, true);

  -- 2. Módulos (plantilla + ajustes del wizard)
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

  -- 3. Local
  INSERT INTO public.stores (tenant_id, name, address, phone, email, is_active, accepts_delivery, accepts_pickup, store_type)
  VALUES (v_tenant,
          COALESCE(NULLIF(p_payload#>>'{store,name}',''), v_name),
          COALESCE(NULLIF(p_payload#>>'{store,address}',''), NULLIF(p_payload->>'address','')),
          COALESCE(NULLIF(p_payload#>>'{store,phone}',''), NULLIF(p_payload->>'phone','')),
          NULLIF(p_payload->>'email',''), true,
          COALESCE((v_ops->>'delivery')::boolean, false), true,
          COALESCE(v_cfg->>'store_type', 'principal'))
  RETURNING id INTO v_store;

  -- 4. Almacenes (+ vínculo con el local)
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

  -- 5. Monedas
  FOR v_item IN
    SELECT * FROM jsonb_array_elements(COALESCE(v_cfg->'currencies', '[]'::jsonb))
  LOOP
    INSERT INTO public.currencies (tenant_id, code, name, symbol, exchange_rate, is_base, is_active)
    VALUES (v_tenant, v_item->>'code', v_item->>'name', v_item->>'symbol',
            COALESCE((v_item->>'exchange_rate')::numeric, 1),
            COALESCE((v_item->>'is_base')::boolean, false), true)
    ON CONFLICT DO NOTHING;
    IF COALESCE((v_item->>'is_base')::boolean, false) THEN
      v_primary_currency := v_item->>'code';
    END IF;
  END LOOP;

  -- 6. Medios de pago (selección del wizard o de la plantilla)
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

  -- 7. Unidades de medida
  FOR v_item IN
    SELECT * FROM jsonb_array_elements(COALESCE(v_cfg->'units', '[]'::jsonb))
  LOOP
    INSERT INTO public.units_of_measure (tenant_id, code, name, decimals, factor, is_default, is_active)
    VALUES (v_tenant, v_item->>'code', v_item->>'name',
            COALESCE((v_item->>'decimals')::int, 2), COALESCE((v_item->>'factor')::numeric, 1),
            COALESCE((v_item->>'is_default')::boolean, false), true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- 8. Categorías de producto
  FOR v_item IN
    SELECT * FROM jsonb_array_elements(COALESCE(v_cfg->'categories', '[]'::jsonb))
  LOOP
    INSERT INTO public.product_categories (tenant_id, name, color, is_active)
    VALUES (v_tenant, v_item->>'name', NULLIF(v_item->>'color',''), true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- 9. Contabilidad propia: plan + año fiscal + períodos + impuestos + mappings
  v_boot := public.bootstrap_tenant_accounting(v_tenant);

  FOR v_tax IN
    SELECT * FROM public.tax_templates
     WHERE profile_code = COALESCE(NULLIF(p_payload->>'accounting_profile_code',''), v_tpl.accounting_profile_code)
  LOOP
    INSERT INTO public.tax_rates (tenant_id, code, name, rate, is_active, is_default)
    VALUES (v_tenant, v_tax.code, v_tax.name, v_tax.rate, true, false)
    ON CONFLICT DO NOTHING;
  END LOOP;

  FOR v_item IN
    SELECT * FROM jsonb_array_elements(COALESCE(v_cfg->'taxes', '[]'::jsonb))
  LOOP
    INSERT INTO public.tax_rates (tenant_id, code, name, rate, is_active, is_default)
    VALUES (v_tenant, NULLIF(v_item->>'code',''), v_item->>'name',
            COALESCE((v_item->>'rate')::numeric, 0), true,
            COALESCE((v_item->>'is_default')::boolean, false))
    ON CONFLICT DO NOTHING;
  END LOOP;

  v_maps := public.sync_accounting_mappings(v_tenant);

  -- 10. Ajustes de POS
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

  -- 11. Vertical: mesas, fidelización, zonas de reparto
  IF COALESCE((v_ops->>'tables')::boolean, false) THEN
    INSERT INTO public.restaurant_tables (tenant_id, name, capacity, status, position_x, position_y)
    SELECT v_tenant, 'Mesa ' || g, COALESCE((v_ops->>'table_capacity')::int, 4), 'available',
           ((g - 1) % 4) * 120, ((g - 1) / 4) * 120
      FROM generate_series(1, LEAST(GREATEST(COALESCE((v_ops->>'tables_count')::int, 8), 1), 40)) g;
  END IF;

  IF COALESCE((v_ops->>'loyalty')::boolean, false) THEN
    INSERT INTO public.loyalty_settings (tenant_id, enabled)
    VALUES (v_tenant, true) ON CONFLICT DO NOTHING;
  END IF;

  IF COALESCE((v_ops->>'delivery')::boolean, false) THEN
    INSERT INTO public.delivery_zones (tenant_id, name, fee, estimated_minutes, is_active)
    VALUES (v_tenant, 'Zona local', 0, 30, true) ON CONFLICT DO NOTHING;
  END IF;

  -- 12. Administrador inicial (nunca superadmin, nunca reutiliza contexto ajeno)
  IF p_admin_user_id IS NOT NULL THEN
    IF public.is_superadmin(p_admin_user_id) THEN
      RAISE EXCEPTION 'BUSINESS_ADMIN_INVALID: no se puede asignar un superadministrador como administrador del negocio';
    END IF;
    IF EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = p_admin_user_id) THEN
      RAISE EXCEPTION 'BUSINESS_ADMIN_REUSED: el usuario ya pertenece a otro negocio';
    END IF;
    INSERT INTO public.tenant_users (tenant_id, user_id, is_owner)
    VALUES (v_tenant, p_admin_user_id, true);
    INSERT INTO public.user_roles (user_id, role) VALUES (p_admin_user_id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  -- 13. Auditoría de creación
  INSERT INTO public.activity_log (tenant_id, user_id, action, entity_type, entity_id, description, metadata)
  VALUES (v_tenant, v_actor, 'business_created', 'tenant', v_tenant,
          format('Negocio "%s" creado desde plantilla %s', v_name, v_tpl.code),
          jsonb_build_object('template', v_tpl.code, 'accounting', v_boot,
                             'mappings', v_maps, 'store_id', v_store,
                             'admin_user_id', p_admin_user_id, 'payload', p_payload));

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.operation_idempotency (tenant_id, operation, idempotency_key, result_id, user_id)
    VALUES (v_tenant, 'create_business', p_idempotency_key, v_tenant, v_actor)
    ON CONFLICT DO NOTHING;
  END IF;

  -- 14. Validación fail-closed: si algo obligatorio falta, ROLLBACK completo
  v_report := public.validate_business_readiness(v_tenant);

  IF NOT (v_report->>'ready')::boolean THEN
    DECLARE v_failed text;
    BEGIN
      SELECT string_agg(c->>'key' || ': ' || (c->>'detail'), ' | ')
        INTO v_failed
        FROM jsonb_array_elements(v_report->'checks') c
       WHERE (c->>'pass')::boolean = false
         AND (c->>'key') <> 'admin';
      IF v_failed IS NOT NULL THEN
        RAISE EXCEPTION 'BUSINESS_PROVISIONING_FAILED: %', v_failed;
      END IF;
    END;
  END IF;

  RETURN jsonb_build_object('tenant_id', v_tenant, 'slug', v_slug, 'template', v_tpl.code,
                            'idempotent', false, 'validation', v_report);
END;
$$;

REVOKE ALL ON FUNCTION public.create_business_from_template(text, jsonb, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_business_from_template(text, jsonb, uuid, uuid, text) TO authenticated, service_role;