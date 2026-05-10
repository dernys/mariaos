CREATE OR REPLACE FUNCTION public.provision_default_ai_agents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ai_agents (tenant_id, type, name, description, status, autonomy_level)
  SELECT NEW.id, d.type::agent_type, d.name, d.description, 'active', 'suggest'
  FROM (VALUES
    ('cfo','CFO Agent','Vigila finanzas, márgenes, flujo de caja, CxC y CxP. Detecta riesgos financieros y propone decisiones.'),
    ('inventory','Inventory Agent','Optimiza stock, rotación, transferencias y reposiciones automáticas.'),
    ('operations','Operations Agent','Analiza ventas, turnos, productividad por tienda y empleados.'),
    ('marketplace','Marketplace Agent','Optimiza catálogo público, precios, conversión y campañas.'),
    ('compliance','Compliance Agent','Detecta inconsistencias contables, fraude, accesos sospechosos.'),
    ('procurement','Procurement Agent','Analiza proveedores, lead times y recomienda órdenes de compra.'),
    ('analytics','Analytics Agent','Detecta tendencias, anomalías y oportunidades de crecimiento.')
  ) AS d(type, name, description)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provision_ai_agents ON public.tenants;
CREATE TRIGGER trg_provision_ai_agents
AFTER INSERT ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.provision_default_ai_agents();