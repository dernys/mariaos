WITH matrix(role, slug, v, c, e, d) AS (VALUES
  -- gerente
  ('gerente','dashboard',true,false,false,false),
  ('gerente','analytics',true,false,false,false),
  ('gerente','reportes',true,true,true,false),
  ('gerente','pos',true,true,true,true),
  ('gerente','ventas',true,true,true,true),
  ('gerente','mesas',true,true,true,true),
  ('gerente','cocina',true,true,true,true),
  ('gerente','turnos',true,true,true,true),
  ('gerente','inventario',true,true,true,true),
  ('gerente','recetas',true,true,true,true),
  ('gerente','conteos',true,true,true,true),
  ('gerente','almacenes',true,true,true,true),
  ('gerente','tiendas',true,true,true,false),
  ('gerente','operaciones',true,true,true,true),
  ('gerente','transferencias',true,true,true,true),
  ('gerente','compras',true,true,true,true),
  ('gerente','proveedores',true,true,true,true),
  ('gerente','devoluciones',true,true,true,false),
  ('gerente','facturas',true,true,true,false),
  ('gerente','cuentas',true,true,true,false),
  ('gerente','consignaciones',true,true,true,true),
  ('gerente','clientes',true,true,true,true),
  ('gerente','empleados',true,true,true,false),
  ('gerente','rrhh',true,true,true,false),
  ('gerente','portal-empleado',true,true,false,false),
  ('gerente','fidelizacion',true,true,true,false),
  ('gerente','contabilidad',true,true,false,false),
  ('gerente','tesoreria',true,true,true,false),
  ('gerente','pedidos-online',true,true,true,true),
  ('gerente','delivery',true,true,true,true),
  ('gerente','marketplace',true,true,true,false),
  ('gerente','agents',true,false,false,false),
  ('gerente','mariaos',true,false,false,false),
  ('gerente','roles',true,false,false,false),
  ('gerente','configuracion',true,false,false,false),
  -- contador
  ('contador','dashboard',true,false,false,false),
  ('contador','analytics',true,false,false,false),
  ('contador','reportes',true,true,true,false),
  ('contador','contabilidad',true,true,true,true),
  ('contador','tesoreria',true,true,true,true),
  ('contador','facturas',true,true,true,true),
  ('contador','cuentas',true,true,true,true),
  ('contador','compras',true,true,true,false),
  ('contador','devoluciones',true,false,false,false),
  ('contador','ventas',true,false,false,false),
  ('contador','inventario',true,false,false,false),
  ('contador','conteos',true,false,false,false),
  ('contador','clientes',true,false,false,false),
  ('contador','proveedores',true,true,true,false),
  ('contador','empleados',true,false,false,false),
  ('contador','rrhh',true,false,false,false),
  ('contador','portal-empleado',true,true,false,false),
  ('contador','turnos',true,false,false,false),
  ('contador','consignaciones',true,false,false,false),
  -- supervisor
  ('supervisor','dashboard',true,false,false,false),
  ('supervisor','analytics',true,false,false,false),
  ('supervisor','reportes',true,false,false,false),
  ('supervisor','pos',true,true,true,false),
  ('supervisor','ventas',true,true,true,false),
  ('supervisor','mesas',true,true,true,false),
  ('supervisor','cocina',true,true,true,false),
  ('supervisor','turnos',true,true,true,false),
  ('supervisor','inventario',true,true,true,false),
  ('supervisor','recetas',true,true,true,false),
  ('supervisor','conteos',true,true,true,false),
  ('supervisor','transferencias',true,true,true,false),
  ('supervisor','almacenes',true,false,false,false),
  ('supervisor','compras',true,true,true,false),
  ('supervisor','proveedores',true,false,false,false),
  ('supervisor','devoluciones',true,true,true,false),
  ('supervisor','clientes',true,true,true,false),
  ('supervisor','empleados',true,false,false,false),
  ('supervisor','portal-empleado',true,true,false,false),
  ('supervisor','pedidos-online',true,true,true,false),
  ('supervisor','delivery',true,true,true,false),
  ('supervisor','fidelizacion',true,true,false,false),
  -- cajero
  ('cajero','dashboard',true,false,false,false),
  ('cajero','pos',true,true,true,false),
  ('cajero','ventas',true,true,false,false),
  ('cajero','turnos',true,true,true,false),
  ('cajero','mesas',true,true,true,false),
  ('cajero','cocina',true,true,true,false),
  ('cajero','clientes',true,true,false,false),
  ('cajero','inventario',true,false,false,false),
  ('cajero','pedidos-online',true,true,true,false),
  ('cajero','devoluciones',true,true,false,false),
  ('cajero','fidelizacion',true,true,false,false),
  ('cajero','portal-empleado',true,true,false,false),
  -- inventarista
  ('inventarista','dashboard',true,false,false,false),
  ('inventarista','inventario',true,true,true,false),
  ('inventarista','recetas',true,true,true,false),
  ('inventarista','conteos',true,true,true,false),
  ('inventarista','transferencias',true,true,true,false),
  ('inventarista','almacenes',true,true,true,false),
  ('inventarista','consignaciones',true,true,true,false),
  ('inventarista','compras',true,false,false,false),
  ('inventarista','proveedores',true,false,false,false),
  ('inventarista','portal-empleado',true,true,false,false),
  -- empleado
  ('empleado','portal-empleado',true,true,false,false),
  ('empleado','turnos',true,false,false,false),
  ('empleado','mesas',true,false,false,false),
  ('empleado','cocina',true,true,true,false),
  ('empleado','dashboard',true,false,false,false)
)
INSERT INTO public.role_permissions (role, module_id, can_view, can_create, can_edit, can_delete)
SELECT m.role::public.app_role, am.id, m.v, m.c, m.e, m.d
FROM matrix m JOIN public.app_modules am ON am.slug = m.slug
ON CONFLICT (role, module_id) DO UPDATE
SET can_view = EXCLUDED.can_view,
    can_create = EXCLUDED.can_create,
    can_edit = EXCLUDED.can_edit,
    can_delete = EXCLUDED.can_delete;

-- admin: full access on every module
INSERT INTO public.role_permissions (role, module_id, can_view, can_create, can_edit, can_delete)
SELECT 'admin'::public.app_role, id, true, true, true, true FROM public.app_modules
ON CONFLICT (role, module_id) DO UPDATE
SET can_view = true, can_create = true, can_edit = true, can_delete = true;

CREATE OR REPLACE FUNCTION public.my_permissions()
RETURNS TABLE (slug text, can_view boolean, can_create boolean, can_edit boolean, can_delete boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT am.slug,
         bool_or(rp.can_view)   AS can_view,
         bool_or(rp.can_create) AS can_create,
         bool_or(rp.can_edit)   AS can_edit,
         bool_or(rp.can_delete) AS can_delete
  FROM public.user_roles ur
  JOIN public.role_permissions rp ON rp.role = ur.role
  JOIN public.app_modules am ON am.id = rp.module_id
  WHERE ur.user_id = auth.uid()
  GROUP BY am.slug
$$;

REVOKE ALL ON FUNCTION public.my_permissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_permissions() TO authenticated;