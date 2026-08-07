
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
UPDATE public.tenants SET is_demo = true
 WHERE id IN ('a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002','a3000000-0000-0000-0000-000000000003');
UPDATE public.tenants SET is_demo = false, is_active = false WHERE name ILIKE '%maria demo%';

WITH ranked AS (
  SELECT p.id,
         row_number() OVER (PARTITION BY p.tenant_id, lower(p.name)
           ORDER BY (SELECT count(*) FROM public.sale_items si WHERE si.product_id = p.id) DESC, p.created_at ASC) rn
  FROM public.products p
  WHERE p.tenant_id IN ('a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002','a3000000-0000-0000-0000-000000000003')
)
UPDATE public.products SET is_active = false, is_online = false
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Publicar catálogo online coherente por tipo de negocio
UPDATE public.products SET is_online = true, online_stock = GREATEST(stock, 0), is_deliverable = true
 WHERE tenant_id = 'a1000000-0000-0000-0000-000000000001' AND is_active
   AND category IN ('Cervezas','Licores','Bebidas','Snacks');
UPDATE public.products SET is_online = true, online_stock = GREATEST(stock, 0), is_deliverable = true
 WHERE tenant_id = 'a2000000-0000-0000-0000-000000000002' AND is_active
   AND category IN ('Entradas','Platos Principales','Mariscos','Postres','Guarniciones');
UPDATE public.products SET is_online = true, online_stock = GREATEST(stock, 0), is_deliverable = true
 WHERE tenant_id = 'a3000000-0000-0000-0000-000000000003' AND is_active;

DO $mig$
DECLARE
  t_bar uuid := 'a1000000-0000-0000-0000-000000000001';
  t_res uuid := 'a2000000-0000-0000-0000-000000000002';
  t_tec uuid := 'a3000000-0000-0000-0000-000000000003';
  v_prod uuid; v_ing uuid; v_order uuid; v_user uuid; v_sub numeric; r record; i int;
  recipes text[][] := ARRAY[
    ARRAY['bar','Cuba Libre','Ron Havana Club 3 años','0.06','litro'],
    ARRAY['bar','Cuba Libre','Refresco Cola','0.20','litro'],
    ARRAY['bar','Daiquirí','Ron Havana Club 3 años','0.06','litro'],
    ARRAY['bar','Daiquirí Fresa','Ron Havana Club 3 años','0.06','litro'],
    ARRAY['bar','Mojito Clásico','Ron Havana Club 3 años','0.05','litro'],
    ARRAY['bar','Mojito Clásico','Agua Mineral','0.10','litro'],
    ARRAY['bar','Piña Colada','Ron Havana Club 3 años','0.06','litro'],
    ARRAY['bar','Piña Colada','Jugo Natural','0.20','litro'],
    ARRAY['bar','Margarita','Tequila Shot','1','medida'],
    ARRAY['res','Arroz con Pollo','Arroz Blanco','1','porción'],
    ARRAY['res','Ropa Vieja','Arroz Congri','1','porción'],
    ARRAY['res','Lechón Asado','Yuca con Mojo','1','porción'],
    ARRAY['res','Pollo a la Plancha','Arroz Blanco','1','porción'],
    ARRAY['res','Pollo a la Plancha','Tostones','1','porción'],
    ARRAY['res','Filete Mignon','Plátanos Maduros','1','porción'],
    ARRAY['res','Cerdo Asado','Arroz Congri','1','porción']
  ];
BEGIN
  FOR i IN 1 .. array_length(recipes,1) LOOP
    SELECT id INTO v_prod FROM public.products
      WHERE tenant_id = CASE recipes[i][1] WHEN 'bar' THEN t_bar ELSE t_res END
        AND name = recipes[i][2] AND is_active ORDER BY created_at LIMIT 1;
    SELECT id INTO v_ing FROM public.products
      WHERE tenant_id = CASE recipes[i][1] WHEN 'bar' THEN t_bar ELSE t_res END
        AND name = recipes[i][3] AND is_active ORDER BY created_at LIMIT 1;
    IF v_prod IS NOT NULL AND v_ing IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.product_recipes WHERE product_id = v_prod AND ingredient_id = v_ing
    ) THEN
      INSERT INTO public.product_recipes (tenant_id, product_id, ingredient_id, quantity, unit, waste_pct)
      VALUES (CASE recipes[i][1] WHEN 'bar' THEN t_bar ELSE t_res END, v_prod, v_ing,
              recipes[i][4]::numeric, recipes[i][5], 3);
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.kitchen_orders WHERE tenant_id = t_bar) THEN
    FOR r IN
      SELECT rt.id, rt.name, row_number() OVER (ORDER BY rt.name) rn
      FROM public.restaurant_tables rt WHERE rt.tenant_id = t_bar LIMIT 4
    LOOP
      INSERT INTO public.kitchen_orders (tenant_id, table_id, table_name, status, priority, waiter_name, notes, created_at, started_at, completed_at)
      VALUES (t_bar, r.id, r.name,
        (ARRAY['pending','preparing','ready','delivered'])[r.rn],
        CASE WHEN r.rn = 2 THEN 'high' ELSE 'normal' END,
        (ARRAY['Yoandy Pérez','Dayana Cruz','Yoandy Pérez','Dayana Cruz'])[r.rn],
        CASE WHEN r.rn = 1 THEN 'Sin picante' ELSE NULL END,
        now() - (r.rn * interval '18 minutes'),
        CASE WHEN r.rn > 1 THEN now() - (r.rn * interval '14 minutes') END,
        CASE WHEN r.rn >= 3 THEN now() - (r.rn * interval '6 minutes') END)
      RETURNING id INTO v_order;

      INSERT INTO public.kitchen_order_items (order_id, product_name, quantity, notes, status) VALUES
        (v_order, (ARRAY['Alitas BBQ','Nachos con Queso','Tabla de Quesos','Papas Fritas'])[r.rn], 1 + (r.rn % 2),
         CASE WHEN r.rn = 3 THEN 'Extra queso' ELSE NULL END,
         (ARRAY['pending','preparing','ready','delivered'])[r.rn]),
        (v_order, 'Maní Tostado', 2, NULL, (ARRAY['pending','preparing','ready','delivered'])[r.rn]);
    END LOOP;
  END IF;

  FOR r IN
    SELECT e.id, e.tenant_id, e.salary FROM public.employees e
    WHERE e.tenant_id IN (t_bar, t_tec) AND e.is_active AND e.salary > 0
      AND NOT EXISTS (SELECT 1 FROM public.payroll_runs pr WHERE pr.employee_id = e.id)
  LOOP
    INSERT INTO public.payroll_runs (tenant_id, employee_id, period_start, period_end, base_salary,
      gross_salary, hours_worked, bonus, bonuses_amount, taxable_base, irpf_amount, ss_worker_amount,
      ss_company_amount, deductions, net_pay, status, paid_at, payment_method, receipt_number)
    SELECT r.tenant_id, r.id,
      date_trunc('month', now() - interval '1 month')::date,
      (date_trunc('month', now()) - interval '1 day')::date,
      r.salary, r.salary * 1.05, 176, r.salary * 0.05, r.salary * 0.05,
      r.salary * 1.05, round(r.salary * 1.05 * 0.05, 2), round(r.salary * 1.05 * 0.05, 2),
      round(r.salary * 1.05 * 0.125, 2), round(r.salary * 1.05 * 0.10, 2),
      round(r.salary * 1.05 * 0.90, 2), 'paid',
      date_trunc('month', now()) + interval '4 days', 'transfer',
      'NOM-' || to_char(now() - interval '1 month','YYYYMM') || '-' || substr(r.id::text, 1, 4);
  END LOOP;

  FOR r IN
    SELECT p.id AS product_id, p.tenant_id,
           row_number() OVER (PARTITION BY p.tenant_id ORDER BY p.price DESC) rn
    FROM public.products p
    WHERE p.tenant_id IN (t_bar, t_res, t_tec) AND p.is_active AND p.is_online
  LOOP
    IF r.rn <= 6 AND NOT EXISTS (SELECT 1 FROM public.product_reviews v WHERE v.product_id = r.product_id) THEN
      INSERT INTO public.product_reviews (tenant_id, product_id, customer_id, rating, title, comment, is_verified_purchase, is_visible, created_at)
      SELECT r.tenant_id, r.product_id, c.id,
        (ARRAY[5,4,5])[c.rn],
        (ARRAY['Excelente calidad','Muy bueno','Lo recomiendo'])[c.rn],
        (ARRAY['Superó mis expectativas, repetiré sin dudarlo.',
               'Buena relación calidad-precio y entrega puntual.',
               'Atención rápida y el producto llegó tal como se describe.'])[c.rn],
        true, true, now() - (c.rn * interval '5 days')
      FROM (
        SELECT cu.id, row_number() OVER (ORDER BY cu.created_at) rn
        FROM public.customers cu WHERE cu.tenant_id = r.tenant_id LIMIT 3
      ) c;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.online_orders WHERE tenant_id = t_tec) THEN
    SELECT tu.user_id INTO v_user FROM public.tenant_users tu WHERE tu.tenant_id = t_tec LIMIT 1;
    FOR r IN
      SELECT c.id AS customer_id, c.name, c.phone, c.email, row_number() OVER (ORDER BY c.created_at) rn
      FROM public.customers c WHERE c.tenant_id = t_tec LIMIT 4
    LOOP
      INSERT INTO public.online_orders (tenant_id, user_id, customer_id, customer_name, customer_email, customer_phone,
        delivery_type, delivery_address, status, subtotal, tax, total, notes, created_at)
      VALUES (t_tec, v_user, r.customer_id, r.name, coalesce(r.email, 'cliente' || r.rn || '@techstore.cu'),
        coalesce(r.phone, '+53 5555 000' || r.rn),
        CASE WHEN r.rn % 2 = 0 THEN 'delivery' ELSE 'pickup' END,
        CASE WHEN r.rn % 2 = 0 THEN 'Calle 23 #' || (100 + r.rn) || ', Vedado, La Habana' END,
        (ARRAY['pending','confirmed','preparing','delivered'])[r.rn],
        0, 0, 0,
        CASE WHEN r.rn = 1 THEN 'Confirmar disponibilidad antes de recoger' END,
        now() - (r.rn * interval '9 hours'))
      RETURNING id INTO v_order;

      INSERT INTO public.online_order_items (order_id, product_id, product_name, qty, price, total)
      SELECT v_order, p.id, p.name, 1, p.price, p.price
      FROM public.products p
      WHERE p.tenant_id = t_tec AND p.is_active AND p.is_online
      ORDER BY p.price DESC OFFSET (r.rn - 1) LIMIT 2;

      SELECT coalesce(sum(total), 0) INTO v_sub FROM public.online_order_items WHERE order_id = v_order;
      UPDATE public.online_orders SET subtotal = v_sub, tax = round(v_sub * 0.10, 2), total = round(v_sub * 1.10, 2)
       WHERE id = v_order;
    END LOOP;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.online_orders WHERE tenant_id = t_bar) THEN
    SELECT tu.user_id INTO v_user FROM public.tenant_users tu WHERE tu.tenant_id = t_bar LIMIT 1;
    FOR r IN
      SELECT c.id AS customer_id, c.name, c.phone, c.email, row_number() OVER (ORDER BY c.created_at) rn
      FROM public.customers c WHERE c.tenant_id = t_bar LIMIT 2
    LOOP
      INSERT INTO public.online_orders (tenant_id, user_id, customer_id, customer_name, customer_email, customer_phone,
        delivery_type, status, subtotal, tax, total, created_at)
      VALUES (t_bar, v_user, r.customer_id, r.name, coalesce(r.email,'cliente' || r.rn || '@tropico.cu'),
        coalesce(r.phone,'+53 5444 000' || r.rn), 'pickup',
        (ARRAY['confirmed','delivered'])[r.rn], 0, 0, 0, now() - (r.rn * interval '5 hours'))
      RETURNING id INTO v_order;

      INSERT INTO public.online_order_items (order_id, product_id, product_name, qty, price, total)
      SELECT v_order, p.id, p.name, 2, p.price, p.price * 2
      FROM public.products p
      WHERE p.tenant_id = t_bar AND p.is_active AND p.is_online
      ORDER BY p.price DESC OFFSET (r.rn - 1) LIMIT 2;

      SELECT coalesce(sum(total), 0) INTO v_sub FROM public.online_order_items WHERE order_id = v_order;
      UPDATE public.online_orders SET subtotal = v_sub, tax = 0, total = v_sub WHERE id = v_order;
    END LOOP;
  END IF;
END
$mig$;

INSERT INTO public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id, payload, metadata, source, shadow, occurred_at)
SELECT s.tenant_id, 'sale.completed', 'sale', s.id,
  jsonb_build_object('total', s.total, 'status', s.status, 'store_id', s.store_id, 'customer_id', s.customer_id),
  jsonb_build_object('backfill', true), 'backfill', true, s.created_at
FROM public.sales s
WHERE s.tenant_id IN ('a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002','a3000000-0000-0000-0000-000000000003')
  AND s.status <> 'cancelled'
  AND NOT EXISTS (SELECT 1 FROM public.domain_events d WHERE d.aggregate_id = s.id AND d.event_type = 'sale.completed');

INSERT INTO public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id, payload, metadata, source, shadow, occurred_at)
SELECT p.tenant_id, 'purchase.received', 'purchase', p.id,
  jsonb_build_object('total', p.total, 'status', p.status, 'supplier_id', p.supplier_id),
  jsonb_build_object('backfill', true), 'backfill', true, p.created_at
FROM public.purchases p
WHERE p.tenant_id IN ('a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002','a3000000-0000-0000-0000-000000000003')
  AND NOT EXISTS (SELECT 1 FROM public.domain_events d WHERE d.aggregate_id = p.id AND d.event_type = 'purchase.received');

INSERT INTO public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id, payload, metadata, source, shadow, occurred_at)
SELECT m.tenant_id, 'inventory.moved', 'inventory_movement', m.id,
  jsonb_build_object('product_id', m.product_id, 'type', m.movement_type, 'quantity', m.quantity),
  jsonb_build_object('backfill', true), 'backfill', true, m.created_at
FROM public.inventory_movements m
WHERE m.tenant_id IN ('a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002','a3000000-0000-0000-0000-000000000003')
  AND NOT EXISTS (SELECT 1 FROM public.domain_events d WHERE d.aggregate_id = m.id AND d.event_type = 'inventory.moved');

CREATE OR REPLACE FUNCTION public.public_demo_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'tenants', (SELECT count(*) FROM tenants WHERE is_demo),
    'products', (SELECT count(*) FROM products p JOIN tenants t ON t.id = p.tenant_id WHERE t.is_demo AND p.is_active),
    'sales', (SELECT count(*) FROM sales s JOIN tenants t ON t.id = s.tenant_id WHERE t.is_demo AND s.status <> 'cancelled'),
    'revenue', (SELECT coalesce(sum(s.total),0) FROM sales s JOIN tenants t ON t.id = s.tenant_id WHERE t.is_demo AND s.status <> 'cancelled'),
    'journal_entries', (SELECT count(*) FROM journal_entries j JOIN tenants t ON t.id = j.tenant_id WHERE t.is_demo),
    'employees', (SELECT count(*) FROM employees e JOIN tenants t ON t.id = e.tenant_id WHERE t.is_demo AND e.is_active),
    'events', (SELECT count(*) FROM domain_events d JOIN tenants t ON t.id = d.tenant_id WHERE t.is_demo),
    'agents', (SELECT count(*) FROM ai_agents a JOIN tenants t ON t.id = a.tenant_id WHERE t.is_demo),
    'businesses', (SELECT jsonb_agg(x ORDER BY x->>'name') FROM (
        SELECT jsonb_build_object(
          'name', t.name,
          'type', t.business_type,
          'products', (SELECT count(*) FROM products p WHERE p.tenant_id = t.id AND p.is_active),
          'sales', (SELECT count(*) FROM sales s WHERE s.tenant_id = t.id AND s.status <> 'cancelled'),
          'revenue', (SELECT coalesce(sum(s.total),0) FROM sales s WHERE s.tenant_id = t.id AND s.status <> 'cancelled'),
          'employees', (SELECT count(*) FROM employees e WHERE e.tenant_id = t.id AND e.is_active)
        ) x FROM tenants t WHERE t.is_demo
      ) q)
  )
$$;

GRANT EXECUTE ON FUNCTION public.public_demo_stats() TO anon, authenticated;
