-- =====================================================================
-- Sprint D · 1. Motor de reglas fiscales declarativas por país
-- =====================================================================
CREATE TABLE public.fiscal_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  country_code text NOT NULL,
  rule_type text NOT NULL CHECK (rule_type IN ('vat','sales_tax','withholding','turnover','income_tax','social_security')),
  code text NOT NULL,
  name text NOT NULL,
  rate numeric NOT NULL DEFAULT 0,
  base text NOT NULL DEFAULT 'net' CHECK (base IN ('net','gross')),
  applies_to text NOT NULL DEFAULT 'sale' CHECK (applies_to IN ('sale','purchase','payroll','service','any')),
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_rules TO authenticated;
GRANT ALL ON public.fiscal_rules TO service_role;

ALTER TABLE public.fiscal_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Global fiscal catalog is readable"
  ON public.fiscal_rules FOR SELECT TO authenticated
  USING (tenant_id IS NULL);

CREATE POLICY "Members read tenant fiscal rules"
  ON public.fiscal_rules FOR SELECT TO authenticated
  USING (tenant_id IS NOT NULL AND (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid())));

CREATE POLICY "Members write tenant fiscal rules"
  ON public.fiscal_rules FOR INSERT TO authenticated
  WITH CHECK (tenant_id IS NOT NULL AND (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid())));

CREATE POLICY "Members update tenant fiscal rules"
  ON public.fiscal_rules FOR UPDATE TO authenticated
  USING (tenant_id IS NOT NULL AND (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid())))
  WITH CHECK (tenant_id IS NOT NULL AND (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid())));

CREATE POLICY "Members delete tenant fiscal rules"
  ON public.fiscal_rules FOR DELETE TO authenticated
  USING (tenant_id IS NOT NULL AND (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid())));

CREATE TRIGGER trg_fiscal_rules_updated_at
  BEFORE UPDATE ON public.fiscal_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE UNIQUE INDEX uq_fiscal_rules_global ON public.fiscal_rules (country_code, code, applies_to) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX uq_fiscal_rules_tenant ON public.fiscal_rules (tenant_id, code, applies_to) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_fiscal_rules_lookup ON public.fiscal_rules (country_code, applies_to, is_active);

-- Catálogo global (tenant_id NULL) -----------------------------------
INSERT INTO public.fiscal_rules (country_code, rule_type, code, name, rate, base, applies_to, is_default, config) VALUES
  -- Cuba
  ('CU','sales_tax','CU_IVENTAS','Impuesto sobre ventas (ONAT)',10,'net','sale',true,'{"authority":"ONAT","declaration":"DJ-08"}'),
  ('CU','turnover','CU_ISP','Impuesto sobre servicios públicos',10,'net','service',false,'{"authority":"ONAT"}'),
  ('CU','income_tax','CU_IUP','Impuesto sobre utilidades',35,'net','any',false,'{"authority":"ONAT","annual":true}'),
  ('CU','social_security','CU_SEG','Contribución a la seguridad social',14,'net','payroll',false,'{"authority":"ONAT"}'),
  -- España
  ('ES','vat','ES_IVA_GEN','IVA general',21,'net','any',true,'{"authority":"AEAT","model":"303"}'),
  ('ES','vat','ES_IVA_RED','IVA reducido',10,'net','any',false,'{"authority":"AEAT","model":"303"}'),
  ('ES','vat','ES_IVA_SUP','IVA superreducido',4,'net','any',false,'{"authority":"AEAT","model":"303"}'),
  ('ES','withholding','ES_IRPF_PRO','Retención IRPF profesionales',-15,'net','purchase',false,'{"authority":"AEAT","model":"111"}'),
  -- México
  ('MX','vat','MX_IVA','IVA',16,'net','any',true,'{"authority":"SAT"}'),
  ('MX','withholding','MX_RET_IVA','Retención de IVA',-10.6667,'net','purchase',false,'{"authority":"SAT"}'),
  ('MX','withholding','MX_RET_ISR','Retención de ISR',-10,'net','purchase',false,'{"authority":"SAT"}'),
  -- Perú
  ('PE','vat','PE_IGV','IGV',18,'net','any',true,'{"authority":"SUNAT"}'),
  ('PE','withholding','PE_RET','Retención IGV',-3,'gross','purchase',false,'{"authority":"SUNAT"}'),
  -- Colombia
  ('CO','vat','CO_IVA','IVA',19,'net','any',true,'{"authority":"DIAN"}'),
  ('CO','withholding','CO_RETEFUENTE','Retención en la fuente servicios',-4,'net','purchase',false,'{"authority":"DIAN"}'),
  -- Brasil
  ('BR','vat','BR_ICMS','ICMS (tasa interestatal por defecto)',18,'net','sale',true,'{"authority":"SEFAZ","jurisdictional":true}'),
  ('BR','vat','BR_ISS','ISS servicios',5,'net','service',false,'{"authority":"Prefeitura","jurisdictional":true}'),
  -- Estados Unidos
  ('US','sales_tax','US_SALES','Sales tax (configurar por estado)',0,'net','sale',true,'{"authority":"State DOR","configurable":true}'),
  -- Argentina
  ('AR','vat','AR_IVA','IVA',21,'net','any',true,'{"authority":"AFIP"}'),
  ('AR','withholding','AR_RET_GAN','Retención Ganancias',-2,'net','purchase',false,'{"authority":"AFIP"}');

-- Reglas vigentes de un tenant: sus propias reglas ganan al catálogo global
CREATE OR REPLACE FUNCTION public.resolve_fiscal_rules(p_tenant uuid, p_applies_to text DEFAULT NULL)
RETURNS TABLE (
  code text, name text, rule_type text, rate numeric, base text,
  applies_to text, is_default boolean, source text, config jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH t AS (SELECT COALESCE(country_code,'CU') AS cc FROM public.tenants WHERE id = p_tenant),
  own AS (
    SELECT f.code, f.name, f.rule_type, f.rate, f.base, f.applies_to, f.is_default, 'tenant'::text AS source, f.config
    FROM public.fiscal_rules f
    WHERE f.tenant_id = p_tenant AND f.is_active
      AND f.effective_from <= current_date
      AND (f.effective_to IS NULL OR f.effective_to >= current_date)
      AND (p_applies_to IS NULL OR f.applies_to IN (p_applies_to, 'any'))
  ),
  global AS (
    SELECT f.code, f.name, f.rule_type, f.rate, f.base, f.applies_to, f.is_default, 'catalog'::text AS source, f.config
    FROM public.fiscal_rules f, t
    WHERE f.tenant_id IS NULL AND f.country_code = t.cc AND f.is_active
      AND f.effective_from <= current_date
      AND (f.effective_to IS NULL OR f.effective_to >= current_date)
      AND (p_applies_to IS NULL OR f.applies_to IN (p_applies_to, 'any'))
      AND NOT EXISTS (SELECT 1 FROM own o WHERE o.code = f.code AND o.applies_to = f.applies_to)
  )
  SELECT * FROM own UNION ALL SELECT * FROM global ORDER BY is_default DESC, rule_type, code;
$$;

REVOKE ALL ON FUNCTION public.resolve_fiscal_rules(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_fiscal_rules(uuid, text) TO authenticated, service_role;

-- Desglose de impuestos/retenciones sobre una base
CREATE OR REPLACE FUNCTION public.compute_tax_breakdown(
  p_tenant uuid, p_base numeric, p_applies_to text DEFAULT 'sale', p_codes text[] DEFAULT NULL
)
RETURNS TABLE (code text, name text, rule_type text, rate numeric, amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.code, r.name, r.rule_type, r.rate,
         round(COALESCE(p_base,0) * r.rate / 100.0, 2) AS amount
  FROM public.resolve_fiscal_rules(p_tenant, p_applies_to) r
  WHERE (p_codes IS NOT NULL AND r.code = ANY(p_codes))
     OR (p_codes IS NULL AND r.is_default);
$$;

REVOKE ALL ON FUNCTION public.compute_tax_breakdown(uuid, numeric, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_tax_breakdown(uuid, numeric, text, text[]) TO authenticated, service_role;

-- =====================================================================
-- Sprint D · 2. Inteligencia predictiva: demanda y tesorería
-- =====================================================================
CREATE OR REPLACE FUNCTION public.forecast_demand(p_tenant uuid, p_window int DEFAULT 30, p_horizon int DEFAULT 30)
RETURNS TABLE (
  product_id uuid, product_name text, sku text, stock numeric, min_stock numeric,
  avg_daily numeric, projected_demand numeric, days_of_stock numeric, suggested_reorder numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH sold AS (
    SELECT si.product_id, SUM(si.qty)::numeric AS qty
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    WHERE s.tenant_id = p_tenant
      AND s.status IN ('paid','partial','completed')
      AND s.created_at >= now() - (p_window || ' days')::interval
    GROUP BY si.product_id
  )
  SELECT p.id, p.name, p.sku, COALESCE(p.stock,0)::numeric, COALESCE(p.min_stock,0)::numeric,
         round(COALESCE(sold.qty,0) / GREATEST(p_window,1), 3) AS avg_daily,
         round(COALESCE(sold.qty,0) / GREATEST(p_window,1) * p_horizon, 2) AS projected_demand,
         CASE WHEN COALESCE(sold.qty,0) = 0 THEN NULL
              ELSE round(COALESCE(p.stock,0) / (sold.qty / GREATEST(p_window,1)), 1) END AS days_of_stock,
         GREATEST(
           round(COALESCE(sold.qty,0) / GREATEST(p_window,1) * p_horizon + COALESCE(p.min_stock,0) - COALESCE(p.stock,0), 2),
           0
         ) AS suggested_reorder
  FROM public.products p
  LEFT JOIN sold ON sold.product_id = p.id
  WHERE p.tenant_id = p_tenant
  ORDER BY suggested_reorder DESC, avg_daily DESC;
$$;

REVOKE ALL ON FUNCTION public.forecast_demand(uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.forecast_demand(uuid, int, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.forecast_cashflow(p_tenant uuid, p_weeks int DEFAULT 8)
RETURNS TABLE (
  week_start date, inflow numeric, outflow numeric, net numeric,
  running_balance numeric, is_shortfall boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH opening AS (
    SELECT COALESCE(SUM(current_balance),0)::numeric AS bal
    FROM public.bank_accounts WHERE tenant_id = p_tenant AND COALESCE(is_active,true)
  ),
  weeks AS (
    SELECT (date_trunc('week', current_date)::date + (n * 7)) AS week_start
    FROM generate_series(0, GREATEST(p_weeks,1) - 1) AS n
  ),
  planned AS (
    SELECT date_trunc('week', tf.due_date)::date AS week_start,
           SUM(CASE WHEN tf.direction = 'in' THEN tf.amount ELSE 0 END)::numeric AS inflow,
           SUM(CASE WHEN tf.direction = 'out' THEN tf.amount ELSE 0 END)::numeric AS outflow
    FROM public.treasury_forecast tf
    WHERE tf.tenant_id = p_tenant AND tf.status = 'pending'
    GROUP BY 1
  ),
  payables AS (
    SELECT date_trunc('week', ap.due_date)::date AS week_start,
           SUM(GREATEST(COALESCE(ap.amount,0) - COALESCE(ap.amount_paid,0), 0))::numeric AS outflow
    FROM public.accounts_payable ap
    WHERE ap.tenant_id = p_tenant AND ap.status <> 'paid' AND ap.due_date IS NOT NULL
    GROUP BY 1
  ),
  receivables AS (
    SELECT date_trunc('week', i.issue_date)::date AS week_start,
           SUM(GREATEST(COALESCE(i.total,0) - COALESCE(i.amount_paid,0), 0))::numeric AS inflow
    FROM public.invoices i
    WHERE i.tenant_id = p_tenant AND i.status = 'issued'
    GROUP BY 1
  ),
  merged AS (
    SELECT w.week_start,
           COALESCE(p.inflow,0) + COALESCE(r.inflow,0) AS inflow,
           COALESCE(p.outflow,0) + COALESCE(ap.outflow,0) AS outflow
    FROM weeks w
    LEFT JOIN planned p ON p.week_start = w.week_start
    LEFT JOIN payables ap ON ap.week_start = w.week_start
    LEFT JOIN receivables r ON r.week_start = w.week_start
  )
  SELECT m.week_start,
         round(m.inflow,2), round(m.outflow,2), round(m.inflow - m.outflow,2),
         round((SELECT bal FROM opening) + SUM(m.inflow - m.outflow) OVER (ORDER BY m.week_start),2) AS running_balance,
         ((SELECT bal FROM opening) + SUM(m.inflow - m.outflow) OVER (ORDER BY m.week_start)) < 0 AS is_shortfall
  FROM merged m
  ORDER BY m.week_start;
$$;

REVOKE ALL ON FUNCTION public.forecast_cashflow(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.forecast_cashflow(uuid, int) TO authenticated, service_role;
