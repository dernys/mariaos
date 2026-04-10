
-- Add online sale fields to products
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS online_stock integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS image_url text;

-- Create online_orders table
CREATE TABLE public.online_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id),
  user_id uuid,
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text NOT NULL,
  delivery_type text NOT NULL DEFAULT 'pickup',
  delivery_address text,
  status text NOT NULL DEFAULT 'pending',
  subtotal numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create online_order_items table
CREATE TABLE public.online_order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  product_name text NOT NULL,
  qty integer NOT NULL DEFAULT 1,
  price numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.online_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_order_items ENABLE ROW LEVEL SECURITY;

-- PUBLIC read access for online products (no auth needed)
CREATE POLICY "Anyone can view online products"
ON public.products FOR SELECT
TO anon
USING (is_online = true AND is_active = true);

-- PUBLIC read for tenants info (for marketplace listing)
CREATE POLICY "Anyone can view active tenants"
ON public.tenants FOR SELECT
TO anon
USING (is_active = true);

-- Online orders policies
CREATE POLICY "Authenticated users can create orders"
ON public.online_orders FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Users can view own orders"
ON public.online_orders FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Tenant members can view their orders"
ON public.online_orders FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

CREATE POLICY "Tenant members can update their orders"
ON public.online_orders FOR UPDATE
TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

CREATE POLICY "Superadmin can manage all online_orders"
ON public.online_orders FOR ALL
TO authenticated
USING (is_superadmin(auth.uid()))
WITH CHECK (is_superadmin(auth.uid()));

-- Online order items policies
CREATE POLICY "Authenticated users can insert order items"
ON public.online_order_items FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Users can view own order items"
ON public.online_order_items FOR SELECT
TO authenticated
USING (order_id IN (SELECT id FROM online_orders WHERE user_id = auth.uid()));

CREATE POLICY "Tenant members can view order items"
ON public.online_order_items FOR SELECT
TO authenticated
USING (order_id IN (SELECT id FROM online_orders WHERE tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())));

CREATE POLICY "Superadmin can manage all online_order_items"
ON public.online_order_items FOR ALL
TO authenticated
USING (is_superadmin(auth.uid()))
WITH CHECK (is_superadmin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_online_orders_updated_at
BEFORE UPDATE ON public.online_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for online orders
ALTER PUBLICATION supabase_realtime ADD TABLE public.online_orders;
