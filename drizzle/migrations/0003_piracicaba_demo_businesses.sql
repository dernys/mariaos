DO $$
DECLARE
  v jsonb; r record; t uuid; st uuid; pid uuid;
  ids jsonb := jsonb_build_object('mercado', '836e7b70-9ccc-4b7d-a9bf-fddfbc29b753');
  d record;
BEGIN
  FOR d IN SELECT * FROM (VALUES
    ('restaurante','RESTAURANTE_BR','Restaurante Sabor Caipira · Piracicaba','restaurante-sabor-caipira-piracicaba','Rua do Porto, 1200 - Centro, Piracicaba - SP, 13400-000','(19) 3422-1200', true, true),
    ('bar','BAR_BR','Bar Rua do Porto · Piracicaba','bar-rua-do-porto-piracicaba','Av. Beira Rio, 450 - Rua do Porto, Piracicaba - SP, 13400-300','(19) 3433-4500', true, false),
    ('servicos','SERVICOS_BR','Serviços Barbearia & Auto · Piracicaba','servicos-barbearia-auto-piracicaba','Av. Independência, 2100 - Alto, Piracicaba - SP, 13419-160','(19) 3411-2100', false, false)
  ) x(k, tpl, name, slug, addr, phone, tables, delivery)
  LOOP
    SELECT id INTO t FROM public.tenants WHERE slug = d.slug;
    IF t IS NULL THEN
      v := public.create_business_from_template(d.tpl, jsonb_build_object(
             'name', d.name, 'slug', d.slug, 'address', d.addr, 'phone', d.phone, 'locale', 'pt-BR',
             'operations', jsonb_build_object('tables', d.tables, 'tables_count', 10, 'table_capacity', 4,
               'kitchen', d.tables, 'delivery', d.delivery, 'loyalty', true, 'recipes', false)),
           NULL, '82ed8c4a-6563-47f1-a169-bf621fcb350a'::uuid, NULL);
      t := (v->>'tenant_id')::uuid;
    END IF;
    ids := ids || jsonb_build_object(d.k, t);
  END LOOP;

  UPDATE public.tenants SET is_demo = true, default_locale = 'pt-BR' WHERE id IN (SELECT (value#>>'{}')::uuid FROM jsonb_each(ids));
  UPDATE public.tenants SET address = 'Rua Governador Pedro de Toledo, 800 - Centro, Piracicaba - SP, 13400-060'
   WHERE id = '836e7b70-9ccc-4b7d-a9bf-fddfbc29b753' AND address IS NULL;

  FOR r IN SELECT * FROM (VALUES
('mercado','MP-001','Arroz Tipo 1 5kg','Mercearia',27.9,19.5,'arroz-5kg'),
('mercado','MP-002','Feijão Carioca 1kg','Mercearia',8.49,5.6,'feijao'),
('mercado','MP-003','Café Torrado e Moído 500g','Mercearia',18.9,12.8,'cafe'),
('mercado','MP-004','Açúcar Refinado 1kg','Mercearia',4.99,3.3,'acucar'),
('mercado','MP-005','Óleo de Soja 900ml','Mercearia',7.49,5.2,'oleo'),
('mercado','MP-006','Leite Integral 1L','Bebidas',5.29,3.7,'leite'),
('mercado','MP-007','Refrigerante Guaraná 2L','Bebidas',9.99,6.4,'guarana'),
('mercado','MP-008','Água Mineral 1,5L','Bebidas',3.49,1.9,'agua'),
('mercado','MP-009','Pão Francês (kg)','Padaria',16.9,8.5,'pao-frances'),
('mercado','MP-010','Pão de Queijo (kg)','Padaria',39.9,21,'pao-de-queijo'),
('mercado','MP-011','Banana Prata (kg)','Hortifruti',6.99,3.8,'banana'),
('mercado','MP-012','Detergente Líquido 500ml','Limpeza',2.79,1.6,'detergente'),
('mercado','MP-013','Sabão em Pó 1kg','Limpeza',15.9,10.2,'sabao-po'),
('mercado','MP-014','Papel Higiênico 12 rolos','Higiene',21.9,14.5,'papel-higienico'),
('restaurante','RS-001','Feijoada Completa','Pratos principais',54.9,19,'feijoada'),
('restaurante','RS-002','Picanha na Chapa','Pratos principais',79.9,34,'picanha'),
('restaurante','RS-003','Parmegiana de Frango','Pratos principais',46.9,16,'parmegiana'),
('restaurante','RS-004','Moqueca de Peixe','Pratos principais',69.9,27,'moqueca'),
('restaurante','RS-005','Pizza Margherita','Pizzas',59.9,18,'pizza-margherita'),
('restaurante','RS-006','Pizza Calabresa','Pizzas',57.9,17,'pizza-calabresa'),
('restaurante','RS-007','Pastel de Carne (3 un)','Entradas',24.9,7,'pastel'),
('restaurante','RS-008','Coxinha (6 un)','Entradas',22.9,6,'coxinha'),
('restaurante','RS-009','Pudim de Leite','Sobremesas',14.9,4,'pudim'),
('restaurante','RS-010','Brigadeiro (4 un)','Sobremesas',12,3,'brigadeiro'),
('restaurante','RS-011','Suco de Laranja 500ml','Bebidas',11.9,3.5,'suco-laranja'),
('restaurante','RS-012','Caipirinha de Limão','Bebidas',22,6,'caipirinha'),
('bar','BR-001','Chopp Pilsen 300ml','Chopp e cervejas',12.9,4.5,'chopp'),
('bar','BR-002','Cerveja Long Neck','Chopp e cervejas',11.9,5.5,'long-neck'),
('bar','BR-003','Cerveja Artesanal IPA 500ml','Chopp e cervejas',29.9,14,'ipa'),
('bar','BR-004','Caipirinha de Cachaça','Drinks',19.9,5,'caipirinha-bar'),
('bar','BR-005','Gin Tônica','Drinks',29.9,9,'gin-tonica'),
('bar','BR-006','Batida de Maracujá','Drinks',21.9,6,'batida'),
('bar','BR-007','Refrigerante Lata','Refrigerantes e sucos',6.9,3,'refri-lata'),
('bar','BR-008','Água de Coco','Refrigerantes e sucos',8.9,4,'agua-coco'),
('bar','BR-009','Porção de Batata Frita','Porções',32.9,9,'batata-frita'),
('bar','BR-010','Porção de Mandioca Frita','Porções',29.9,7,'mandioca'),
('bar','BR-011','Torresmo','Porções',34.9,10,'torresmo'),
('bar','BR-012','Frango a Passarinho','Porções',39.9,12,'frango-passarinho'),
('servicos','SV-001','Corte de Cabelo Masculino','Serviços',45,10,'corte'),
('servicos','SV-002','Barba Completa','Serviços',35,8,'barba'),
('servicos','SV-003','Corte + Barba','Serviços',70,16,'corte-barba'),
('servicos','SV-004','Escova Progressiva','Serviços',180,45,'progressiva'),
('servicos','SV-005','Manicure e Pedicure','Serviços',60,12,'manicure'),
('servicos','SV-006','Troca de Óleo (serviço)','Serviços',90,20,'troca-oleo'),
('servicos','SV-007','Alinhamento e Balanceamento','Serviços',120,30,'alinhamento'),
('servicos','SV-008','Pomada Modeladora','Produtos',39.9,18,'pomada'),
('servicos','SV-009','Shampoo Anticaspa 300ml','Produtos',32.9,14,'shampoo'),
('servicos','SV-010','Óleo de Motor 5W30 1L','Peças',54.9,32,'oleo-motor'),
('servicos','SV-011','Filtro de Óleo','Peças',39.9,19,'filtro-oleo'),
('servicos','SV-012','Palheta Limpador Para-brisa','Peças',49.9,22,'palheta')
  ) p(k, sku, name, cat, price, cost, img)
  LOOP
    t := (ids->>r.k)::uuid;
    SELECT id INTO st FROM public.stores WHERE tenant_id = t ORDER BY created_at LIMIT 1;
    PERFORM set_config('maria.provisioning_tenant', t::text, true);
    SELECT id INTO pid FROM public.products WHERE tenant_id = t AND sku = r.sku;
    IF pid IS NULL THEN
      INSERT INTO public.products (tenant_id, name, sku, category, price, cost, min_stock, image_url, images,
                                   is_online, online_stock, is_active, product_type, unit_code, store_id)
      VALUES (t, r.name, r.sku, r.cat, r.price, r.cost, 10, '/demo/products/' || r.img || '.jpg',
              jsonb_build_array('/demo/products/' || r.img || '.jpg'), true,
              CASE WHEN r.cat = 'Serviços' THEN 999 ELSE 50 END, true, 'simple', 'UN', st)
      RETURNING id INTO pid;
    END IF;
    IF st IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.product_stock WHERE product_id = pid) THEN
      INSERT INTO public.product_stock (tenant_id, product_id, location_type, location_id, stock, min_stock)
      VALUES (t, pid, 'store', st, CASE WHEN r.cat = 'Serviços' THEN 999 ELSE (abs(hashtext(r.sku)) % 90) + 30 END, 10);
    END IF;
  END LOOP;

  FOR r IN SELECT k.value AS tid, c.* FROM jsonb_each_text(ids) k CROSS JOIN (VALUES
    ('Ana Paula Ribeiro','(19) 99812-3344','ana.ribeiro@example.com'),
    ('Carlos Eduardo Lima','(19) 99721-5566','carlos.lima@example.com'),
    ('Mariana Souza','(19) 98845-7788','mariana.souza@example.com'),
    ('João Pedro Almeida','(19) 99633-9900','joao.almeida@example.com')) c(name, phone, email)
  LOOP
    INSERT INTO public.customers (tenant_id, name, phone, email, address)
    SELECT r.tid::uuid, r.name, r.phone, r.email, 'Piracicaba - SP'
     WHERE NOT EXISTS (SELECT 1 FROM public.customers WHERE tenant_id = r.tid::uuid AND email = r.email);
  END LOOP;
END $$;