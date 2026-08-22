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

  INSERT INTO public.activity_log (tenant_id, performed_by, action, entity_type, entity_id, description, metadata)
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