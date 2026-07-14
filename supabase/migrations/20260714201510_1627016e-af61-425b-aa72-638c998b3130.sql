
-- 1) Expand modules catalog
INSERT INTO public.app_modules (slug, name, icon, description) VALUES
  ('empleados','Empleados','users','Gestión de empleados y PIN de acceso'),
  ('clientes','Clientes','user','Cartera de clientes y saldos'),
  ('ventas','Ventas','receipt','Historial y gestión de ventas'),
  ('compras','Compras','shopping-cart','Órdenes de compra y recepciones'),
  ('proveedores','Proveedores','truck','Catálogo de proveedores'),
  ('facturas','Facturas','file-text','Facturación electrónica'),
  ('contabilidad','Contabilidad','book-open','Motor contable y reportes'),
  ('rrhh','Recursos Humanos','briefcase','Nómina, puestos y asistencia'),
  ('delivery','Delivery','bike','Repartidores y asignaciones'),
  ('marketplace','Marketplace','store','Tienda online pública'),
  ('agents','Agentes IA','bot','Automatizaciones con IA'),
  ('reportes','Reportes','bar-chart','Analítica y KPIs')
ON CONFLICT (slug) DO NOTHING;

-- 2) Seed sensible role_permissions for every module x role that's missing
DO $$
DECLARE
  m RECORD;
  r public.app_role;
  v_view BOOL; v_create BOOL; v_edit BOOL; v_delete BOOL;
BEGIN
  FOR m IN SELECT id, slug FROM public.app_modules LOOP
    FOREACH r IN ARRAY ARRAY['admin','gerente','supervisor','cajero','inventarista']::public.app_role[] LOOP
      -- Defaults per role
      v_view := TRUE; v_create := FALSE; v_edit := FALSE; v_delete := FALSE;
      IF r = 'admin' THEN
        v_create := TRUE; v_edit := TRUE; v_delete := TRUE;
      ELSIF r = 'gerente' THEN
        v_create := TRUE; v_edit := TRUE;
        v_delete := (m.slug IN ('clientes','ventas','compras','empleados','proveedores'));
      ELSIF r = 'supervisor' THEN
        v_create := (m.slug IN ('inventario','almacenes','ventas','clientes','turnos'));
        v_edit := TRUE;
      ELSIF r = 'cajero' THEN
        v_view := (m.slug IN ('pos','turnos','ventas','clientes','dashboard','marketplace'));
        v_create := (m.slug IN ('pos','ventas','clientes','turnos'));
        v_edit := (m.slug IN ('pos','ventas','clientes'));
      ELSIF r = 'inventarista' THEN
        v_view := (m.slug IN ('inventario','almacenes','compras','proveedores','productos','dashboard','reportes'));
        v_create := v_view AND (m.slug <> 'reportes' AND m.slug <> 'dashboard');
        v_edit := v_create;
      END IF;

      INSERT INTO public.role_permissions (role, module_id, can_view, can_create, can_edit, can_delete)
      VALUES (r, m.id, v_view, v_create, v_edit, v_delete)
      ON CONFLICT (role, module_id) DO NOTHING;
    END LOOP;
  END LOOP;
END$$;

-- 3) Backfill positions on demo tenants that lack them (MarIA Demo set)
DO $$
DECLARE
  t RECORD;
  admin_pos UUID;
  cashier_pos UUID;
  worker_pos UUID;
BEGIN
  FOR t IN SELECT id, business_type FROM public.tenants WHERE name ILIKE '%MarIA Demo%' LOOP
    -- Ensure 3 baseline positions per tenant
    INSERT INTO public.job_positions (tenant_id, code, name, base_salary, is_active)
    VALUES (t.id,'ADM','Administrador',15000,TRUE)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.job_positions (tenant_id, code, name, base_salary, is_active)
    VALUES (t.id,'CAJ','Cajero',8000,TRUE)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.job_positions (tenant_id, code, name, base_salary, is_active)
    VALUES (t.id,
      CASE t.business_type WHEN 'bar' THEN 'BAR' WHEN 'restaurant' THEN 'MES' ELSE 'VEN' END,
      CASE t.business_type WHEN 'bar' THEN 'Bartender' WHEN 'restaurant' THEN 'Mesero' ELSE 'Vendedor' END,
      9000,TRUE)
    ON CONFLICT DO NOTHING;

    SELECT id INTO admin_pos FROM public.job_positions WHERE tenant_id=t.id AND code='ADM' LIMIT 1;
    SELECT id INTO cashier_pos FROM public.job_positions WHERE tenant_id=t.id AND code='CAJ' LIMIT 1;
    SELECT id INTO worker_pos FROM public.job_positions WHERE tenant_id=t.id AND code IN ('BAR','MES','VEN') LIMIT 1;

    -- Assign fallback position to employees missing one
    UPDATE public.employees SET position_id = COALESCE(
      CASE WHEN LOWER(COALESCE(position,'')) ~ 'admin|gerent' THEN admin_pos
           WHEN LOWER(COALESCE(position,'')) ~ 'caj' THEN cashier_pos
           ELSE worker_pos END,
      worker_pos
    )
    WHERE tenant_id=t.id AND position_id IS NULL;
  END LOOP;
END$$;

-- 4) Ensure every active employee has a PIN (default 1234 if NULL)
UPDATE public.employees
   SET access_pin_hash = crypt('1234', gen_salt('bf'))
 WHERE access_pin_hash IS NULL AND is_active;
