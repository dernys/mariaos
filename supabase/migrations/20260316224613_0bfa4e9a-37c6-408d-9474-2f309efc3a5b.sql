
-- Restaurant tables (floor map)
CREATE TABLE public.restaurant_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id),
  name text NOT NULL,
  capacity integer NOT NULL DEFAULT 4,
  status text NOT NULL DEFAULT 'free',
  position_x integer NOT NULL DEFAULT 0,
  position_y integer NOT NULL DEFAULT 0,
  shape text NOT NULL DEFAULT 'square',
  current_order_id uuid,
  waiter_id uuid REFERENCES public.employees(id),
  occupied_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant view tables" ON public.restaurant_tables FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);
CREATE POLICY "Tenant insert tables" ON public.restaurant_tables FOR INSERT WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);
CREATE POLICY "Tenant update tables" ON public.restaurant_tables FOR UPDATE USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);
CREATE POLICY "Admin delete tables" ON public.restaurant_tables FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role)
);

-- Kitchen orders
CREATE TABLE public.kitchen_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id),
  table_id uuid REFERENCES public.restaurant_tables(id),
  table_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  priority text NOT NULL DEFAULT 'normal',
  notes text,
  waiter_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  started_at timestamp with time zone,
  completed_at timestamp with time zone
);

ALTER TABLE public.kitchen_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant view kitchen_orders" ON public.kitchen_orders FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);
CREATE POLICY "Tenant insert kitchen_orders" ON public.kitchen_orders FOR INSERT WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);
CREATE POLICY "Tenant update kitchen_orders" ON public.kitchen_orders FOR UPDATE USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);

-- Kitchen order items
CREATE TABLE public.kitchen_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.kitchen_orders(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.kitchen_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant view kitchen_order_items" ON public.kitchen_order_items FOR SELECT USING (
  order_id IN (SELECT id FROM kitchen_orders WHERE tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()))
);
CREATE POLICY "Tenant insert kitchen_order_items" ON public.kitchen_order_items FOR INSERT WITH CHECK (
  order_id IN (SELECT id FROM kitchen_orders WHERE tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()))
);
CREATE POLICY "Tenant update kitchen_order_items" ON public.kitchen_order_items FOR UPDATE USING (
  order_id IN (SELECT id FROM kitchen_orders WHERE tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()))
);

-- Product recipes (ingredients per dish)
CREATE TABLE public.product_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'unidad',
  tenant_id uuid REFERENCES public.tenants(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.product_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant view recipes" ON public.product_recipes FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);
CREATE POLICY "Tenant insert recipes" ON public.product_recipes FOR INSERT WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);
CREATE POLICY "Tenant update recipes" ON public.product_recipes FOR UPDATE USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);
CREATE POLICY "Admin delete recipes" ON public.product_recipes FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role)
);

-- Enable realtime for kitchen orders and tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.kitchen_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.kitchen_order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_tables;
