
-- Timestamp trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- App roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'gerente', 'supervisor', 'cajero', 'inventarista');

-- User roles table (separate from profiles per security best practice)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Modules table (the app modules)
CREATE TABLE public.app_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.app_modules ENABLE ROW LEVEL SECURITY;

-- Role permissions per module
CREATE TABLE public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  module_id UUID NOT NULL REFERENCES public.app_modules(id) ON DELETE CASCADE,
  can_view BOOLEAN NOT NULL DEFAULT false,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role, module_id)
);
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_role_permissions_updated_at
  BEFORE UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sales shifts table
CREATE TABLE public.sales_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  store_name TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  opening_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
  closing_cash NUMERIC(12,2),
  total_sales NUMERIC(12,2) DEFAULT 0,
  total_transactions INTEGER DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_shifts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_sales_shifts_updated_at
  BEFORE UPDATE ON public.sales_shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies

-- Profiles: users can read all, update own
CREATE POLICY "Anyone authenticated can view profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- User roles: admins manage, users see own
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Modules: all authenticated can read
CREATE POLICY "Authenticated can view modules"
  ON public.app_modules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage modules"
  ON public.app_modules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Role permissions: admins manage, all read
CREATE POLICY "Authenticated can view permissions"
  ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage permissions"
  ON public.role_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Sales shifts: users see own, admins see all
CREATE POLICY "Users can view own shifts"
  ON public.sales_shifts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all shifts"
  ON public.sales_shifts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can insert own shifts"
  ON public.sales_shifts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own shifts"
  ON public.sales_shifts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Seed default modules
INSERT INTO public.app_modules (name, slug, description, icon) VALUES
  ('Dashboard', 'dashboard', 'Panel principal con métricas', 'LayoutDashboard'),
  ('Punto de Venta', 'pos', 'Terminal de ventas', 'Monitor'),
  ('Inventario', 'inventario', 'Gestión de productos y stock', 'Package'),
  ('Tiendas', 'tiendas', 'Administración de tiendas', 'Store'),
  ('Almacenes', 'almacenes', 'Gestión de almacenes', 'Warehouse'),
  ('Configuración', 'configuracion', 'Ajustes del sistema', 'Settings'),
  ('Roles y Permisos', 'roles', 'Gestión de roles RBAC', 'Shield'),
  ('Turnos', 'turnos', 'Gestión de turnos de venta', 'Clock');

-- Seed default permissions for admin (all access)
INSERT INTO public.role_permissions (role, module_id, can_view, can_create, can_edit, can_delete)
SELECT 'admin', id, true, true, true, true FROM public.app_modules;

-- Seed default permissions for cajero (limited)
INSERT INTO public.role_permissions (role, module_id, can_view, can_create, can_edit, can_delete)
SELECT 'cajero', id, 
  CASE WHEN slug IN ('dashboard', 'pos', 'turnos') THEN true ELSE false END,
  CASE WHEN slug IN ('pos', 'turnos') THEN true ELSE false END,
  CASE WHEN slug = 'turnos' THEN true ELSE false END,
  false
FROM public.app_modules;
