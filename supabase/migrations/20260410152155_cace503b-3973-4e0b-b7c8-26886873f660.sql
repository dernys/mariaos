
-- Fix overly permissive INSERT on online_orders
DROP POLICY "Authenticated users can create orders" ON public.online_orders;
CREATE POLICY "Authenticated users can create own orders"
ON public.online_orders FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Fix overly permissive INSERT on online_order_items
DROP POLICY "Authenticated users can insert order items" ON public.online_order_items;
CREATE POLICY "Users can insert own order items"
ON public.online_order_items FOR INSERT
TO authenticated
WITH CHECK (order_id IN (SELECT id FROM online_orders WHERE user_id = auth.uid()));
