
-- ============================================================
-- BR: JURISDICCIONES TRIBUTARIAS (ICMS por UF, ISS por município)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.br_tax_jurisdictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,                                  -- NULL = global (todas las tenants)
  kind text NOT NULL,                              -- 'ICMS', 'ISS', 'PIS', 'COFINS', 'IPI'
  uf_from text,                                    -- ICMS origen (NULL para ISS)
  uf_to text,                                      -- ICMS destino
  ibge_municipio text,                             -- código IBGE 7 dígitos (ISS)
  service_code text,                               -- lista LC 116 para ISS
  rate numeric(6,2) NOT NULL DEFAULT 0,
  reduction_pct numeric(6,2) NOT NULL DEFAULT 0,
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.br_tax_jurisdictions TO authenticated;
GRANT ALL ON public.br_tax_jurisdictions TO service_role;
ALTER TABLE public.br_tax_jurisdictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "br_tax_juris_read" ON public.br_tax_jurisdictions
  FOR SELECT TO authenticated
  USING (
    tenant_id IS NULL
    OR tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid())
  );

CREATE POLICY "br_tax_juris_write" ON public.br_tax_jurisdictions
  FOR ALL TO authenticated
  USING (
    tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS br_tax_juris_lookup_idx
  ON public.br_tax_jurisdictions(kind, uf_from, uf_to, ibge_municipio);

CREATE TRIGGER trg_br_tax_juris_updated_at
  BEFORE UPDATE ON public.br_tax_jurisdictions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_br_tax_juris_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.br_tax_jurisdictions
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- ============================================================
-- BR: NF-e / NFC-e
-- ============================================================
CREATE TABLE IF NOT EXISTS public.br_nfe_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  model text NOT NULL DEFAULT '55',          -- 55 NF-e, 65 NFC-e
  series text NOT NULL DEFAULT '1',
  number bigint,
  chave_acesso text,                          -- 44 dígitos
  protocolo_autorizacao text,
  status text NOT NULL DEFAULT 'draft',       -- draft, authorized, cancelled, rejected
  uf_emitter text NOT NULL,
  uf_recipient text,
  ibge_municipio_recipient text,
  cnpj_recipient text,
  total numeric(18,2) NOT NULL DEFAULT 0,
  icms_amount numeric(18,2) NOT NULL DEFAULT 0,
  iss_amount numeric(18,2) NOT NULL DEFAULT 0,
  pis_amount numeric(18,2) NOT NULL DEFAULT 0,
  cofins_amount numeric(18,2) NOT NULL DEFAULT 0,
  ipi_amount numeric(18,2) NOT NULL DEFAULT 0,
  xml_payload text,
  danfe_url text,
  sefaz_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  emitted_at timestamptz,
  authorized_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.br_nfe_documents TO authenticated;
GRANT ALL ON public.br_nfe_documents TO service_role;
ALTER TABLE public.br_nfe_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "br_nfe_tenant_access" ON public.br_nfe_documents
  FOR ALL TO authenticated
  USING (
    tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS br_nfe_tenant_idx ON public.br_nfe_documents(tenant_id, status);
CREATE INDEX IF NOT EXISTS br_nfe_chave_idx ON public.br_nfe_documents(chave_acesso) WHERE chave_acesso IS NOT NULL;

CREATE TRIGGER trg_br_nfe_updated_at
  BEFORE UPDATE ON public.br_nfe_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_br_nfe_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.br_nfe_documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- ============================================================
-- BR: SPED EXPORTS (ECD / ECF / EFD)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.br_sped_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  layout text NOT NULL,                       -- ECD, ECF, EFD-ICMS-IPI, EFD-Contribuicoes
  fiscal_year integer NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft',       -- draft, generated, transmitted
  file_url text,
  file_hash text,
  total_records integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz,
  transmitted_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.br_sped_exports TO authenticated;
GRANT ALL ON public.br_sped_exports TO service_role;
ALTER TABLE public.br_sped_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "br_sped_tenant_access" ON public.br_sped_exports
  FOR ALL TO authenticated
  USING (
    tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS br_sped_tenant_idx ON public.br_sped_exports(tenant_id, fiscal_year);

CREATE TRIGGER trg_br_sped_updated_at
  BEFORE UPDATE ON public.br_sped_exports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_br_sped_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.br_sped_exports
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- ============================================================
-- BR: eSOCIAL EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.br_esocial_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_code text NOT NULL,                   -- S-1000, S-2200, S-1200, S-2299, ...
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  reference_period text,                      -- 'YYYY-MM'
  status text NOT NULL DEFAULT 'draft',       -- draft, sent, accepted, rejected
  xml_payload text,
  protocol text,
  receipt text,
  esocial_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  reject_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.br_esocial_events TO authenticated;
GRANT ALL ON public.br_esocial_events TO service_role;
ALTER TABLE public.br_esocial_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "br_esocial_tenant_access" ON public.br_esocial_events
  FOR ALL TO authenticated
  USING (
    tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS br_esocial_tenant_idx ON public.br_esocial_events(tenant_id, event_code, reference_period);

CREATE TRIGGER trg_br_esocial_updated_at
  BEFORE UPDATE ON public.br_esocial_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_br_esocial_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.br_esocial_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- ============================================================
-- FUNCIONES BR
-- ============================================================
CREATE OR REPLACE FUNCTION public.br_get_icms_rate(p_uf_from text, p_uf_to text)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((
    SELECT rate FROM public.br_tax_jurisdictions
     WHERE kind = 'ICMS'
       AND uf_from = p_uf_from
       AND uf_to = p_uf_to
       AND (effective_to IS NULL OR effective_to >= current_date)
     ORDER BY effective_from DESC LIMIT 1
  ), 0);
$$;

CREATE OR REPLACE FUNCTION public.br_get_iss_rate(p_ibge text, p_service text DEFAULT NULL)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((
    SELECT rate FROM public.br_tax_jurisdictions
     WHERE kind = 'ISS'
       AND ibge_municipio = p_ibge
       AND (p_service IS NULL OR service_code = p_service OR service_code IS NULL)
       AND (effective_to IS NULL OR effective_to >= current_date)
     ORDER BY (service_code IS NOT NULL) DESC, effective_from DESC LIMIT 1
  ), 0);
$$;

CREATE OR REPLACE FUNCTION public.br_generate_nfe(p_sale_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sale record;
  v_id uuid;
  v_icms numeric := 0;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id;
  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'Venta % no existe', p_sale_id;
  END IF;

  INSERT INTO public.br_nfe_documents (
    tenant_id, sale_id, model, series, uf_emitter, total,
    icms_amount, status, emitted_at, created_by, payload
  ) VALUES (
    v_sale.tenant_id, v_sale.id, '65', '1', 'SP', v_sale.total,
    v_icms, 'draft', now(), auth.uid(), '{}'::jsonb
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.br_generate_sped_ecd(p_tenant_id uuid, p_fiscal_year integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_records int := 0;
  v_start date;
  v_end date;
BEGIN
  v_start := make_date(p_fiscal_year, 1, 1);
  v_end   := make_date(p_fiscal_year, 12, 31);

  SELECT COUNT(*) INTO v_records
    FROM public.journal_entries j
   WHERE j.tenant_id = p_tenant_id
     AND j.date BETWEEN v_start AND v_end
     AND COALESCE(j.status,'posted') = 'posted';

  INSERT INTO public.br_sped_exports (
    tenant_id, layout, fiscal_year, period_start, period_end,
    status, total_records, generated_at, created_by, payload
  ) VALUES (
    p_tenant_id, 'ECD', p_fiscal_year, v_start, v_end,
    'generated', v_records, now(), auth.uid(),
    jsonb_build_object('source','general_ledger','year',p_fiscal_year)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ============================================================
-- SEED: alícuotas ICMS por UF (subset) + ISS típico 5%
-- ============================================================
INSERT INTO public.br_tax_jurisdictions (kind, uf_from, uf_to, rate, notes) VALUES
  ('ICMS','SP','SP',18,'ICMS interno SP'),
  ('ICMS','RJ','RJ',20,'ICMS interno RJ'),
  ('ICMS','MG','MG',18,'ICMS interno MG'),
  ('ICMS','SP','RJ',12,'Interestadual S/SE'),
  ('ICMS','SP','MG',12,'Interestadual S/SE'),
  ('ICMS','SP','BA', 7,'Interestadual N/NE/CO'),
  ('ICMS','RJ','SP',12,'Interestadual S/SE'),
  ('ICMS','MG','SP',12,'Interestadual S/SE')
ON CONFLICT DO NOTHING;

INSERT INTO public.br_tax_jurisdictions (kind, ibge_municipio, rate, notes) VALUES
  ('ISS','3550308',5,'São Paulo - SP'),
  ('ISS','3304557',5,'Rio de Janeiro - RJ'),
  ('ISS','3106200',5,'Belo Horizonte - MG'),
  ('ISS','2927408',5,'Salvador - BA')
ON CONFLICT DO NOTHING;
