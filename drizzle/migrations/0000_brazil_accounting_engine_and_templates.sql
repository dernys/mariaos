-- 1) Cuentas brasileñas adicionales en los 3 perfiles BR
INSERT INTO public.chart_account_templates (profile_code, code, name, type, nature, parent_code, is_header, sort_order)
SELECT p.code, v.code, v.name, v.type, v.nature, v.parent, false, v.ord
FROM (VALUES ('BR-SIMP'),('BR-PRES'),('BR-REAL')) p(code)
CROSS JOIN (VALUES
  ('1.1.06','Cartões a Receber','asset','debit','1.1',8),
  ('2.1.13','Simples Nacional (DAS) a Recolher','liability','credit','2.1',31),
  ('2.1.14','IRRF a Recolher','liability','credit','2.1',32),
  ('4.2.01','Outras Receitas','income','credit','4',54),
  ('4.2.02','Sobras de Caixa','income','credit','4',55),
  ('5.1.02','Custo dos Serviços Prestados','cost','debit','5',62),
  ('5.3.02','Quebras de Caixa','expense','debit','5',67),
  ('5.4.02','Impostos sobre Vendas (DAS/ICMS/ISS)','expense','debit','5',69)
) v(code,name,type,nature,parent,ord)
ON CONFLICT (profile_code, code) DO NOTHING;

-- 2) Cuenta brasileña por clave de mapeo
CREATE OR REPLACE FUNCTION public.br_mapping_account_code(p_key text, p_profile text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_key
    WHEN 'sale_revenue' THEN '4.1.01'
    WHEN 'sale_tax_payable' THEN CASE WHEN p_profile = 'BR-SIMP' THEN '2.1.13' ELSE '2.1.03' END
    WHEN 'sale_receivable' THEN '1.1.05'
    WHEN 'sale_cash' THEN '1.1.01'
    WHEN 'sale_bank' THEN '1.1.02'
    WHEN 'sale_transfermovil' THEN '1.1.02'
    WHEN 'sale_enzona' THEN '1.1.02'
    WHEN 'sale_card' THEN '1.1.06'
    WHEN 'cogs' THEN '5.1.01'
    WHEN 'inventory' THEN '1.2.01'
    WHEN 'inventory_adjustment' THEN '5.1.04'
    WHEN 'sale_return_revenue' THEN '4.1.02'
    WHEN 'sale_return_cash' THEN '1.1.01'
    WHEN 'purchase_inventory' THEN '1.2.01'
    WHEN 'purchase_tax_receivable' THEN '1.1.08'
    WHEN 'purchase_payable' THEN '2.1.01'
    WHEN 'payment_cash' THEN '1.1.01'
    WHEN 'payment_bank' THEN '1.1.02'
    WHEN 'payment_transfermovil' THEN '1.1.02'
    WHEN 'payment_enzona' THEN '1.1.02'
    WHEN 'payment_card' THEN '1.1.02'
    WHEN 'bank_account' THEN '1.1.02'
    WHEN 'expense_general' THEN '5.3.01'
    WHEN 'other_income' THEN '4.2.01'
    WHEN 'owner_equity' THEN '3.1.01'
    WHEN 'tax_expense' THEN '5.4.02'
    WHEN 'payroll_expense' THEN '5.2.01'
    WHEN 'payroll_liability' THEN '2.1.10'
    WHEN 'payroll_ss_payable' THEN '2.1.11'
    WHEN 'payroll_withholding' THEN '2.1.14'
    WHEN 'payroll_cash' THEN '1.1.01'
    WHEN 'cash_short' THEN '5.3.02'
    WHEN 'cash_over' THEN '4.2.02'
  END;
$$;
GRANT EXECUTE ON FUNCTION public.br_mapping_account_code(text, text) TO authenticated, service_role;

-- 3) Cuentas por defecto genéricas: nunca en negocios con plan brasileño
CREATE OR REPLACE FUNCTION public.ensure_default_accounts(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND accounting_profile_code LIKE 'BR-%') THEN
    RETURN;
  END IF;
  INSERT INTO accounting_accounts (tenant_id, code, name, type) VALUES
    (p_tenant_id, '1100', 'Caja', 'asset'),
    (p_tenant_id, '1110', 'Bancos', 'asset'),
    (p_tenant_id, '1200', 'Cuentas por Cobrar', 'asset'),
    (p_tenant_id, '1300', 'Inventario', 'asset'),
    (p_tenant_id, '2100', 'Cuentas por Pagar', 'liability'),
    (p_tenant_id, '2200', 'Impuestos por Pagar', 'liability'),
    (p_tenant_id, '4100', 'Ventas', 'income'),
    (p_tenant_id, '5100', 'Costo de Ventas', 'expense')
  ON CONFLICT DO NOTHING;
END; $$;

-- 4) Sincronización de mapeos con rama brasileña
CREATE OR REPLACE FUNCTION public.sync_accounting_mappings(p_tenant uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rec record; v_acc uuid; v_count int := 0; v_profile text; v_br_code text; v_cur uuid;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant);
  SELECT accounting_profile_code INTO v_profile FROM public.tenants WHERE id = p_tenant;

  FOR v_rec IN SELECT * FROM public.accounting_mapping_catalog() ORDER BY sort_order LOOP
    SELECT account_id INTO v_cur FROM public.accounting_mappings
     WHERE tenant_id = p_tenant AND mapping_key = v_rec.mapping_key;

    v_acc := NULL;
    IF v_profile LIKE 'BR-%' THEN
      v_br_code := public.br_mapping_account_code(v_rec.mapping_key, v_profile);
      IF v_br_code IS NOT NULL THEN
        SELECT id INTO v_acc FROM public.accounting_accounts
         WHERE tenant_id = p_tenant AND code = v_br_code AND is_postable AND COALESCE(is_active, true)
         LIMIT 1;
      END IF;
      -- Respeta mapeos ya apuntando a una cuenta del plano brasileño (personalización)
      IF v_cur IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.accounting_accounts
            WHERE id = v_cur AND tenant_id = p_tenant AND plan_template LIKE 'BR-%') THEN
        CONTINUE;
      END IF;
    ELSE
      IF v_cur IS NOT NULL THEN CONTINUE; END IF;
    END IF;

    IF v_acc IS NULL AND v_rec.role_alias IS NOT NULL THEN
      v_acc := public.resolve_account_by_pattern(p_tenant, v_rec.role_alias);
    END IF;
    IF v_acc IS NULL THEN
      v_acc := public.find_account_by_codes(p_tenant, v_rec.fallback_codes);
    END IF;
    IF v_acc IS NULL THEN
      SELECT id INTO v_acc FROM public.accounting_accounts
       WHERE tenant_id = p_tenant AND is_postable = true AND COALESCE(is_active, true)
         AND type = v_rec.account_type
       ORDER BY code LIMIT 1;
    END IF;
    IF v_acc IS NULL OR v_acc = v_cur THEN CONTINUE; END IF;

    INSERT INTO public.accounting_mappings (tenant_id, mapping_key, account_id, description, is_active)
    VALUES (p_tenant, v_rec.mapping_key, v_acc, v_rec.module || ' · ' || v_rec.operation, true)
    ON CONFLICT (tenant_id, mapping_key)
      DO UPDATE SET account_id = EXCLUDED.account_id, updated_at = now();
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $$;

-- 5) Plantillas de negocio de Brasil
INSERT INTO public.business_templates (code, business_type, name, description, icon, accounting_profile_code, default_country_code, sort_order, config)
VALUES
('LOJA_BR','empresa','Loja / Mercado (Brasil)','Varejo, mercearia e minimercado. Simples Nacional, BRL, PIX e cartões.','Store','BR-SIMP','BR',10,
 '{"store_type":"tienda",
   "currencies":[{"code":"BRL","name":"Real brasileiro","symbol":"R$","exchange_rate":1,"is_base":true},{"code":"USD","name":"Dólar","symbol":"US$","exchange_rate":5.4,"is_base":false}],
   "payment_methods":[{"name":"Dinheiro","type":"cash"},{"name":"PIX","type":"transfer"},{"name":"Cartão de débito","type":"card","requires_card_info":true},{"name":"Cartão de crédito","type":"card","requires_card_info":true},{"name":"Vale-Alimentação","type":"voucher"},{"name":"Fiado","type":"credit"}],
   "taxes":[{"code":"DAS","name":"Simples Nacional (Anexo I)","rate":4,"is_default":true}],
   "categories":[{"name":"Mercearia","color":"#10b981"},{"name":"Bebidas","color":"#3b82f6"},{"name":"Padaria","color":"#f59e0b"},{"name":"Hortifruti","color":"#22c55e"},{"name":"Limpeza","color":"#8b5cf6"},{"name":"Higiene","color":"#ec4899"}],
   "units":[{"code":"UN","name":"Unidade","decimals":0,"factor":1,"is_default":true},{"code":"CX","name":"Caixa","decimals":0,"factor":1},{"code":"KG","name":"Quilograma","decimals":3,"factor":1},{"code":"L","name":"Litro","decimals":3,"factor":1}],
   "warehouses":[{"name":"Loja / Salão de vendas","warehouse_type":"general"},{"name":"Estoque / Depósito","warehouse_type":"general"}],
   "pos":{"tax_included":true,"tip_enabled":false,"allow_discounts":true,"allow_negative_stock":false,"default_credit_days":30},
   "modules":["dashboard","pos","inventario","tiendas","almacenes","ventas","compras","proveedores","clientes","facturas","cuentas","turnos","contabilidad","reportes","analytics","transferencias","conteos","devoluciones","empleados","delivery","pedidos-online","configuracion","data-center"]}'::jsonb),
('RESTAURANTE_BR','restaurante','Restaurante (Brasil)','Restaurante, pizzaria ou lanchonete: mesas, cozinha (KDS), ficha técnica, delivery e taxa de serviço.','ChefHat','BR-SIMP','BR',11,
 '{"store_type":"restaurante",
   "currencies":[{"code":"BRL","name":"Real brasileiro","symbol":"R$","exchange_rate":1,"is_base":true}],
   "payment_methods":[{"name":"Dinheiro","type":"cash"},{"name":"PIX","type":"transfer"},{"name":"Cartão de débito","type":"card","requires_card_info":true},{"name":"Cartão de crédito","type":"card","requires_card_info":true},{"name":"Vale-Refeição","type":"voucher"},{"name":"Conta aberta","type":"credit"}],
   "taxes":[{"code":"DAS","name":"Simples Nacional (Anexo I)","rate":4,"is_default":true}],
   "categories":[{"name":"Entradas","color":"#10b981"},{"name":"Pratos principais","color":"#f59e0b"},{"name":"Pizzas","color":"#ef4444"},{"name":"Sobremesas","color":"#ec4899"},{"name":"Bebidas","color":"#06b6d4"}],
   "units":[{"code":"UN","name":"Unidade","decimals":0,"factor":1,"is_default":true},{"code":"KG","name":"Quilograma","decimals":3,"factor":1},{"code":"G","name":"Grama","decimals":0,"factor":1},{"code":"L","name":"Litro","decimals":3,"factor":1},{"code":"POR","name":"Porção","decimals":0,"factor":1}],
   "warehouses":[{"name":"Despensa","warehouse_type":"general"},{"name":"Cozinha","warehouse_type":"cocina"},{"name":"Bar","warehouse_type":"barra"}],
   "pos":{"tax_included":true,"tip_enabled":true,"allow_discounts":true,"allow_negative_stock":false,"default_credit_days":0},
   "modules":["dashboard","pos","mesas","cocina","recetas","inventario","tiendas","almacenes","ventas","compras","proveedores","clientes","turnos","cuentas","contabilidad","reportes","analytics","conteos","devoluciones","empleados","rrhh","delivery","pedidos-online","fidelizacion","configuracion","data-center"]}'::jsonb),
('BAR_BR','bar','Bar / Choperia (Brasil)','Bar, choperia ou café: comandas abertas, balcão, drinks com ficha técnica e fidelidade.','Wine','BR-SIMP','BR',12,
 '{"store_type":"bar",
   "currencies":[{"code":"BRL","name":"Real brasileiro","symbol":"R$","exchange_rate":1,"is_base":true}],
   "payment_methods":[{"name":"Dinheiro","type":"cash"},{"name":"PIX","type":"transfer"},{"name":"Cartão de débito","type":"card","requires_card_info":true},{"name":"Cartão de crédito","type":"card","requires_card_info":true},{"name":"Comanda aberta","type":"credit"}],
   "taxes":[{"code":"DAS","name":"Simples Nacional (Anexo I)","rate":4,"is_default":true}],
   "categories":[{"name":"Chopp e cervejas","color":"#f59e0b"},{"name":"Drinks","color":"#8b5cf6"},{"name":"Refrigerantes e sucos","color":"#06b6d4"},{"name":"Porções","color":"#10b981"}],
   "units":[{"code":"UN","name":"Unidade","decimals":0,"factor":1,"is_default":true},{"code":"L","name":"Litro","decimals":3,"factor":1},{"code":"ML","name":"Mililitro","decimals":0,"factor":1},{"code":"DOSE","name":"Dose","decimals":0,"factor":1}],
   "warehouses":[{"name":"Depósito de bebidas","warehouse_type":"general"},{"name":"Balcão / Chopeira","warehouse_type":"barra"}],
   "pos":{"tax_included":true,"tip_enabled":true,"allow_discounts":true,"allow_negative_stock":false,"default_credit_days":0},
   "modules":["dashboard","pos","mesas","cocina","recetas","inventario","tiendas","almacenes","ventas","compras","proveedores","clientes","turnos","cuentas","contabilidad","reportes","analytics","conteos","devoluciones","empleados","fidelizacion","configuracion","data-center"]}'::jsonb),
('SERVICOS_BR','empresa','Serviços (Brasil)','Prestadores de serviços, oficinas, salões e barbearias. ISS municipal e Simples Nacional Anexo III.','Building2','BR-SIMP','BR',13,
 '{"store_type":"tienda",
   "currencies":[{"code":"BRL","name":"Real brasileiro","symbol":"R$","exchange_rate":1,"is_base":true}],
   "payment_methods":[{"name":"Dinheiro","type":"cash"},{"name":"PIX","type":"transfer"},{"name":"Cartão de débito","type":"card","requires_card_info":true},{"name":"Cartão de crédito","type":"card","requires_card_info":true},{"name":"Boleto bancário","type":"bank"},{"name":"A prazo","type":"credit"}],
   "taxes":[{"code":"DAS3","name":"Simples Nacional (Anexo III)","rate":6,"is_default":true},{"code":"ISS","name":"ISS municipal","rate":2,"is_default":false}],
   "categories":[{"name":"Serviços","color":"#10b981"},{"name":"Produtos","color":"#3b82f6"},{"name":"Peças","color":"#f59e0b"}],
   "units":[{"code":"UN","name":"Unidade","decimals":0,"factor":1,"is_default":true},{"code":"H","name":"Hora","decimals":2,"factor":1},{"code":"SV","name":"Serviço","decimals":0,"factor":1}],
   "warehouses":[{"name":"Estoque principal","warehouse_type":"general"}],
   "pos":{"tax_included":true,"tip_enabled":false,"allow_discounts":true,"allow_negative_stock":false,"default_credit_days":30},
   "modules":["dashboard","pos","inventario","tiendas","almacenes","ventas","compras","proveedores","clientes","facturas","cuentas","turnos","contabilidad","reportes","analytics","empleados","configuracion","data-center"]}'::jsonb)
ON CONFLICT (code) DO UPDATE SET
  business_type = EXCLUDED.business_type, name = EXCLUDED.name, description = EXCLUDED.description,
  icon = EXCLUDED.icon, accounting_profile_code = EXCLUDED.accounting_profile_code,
  default_country_code = EXCLUDED.default_country_code, sort_order = EXCLUDED.sort_order,
  config = EXCLUDED.config, is_active = true, updated_at = now();