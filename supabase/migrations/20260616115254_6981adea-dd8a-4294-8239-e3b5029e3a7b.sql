
-- ============================================================
-- BLOQUE H: Perfiles contables regionales
-- ============================================================

-- 1) accounting_profiles
CREATE TABLE IF NOT EXISTS public.accounting_profiles (
  code text PRIMARY KEY,
  country_code text NOT NULL,
  regime text NOT NULL,
  name text NOT NULL,
  description text,
  base_currency text NOT NULL DEFAULT 'USD',
  functional_currency text NOT NULL DEFAULT 'USD',
  fiscal_calendar jsonb NOT NULL DEFAULT '{"start_month":1,"end_month":12}'::jsonb,
  costing_method text NOT NULL DEFAULT 'weighted_avg',
  regulatory_exports jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.accounting_profiles TO authenticated, anon;
GRANT ALL ON public.accounting_profiles TO service_role;
ALTER TABLE public.accounting_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read profiles" ON public.accounting_profiles FOR SELECT TO authenticated, anon USING (true);

-- 2) chart_account_templates
CREATE TABLE IF NOT EXISTS public.chart_account_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_code text NOT NULL REFERENCES public.accounting_profiles(code) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  type text NOT NULL,        -- asset|liability|equity|income|expense|cost
  nature text NOT NULL,      -- debit|credit
  parent_code text,
  is_header boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE(profile_code, code)
);
CREATE INDEX IF NOT EXISTS idx_chart_tmpl_profile ON public.chart_account_templates(profile_code);

GRANT SELECT ON public.chart_account_templates TO authenticated;
GRANT ALL ON public.chart_account_templates TO service_role;
ALTER TABLE public.chart_account_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read chart templates" ON public.chart_account_templates FOR SELECT TO authenticated USING (true);

-- 3) tax_templates
CREATE TABLE IF NOT EXISTS public.tax_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_code text NOT NULL REFERENCES public.accounting_profiles(code) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  rate numeric NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'sale', -- sale|purchase|payroll|income
  UNIQUE(profile_code, code)
);

GRANT SELECT ON public.tax_templates TO authenticated;
GRANT ALL ON public.tax_templates TO service_role;
ALTER TABLE public.tax_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read tax templates" ON public.tax_templates FOR SELECT TO authenticated USING (true);

-- 4) tenants: country + profile
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS country_code text DEFAULT 'CU';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS accounting_profile_code text REFERENCES public.accounting_profiles(code);

-- 5) Función apply_accounting_profile
CREATE OR REPLACE FUNCTION public.apply_accounting_profile(p_tenant_id uuid, p_profile_code text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tmpl record;
  v_parent_id uuid;
  v_count int := 0;
  v_tax record;
BEGIN
  -- Asignar perfil al tenant
  UPDATE public.tenants SET accounting_profile_code = p_profile_code WHERE id = p_tenant_id;

  -- Insertar cuentas faltantes en orden de jerarquía
  FOR v_tmpl IN
    SELECT * FROM public.chart_account_templates
    WHERE profile_code = p_profile_code
    ORDER BY length(code), sort_order, code
  LOOP
    v_parent_id := NULL;
    IF v_tmpl.parent_code IS NOT NULL THEN
      SELECT id INTO v_parent_id FROM public.accounting_accounts
      WHERE tenant_id = p_tenant_id AND code = v_tmpl.parent_code;
    END IF;

    INSERT INTO public.accounting_accounts (tenant_id, code, name, type, nature, parent_id, is_active)
    VALUES (p_tenant_id, v_tmpl.code, v_tmpl.name, v_tmpl.type, v_tmpl.nature, v_parent_id, true)
    ON CONFLICT (tenant_id, code) DO UPDATE
      SET name = EXCLUDED.name, type = EXCLUDED.type, nature = EXCLUDED.nature;
    v_count := v_count + 1;
  END LOOP;

  -- Insertar impuestos plantilla
  FOR v_tax IN SELECT * FROM public.tax_templates WHERE profile_code = p_profile_code LOOP
    INSERT INTO public.tax_rates (tenant_id, code, name, rate, is_active)
    VALUES (p_tenant_id, v_tax.code, v_tax.name, v_tax.rate, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 6) Auditoría
DROP TRIGGER IF EXISTS audit_accounting_profiles ON public.accounting_profiles;
CREATE TRIGGER audit_accounting_profiles
AFTER INSERT OR UPDATE OR DELETE ON public.accounting_profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- 7) SEED de perfiles
INSERT INTO public.accounting_profiles (code, country_code, regime, name, description, base_currency, functional_currency, regulatory_exports) VALUES
  ('GENERIC',  'XX', 'general',     'Genérico Internacional', 'Plan de cuentas genérico multi-país', 'USD', 'USD', '[]'::jsonb),
  ('CU-GEN',   'CU', 'general',     'Cuba — Empresa Estatal/Mixta', 'NCIF Normas Cubanas de Información Financiera', 'CUP', 'CUP', '["ONAT-DJ08","ONAT-DJ09"]'::jsonb),
  ('CU-MIPYME','CU', 'mipyme',      'Cuba — MIPYME / TCP', 'Régimen simplificado MIPYME y Trabajador por Cuenta Propia', 'CUP', 'CUP', '["ONAT-DJ08"]'::jsonb),
  ('BR-REAL',  'BR', 'lucro_real',  'Brasil — Lucro Real', 'Régimen de Lucro Real con SPED ECD/ECF', 'BRL', 'BRL', '["SPED-ECD","SPED-ECF","EFD-Contribuicoes","EFD-ICMS-IPI","eSocial"]'::jsonb),
  ('BR-PRES',  'BR', 'lucro_presumido', 'Brasil — Lucro Presumido', 'Régimen Presumido con SPED Contribuições', 'BRL', 'BRL', '["SPED-ECD","EFD-Contribuicoes"]'::jsonb),
  ('BR-SIMP',  'BR', 'simples_nacional','Brasil — Simples Nacional', 'Régimen simplificado unificado', 'BRL', 'BRL', '["PGDAS-D"]'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- 8) PLANTILLA GENÉRICA (referenciada por las reglas de Bloque G)
INSERT INTO public.chart_account_templates (profile_code, code, name, type, nature, parent_code, is_header, sort_order) VALUES
  ('GENERIC','1','ACTIVO','asset','debit',NULL,true,1),
  ('GENERIC','11','Activo Circulante','asset','debit','1',true,2),
  ('GENERIC','1101','Caja','asset','debit','11',false,3),
  ('GENERIC','1102','Bancos','asset','debit','11',false,4),
  ('GENERIC','1105','Cuentas por Cobrar','asset','debit','11',false,5),
  ('GENERIC','1108','IVA Acreditable','asset','debit','11',false,6),
  ('GENERIC','12','Inventarios','asset','debit','1',true,7),
  ('GENERIC','1201','Inventario de Mercancías','asset','debit','12',false,8),
  ('GENERIC','2','PASIVO','liability','credit',NULL,true,10),
  ('GENERIC','21','Pasivo Circulante','liability','credit','2',true,11),
  ('GENERIC','2101','Cuentas por Pagar','liability','credit','21',false,12),
  ('GENERIC','2103','IVA Trasladado','liability','credit','21',false,13),
  ('GENERIC','2104','Nóminas por Pagar','liability','credit','21',false,14),
  ('GENERIC','2105','Pasivo por Fidelización','liability','credit','21',false,15),
  ('GENERIC','3','PATRIMONIO','equity','credit',NULL,true,20),
  ('GENERIC','3101','Capital Social','equity','credit','3',false,21),
  ('GENERIC','3201','Utilidades Acumuladas','equity','credit','3',false,22),
  ('GENERIC','3202','Utilidad del Ejercicio','equity','credit','3',false,23),
  ('GENERIC','4','INGRESOS','income','credit',NULL,true,30),
  ('GENERIC','4101','Ventas','income','credit','4',false,31),
  ('GENERIC','4102','Devoluciones sobre Ventas','income','debit','4',false,32),
  ('GENERIC','5','GASTOS Y COSTOS','expense','debit',NULL,true,40),
  ('GENERIC','5101','Costo de Mercancías Vendidas','cost','debit','5',false,41),
  ('GENERIC','5104','Ajustes de Inventario','cost','debit','5',false,42),
  ('GENERIC','5201','Gasto de Nómina','expense','debit','5',false,43),
  ('GENERIC','5202','Comisión a Repartidores','expense','debit','5',false,44),
  ('GENERIC','5203','Gasto por Fidelización','expense','debit','5',false,45)
ON CONFLICT DO NOTHING;

-- 9) PLANTILLA CUBA — NCIF (clases 1 Activo, 2 Pasivo, 3 Patrimonio, 4 Ingresos, 5 Gastos, 6 Costos)
INSERT INTO public.chart_account_templates (profile_code, code, name, type, nature, parent_code, is_header, sort_order) VALUES
  ('CU-GEN','100','ACTIVO','asset','debit',NULL,true,1),
  ('CU-GEN','110','Efectivo y Equivalentes','asset','debit','100',true,2),
  ('CU-GEN','1101','Caja CUP','asset','debit','110',false,3),
  ('CU-GEN','1102','Caja MLC','asset','debit','110',false,4),
  ('CU-GEN','1103','Banco CUP','asset','debit','110',false,5),
  ('CU-GEN','1104','Banco MLC','asset','debit','110',false,6),
  ('CU-GEN','1105','Cuentas por Cobrar Clientes','asset','debit','100',false,7),
  ('CU-GEN','1108','Tributos Pagados por Anticipado','asset','debit','100',false,8),
  ('CU-GEN','120','Inventarios','asset','debit','100',true,9),
  ('CU-GEN','1201','Mercancías para la Venta','asset','debit','120',false,10),
  ('CU-GEN','1202','Materias Primas y Materiales','asset','debit','120',false,11),
  ('CU-GEN','1203','Producción en Proceso','asset','debit','120',false,12),
  ('CU-GEN','1204','Producción Terminada','asset','debit','120',false,13),
  ('CU-GEN','200','PASIVO','liability','credit',NULL,true,20),
  ('CU-GEN','2101','Cuentas por Pagar Proveedores','liability','credit','200',false,21),
  ('CU-GEN','2103','Impuesto sobre Ventas por Pagar','liability','credit','200',false,22),
  ('CU-GEN','2104','Nóminas por Pagar','liability','credit','200',false,23),
  ('CU-GEN','2105','Pasivo por Fidelización','liability','credit','200',false,24),
  ('CU-GEN','2110','ONAT — Impuesto sobre Utilidades','liability','credit','200',false,25),
  ('CU-GEN','2111','ONAT — Contribución Seguridad Social','liability','credit','200',false,26),
  ('CU-GEN','2112','ONAT — Impuesto Fuerza de Trabajo','liability','credit','200',false,27),
  ('CU-GEN','300','PATRIMONIO','equity','credit',NULL,true,30),
  ('CU-GEN','3101','Capital Social','equity','credit','300',false,31),
  ('CU-GEN','3201','Reservas','equity','credit','300',false,32),
  ('CU-GEN','3202','Utilidad del Ejercicio','equity','credit','300',false,33),
  ('CU-GEN','400','INGRESOS','income','credit',NULL,true,40),
  ('CU-GEN','4101','Ingresos por Ventas','income','credit','400',false,41),
  ('CU-GEN','4102','Devoluciones sobre Ventas','income','debit','400',false,42),
  ('CU-GEN','4103','Ingresos por Servicios','income','credit','400',false,43),
  ('CU-GEN','500','GASTOS','expense','debit',NULL,true,50),
  ('CU-GEN','5101','Costo de Mercancías Vendidas','cost','debit','500',false,51),
  ('CU-GEN','5102','Costo de Producción','cost','debit','500',false,52),
  ('CU-GEN','5104','Mermas y Ajustes de Inventario','cost','debit','500',false,53),
  ('CU-GEN','5201','Gastos de Nómina','expense','debit','500',false,54),
  ('CU-GEN','5202','Comisiones a Repartidores','expense','debit','500',false,55),
  ('CU-GEN','5203','Gasto por Fidelización','expense','debit','500',false,56),
  ('CU-GEN','5301','Gastos Generales y Administración','expense','debit','500',false,57),
  ('CU-GEN','5401','Tributos sobre Utilidades (ONAT)','expense','debit','500',false,58)
ON CONFLICT DO NOTHING;

-- Cuba MIPYME usa el mismo plan base que CU-GEN
INSERT INTO public.chart_account_templates (profile_code, code, name, type, nature, parent_code, is_header, sort_order)
SELECT 'CU-MIPYME', code, name, type, nature, parent_code, is_header, sort_order
FROM public.chart_account_templates WHERE profile_code = 'CU-GEN'
ON CONFLICT DO NOTHING;

-- 10) PLANTILLA BRASIL — Plano Referencial SPED-ECD
INSERT INTO public.chart_account_templates (profile_code, code, name, type, nature, parent_code, is_header, sort_order) VALUES
  ('BR-REAL','1','ATIVO','asset','debit',NULL,true,1),
  ('BR-REAL','1.1','Ativo Circulante','asset','debit','1',true,2),
  ('BR-REAL','1.1.01','Caixa','asset','debit','1.1',false,3),
  ('BR-REAL','1.1.02','Bancos Conta Movimento','asset','debit','1.1',false,4),
  ('BR-REAL','1.1.05','Clientes a Receber','asset','debit','1.1',false,5),
  ('BR-REAL','1.1.08','ICMS a Recuperar','asset','debit','1.1',false,6),
  ('BR-REAL','1.1.09','PIS/COFINS a Recuperar','asset','debit','1.1',false,7),
  ('BR-REAL','1.2','Estoques','asset','debit','1',true,8),
  ('BR-REAL','1.2.01','Mercadorias para Revenda','asset','debit','1.2',false,9),
  ('BR-REAL','1.2.02','Matéria-Prima','asset','debit','1.2',false,10),
  ('BR-REAL','2','PASSIVO','liability','credit',NULL,true,20),
  ('BR-REAL','2.1','Passivo Circulante','liability','credit','2',true,21),
  ('BR-REAL','2.1.01','Fornecedores','liability','credit','2.1',false,22),
  ('BR-REAL','2.1.03','ICMS a Recolher','liability','credit','2.1',false,23),
  ('BR-REAL','2.1.04','ISS a Recolher','liability','credit','2.1',false,24),
  ('BR-REAL','2.1.05','PIS a Recolher','liability','credit','2.1',false,25),
  ('BR-REAL','2.1.06','COFINS a Recolher','liability','credit','2.1',false,26),
  ('BR-REAL','2.1.07','IRPJ a Pagar','liability','credit','2.1',false,27),
  ('BR-REAL','2.1.08','CSLL a Pagar','liability','credit','2.1',false,28),
  ('BR-REAL','2.1.10','Salários a Pagar','liability','credit','2.1',false,29),
  ('BR-REAL','2.1.11','INSS a Recolher','liability','credit','2.1',false,30),
  ('BR-REAL','2.1.12','FGTS a Recolher','liability','credit','2.1',false,31),
  ('BR-REAL','3','PATRIMONIO LÍQUIDO','equity','credit',NULL,true,40),
  ('BR-REAL','3.1.01','Capital Social','equity','credit','3',false,41),
  ('BR-REAL','3.2.01','Reservas de Lucros','equity','credit','3',false,42),
  ('BR-REAL','3.2.02','Lucro do Exercício','equity','credit','3',false,43),
  ('BR-REAL','4','RECEITAS','income','credit',NULL,true,50),
  ('BR-REAL','4.1.01','Receita de Vendas','income','credit','4',false,51),
  ('BR-REAL','4.1.02','Devoluções de Vendas','income','debit','4',false,52),
  ('BR-REAL','4.1.03','Receita de Serviços','income','credit','4',false,53),
  ('BR-REAL','5','CUSTOS E DESPESAS','expense','debit',NULL,true,60),
  ('BR-REAL','5.1.01','CMV — Custo Mercadoria Vendida','cost','debit','5',false,61),
  ('BR-REAL','5.1.04','Ajustes de Estoque','cost','debit','5',false,62),
  ('BR-REAL','5.2.01','Despesas com Pessoal','expense','debit','5',false,63),
  ('BR-REAL','5.2.02','Comissão Entregadores','expense','debit','5',false,64),
  ('BR-REAL','5.2.03','Despesa de Fidelidade','expense','debit','5',false,65),
  ('BR-REAL','5.3.01','Despesas Administrativas','expense','debit','5',false,66),
  ('BR-REAL','5.4.01','IRPJ/CSLL do Exercício','expense','debit','5',false,67)
ON CONFLICT DO NOTHING;

INSERT INTO public.chart_account_templates (profile_code, code, name, type, nature, parent_code, is_header, sort_order)
SELECT 'BR-PRES', code, name, type, nature, parent_code, is_header, sort_order
FROM public.chart_account_templates WHERE profile_code = 'BR-REAL'
ON CONFLICT DO NOTHING;

INSERT INTO public.chart_account_templates (profile_code, code, name, type, nature, parent_code, is_header, sort_order)
SELECT 'BR-SIMP', code, name, type, nature, parent_code, is_header, sort_order
FROM public.chart_account_templates WHERE profile_code = 'BR-REAL'
ON CONFLICT DO NOTHING;

-- 11) Impuestos plantilla
INSERT INTO public.tax_templates (profile_code, code, name, rate, type) VALUES
  ('CU-GEN','IV','Impuesto sobre Ventas',10,'sale'),
  ('CU-GEN','IU','Impuesto sobre Utilidades',35,'income'),
  ('CU-GEN','CSS','Contribución Seguridad Social',14,'payroll'),
  ('CU-MIPYME','IV','Impuesto sobre Ventas',10,'sale'),
  ('CU-MIPYME','IU','Impuesto sobre Utilidades',35,'income'),
  ('BR-REAL','ICMS','ICMS',18,'sale'),
  ('BR-REAL','ISS','ISS',5,'sale'),
  ('BR-REAL','PIS','PIS',1.65,'sale'),
  ('BR-REAL','COFINS','COFINS',7.6,'sale'),
  ('BR-REAL','IRPJ','IRPJ',15,'income'),
  ('BR-REAL','CSLL','CSLL',9,'income'),
  ('BR-PRES','ICMS','ICMS',18,'sale'),
  ('BR-PRES','ISS','ISS',5,'sale'),
  ('BR-PRES','PIS','PIS',0.65,'sale'),
  ('BR-PRES','COFINS','COFINS',3,'sale'),
  ('BR-SIMP','DAS','DAS Simples Nacional',6,'sale')
ON CONFLICT DO NOTHING;
