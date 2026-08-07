ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'contador';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'empleado';

INSERT INTO public.app_modules (name, slug)
SELECT v.name, v.slug FROM (VALUES
  ('Tesorería','tesoreria'),
  ('Cocina','cocina'),
  ('Mesas','mesas'),
  ('Recetas','recetas'),
  ('Transferencias','transferencias'),
  ('Conteos','conteos'),
  ('Operaciones','operaciones'),
  ('Consignaciones','consignaciones'),
  ('Devoluciones','devoluciones'),
  ('Cuentas','cuentas'),
  ('Fidelización','fidelizacion'),
  ('Pedidos Online','pedidos-online'),
  ('Analítica','analytics'),
  ('Portal Empleado','portal-empleado'),
  ('Inteligencia de Negocio','mariaos')
) AS v(name, slug)
WHERE NOT EXISTS (SELECT 1 FROM public.app_modules m WHERE m.slug = v.slug);