
-- Products table for inventory management
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text NOT NULL,
  description text,
  category text,
  price numeric NOT NULL DEFAULT 0,
  cost numeric NOT NULL DEFAULT 0,
  stock integer NOT NULL DEFAULT 0,
  min_stock integer NOT NULL DEFAULT 0,
  warehouse_id uuid,
  tenant_id uuid REFERENCES public.tenants(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Stores table (replaces hardcoded stores)
CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  phone text,
  email text,
  manager_id uuid REFERENCES public.employees(id),
  tenant_id uuid REFERENCES public.tenants(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Warehouses table (replaces hardcoded warehouses)
CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  capacity integer DEFAULT 0,
  tenant_id uuid REFERENCES public.tenants(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add warehouse_id FK to products
ALTER TABLE public.products ADD CONSTRAINT products_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);

-- Inventory movements tracking
CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id),
  warehouse_id uuid REFERENCES public.warehouses(id),
  movement_type text NOT NULL DEFAULT 'entry',
  quantity integer NOT NULL,
  previous_stock integer NOT NULL DEFAULT 0,
  new_stock integer NOT NULL DEFAULT 0,
  reason text,
  reference_id uuid,
  reference_type text,
  performed_by uuid,
  tenant_id uuid REFERENCES public.tenants(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Activity log for tracking actions on customers, employees, stores, warehouses
CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}',
  performed_by uuid,
  tenant_id uuid REFERENCES public.tenants(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add employee_id to sales_shifts for cajero tracking
ALTER TABLE public.sales_shifts ADD COLUMN employee_id uuid REFERENCES public.employees(id);
-- Add store_id to sales_shifts to link to stores table
ALTER TABLE public.sales_shifts ADD COLUMN store_id uuid REFERENCES public.stores(id);

-- Enable RLS on all new tables
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Products RLS
CREATE POLICY "Tenant members can view products" ON public.products FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);
CREATE POLICY "Tenant members can insert products" ON public.products FOR INSERT WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);
CREATE POLICY "Tenant members can update products" ON public.products FOR UPDATE USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);
CREATE POLICY "Admins can delete products" ON public.products FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role)
);

-- Stores RLS
CREATE POLICY "Tenant members can view stores" ON public.stores FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);
CREATE POLICY "Tenant members can insert stores" ON public.stores FOR INSERT WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);
CREATE POLICY "Tenant members can update stores" ON public.stores FOR UPDATE USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);
CREATE POLICY "Admins can delete stores" ON public.stores FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role)
);

-- Warehouses RLS
CREATE POLICY "Tenant members can view warehouses" ON public.warehouses FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);
CREATE POLICY "Tenant members can insert warehouses" ON public.warehouses FOR INSERT WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);
CREATE POLICY "Tenant members can update warehouses" ON public.warehouses FOR UPDATE USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);
CREATE POLICY "Admins can delete warehouses" ON public.warehouses FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role)
);

-- Inventory movements RLS
CREATE POLICY "Tenant members can view movements" ON public.inventory_movements FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);
CREATE POLICY "Tenant members can insert movements" ON public.inventory_movements FOR INSERT WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);

-- Activity log RLS
CREATE POLICY "Tenant members can view activity" ON public.activity_log FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);
CREATE POLICY "Tenant members can insert activity" ON public.activity_log FOR INSERT WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);

-- Updated_at triggers
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_warehouses_updated_at BEFORE UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
