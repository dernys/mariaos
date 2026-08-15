-- ============================================================
-- 1. Catálogo oficial de claves del maestro de cuentas
-- ============================================================
CREATE OR REPLACE FUNCTION public.accounting_mapping_catalog()
RETURNS TABLE (
  mapping_key text, module text, operation text, side text,
  account_type text, role_alias text, fallback_codes text[], sort_order int
)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT * FROM (VALUES
    ('sale_revenue','sales','sale_completed','credit','income','sales',ARRAY['4100','400','700','401','4135'],10),
    ('sale_tax_payable','sales','sale_completed','credit','liability','tax_output',ARRAY['2200','210','477','208','2408'],20),
    ('sale_receivable','sales','sale_credit','debit','asset','receivables',ARRAY['1200','120','430','105','1305'],30),
    ('sale_cash','sales','sale_cash','debit','asset','cash',ARRAY['1100','101','570','1101'],40),
    ('sale_bank','sales','sale_card','debit','asset','bank',ARRAY['1110','110','572','102','1102'],50),
    ('cogs','sales','sale_completed','debit','cost','cogs',ARRAY['5100','50','600','501','6135'],60),
    ('inventory','inventory','stock_movement','credit','asset','inventory',ARRAY['1300','130','300','115','1435'],70),
    ('purchase_inventory','purchases','purchase_received','debit','asset',NULL,ARRAY['1300','130','300','115','1435'],80),
    ('purchase_tax_receivable','purchases','purchase_received','debit','asset','tax_input',ARRAY['2200','472','118','2408'],90),
    ('purchase_payable','purchases','purchase_received','credit','liability','payables',ARRAY['2100','200','400','201','2205'],100),
    ('payment_cash','treasury','payment','debit','asset',NULL,ARRAY['1100','101','570','1101'],110),
    ('payment_bank','treasury','payment','debit','asset',NULL,ARRAY['1110','110','572','102','1102'],120),
    ('payroll_expense','payroll','payroll_paid','debit','expense',NULL,ARRAY['6200','620','640','6205'],130),
    ('payroll_liability','payroll','payroll_paid','credit','liability',NULL,ARRAY['2300','230','465','2370'],140),
    ('cash_short','shifts','shift_close','debit','expense',NULL,ARRAY['6900','690','678'],150),
    ('cash_over','shifts','shift_close','credit','income',NULL,ARRAY['4900','490','778'],160)
  ) AS t(mapping_key, module, operation, side, account_type, role_alias, fallback_codes, sort_order);
$$;

-- ============================================================
-- 2. Unicidad de la clave por empresa
-- ============================================================
DELETE FROM public.accounting_mappings a
USING public.accounting_mappings b
WHERE a.tenant_id = b.tenant_id
  AND a.mapping_key = b.mapping_key
  AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS accounting_mappings_tenant_key_uidx
  ON public.accounting_mappings (tenant_id, mapping_key);

-- ============================================================
-- 3. Resolución por patrón (fallback puro, sin maestro)
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_account_by_pattern(p_tenant uuid, p_role text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template text;
  v_id uuid;
  v_patterns text[];
  v_pat text;
BEGIN
  SELECT plan_template INTO v_template FROM public.accounting_accounts
    WHERE tenant_id = p_tenant AND plan_template IS NOT NULL
    ORDER BY created_at LIMIT 1;

  v_patterns := CASE p_role
    WHEN 'cash' THEN
      CASE v_template
        WHEN 'cu_onat' THEN ARRAY['101','10'] WHEN 'es_pgc' THEN ARRAY['570']
        WHEN 'mx_sat' THEN ARRAY['101'] WHEN 'niif_generic' THEN ARRAY['1101']
        ELSE ARRAY['1100','101','570'] END
    WHEN 'bank' THEN
      CASE v_template
        WHEN 'cu_onat' THEN ARRAY['110','11'] WHEN 'es_pgc' THEN ARRAY['572']
        WHEN 'mx_sat' THEN ARRAY['102'] WHEN 'niif_generic' THEN ARRAY['1102']
        ELSE ARRAY['1110','110','572'] END
    WHEN 'receivables' THEN
      CASE v_template
        WHEN 'cu_onat' THEN ARRAY['120'] WHEN 'es_pgc' THEN ARRAY['430']
        WHEN 'mx_sat' THEN ARRAY['105'] WHEN 'niif_generic' THEN ARRAY['1305']
        ELSE ARRAY['1200','120','430'] END
    WHEN 'payables' THEN
      CASE v_template
        WHEN 'cu_onat' THEN ARRAY['200'] WHEN 'es_pgc' THEN ARRAY['400']
        WHEN 'mx_sat' THEN ARRAY['201'] WHEN 'niif_generic' THEN ARRAY['2205']
        ELSE ARRAY['2100','200','400'] END
    WHEN 'sales' THEN
      CASE v_template
        WHEN 'cu_onat' THEN ARRAY['400','40'] WHEN 'es_pgc' THEN ARRAY['700']
        WHEN 'mx_sat' THEN ARRAY['401'] WHEN 'niif_generic' THEN ARRAY['4135']
        ELSE ARRAY['4100','400','700'] END
    WHEN 'tax_output' THEN
      CASE v_template
        WHEN 'cu_onat' THEN ARRAY['210'] WHEN 'es_pgc' THEN ARRAY['477']
        WHEN 'mx_sat' THEN ARRAY['208'] WHEN 'niif_generic' THEN ARRAY['2408']
        ELSE ARRAY['2200','210','477'] END
    WHEN 'tax_input' THEN
      CASE v_template
        WHEN 'cu_onat' THEN ARRAY['210'] WHEN 'es_pgc' THEN ARRAY['472']
        WHEN 'mx_sat' THEN ARRAY['118'] WHEN 'niif_generic' THEN ARRAY['2408']
        ELSE ARRAY['2200','472','118'] END
    WHEN 'inventory' THEN
      CASE v_template
        WHEN 'cu_onat' THEN ARRAY['130','13'] WHEN 'es_pgc' THEN ARRAY['300']
        WHEN 'mx_sat' THEN ARRAY['115'] WHEN 'niif_generic' THEN ARRAY['1435']
        ELSE ARRAY['1300','130','300'] END
    WHEN 'cogs' THEN
      CASE v_template
        WHEN 'cu_onat' THEN ARRAY['50'] WHEN 'es_pgc' THEN ARRAY['600']
        WHEN 'mx_sat' THEN ARRAY['501'] WHEN 'niif_generic' THEN ARRAY['6135']
        ELSE ARRAY['5100','50','600'] END
    ELSE ARRAY[]::text[]
  END;

  IF array_length(v_patterns, 1) IS NULL THEN
    SELECT unnest INTO v_pat FROM unnest(ARRAY[]::text[]) LIMIT 1;
    SELECT c.fallback_codes INTO v_patterns
      FROM public.accounting_mapping_catalog() c
      WHERE c.mapping_key = p_role OR c.role_alias = p_role
      LIMIT 1;
  END IF;

  IF array_length(v_patterns, 1) IS NULL THEN RETURN NULL; END IF;

  FOREACH v_pat IN ARRAY v_patterns LOOP
    SELECT id INTO v_id FROM public.accounting_accounts
      WHERE tenant_id = p_tenant
        AND is_postable = true
        AND code LIKE v_pat || '%'
      ORDER BY length(code) DESC, code
      LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

-- ============================================================
-- 4. El maestro de cuentas gobierna todo posteo
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_account_by_role(p_tenant uuid, p_role text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT m.account_id INTO v_id
  FROM public.accounting_mappings m
  JOIN public.accounting_accounts a ON a.id = m.account_id
  WHERE m.tenant_id = p_tenant
    AND COALESCE(m.is_active, true)
    AND COALESCE(a.is_active, true)
    AND a.is_postable = true
    AND m.mapping_key IN (
      SELECT c.mapping_key FROM public.accounting_mapping_catalog() c
      WHERE c.mapping_key = p_role OR c.role_alias = p_role
    )
  ORDER BY (m.mapping_key = p_role) DESC
  LIMIT 1;

  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  RETURN public.resolve_account_by_pattern(p_tenant, p_role);
END;
$$;

-- ============================================================
-- 5. Sincronización del maestro de cuentas
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_accounting_mappings(p_tenant uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_acc uuid;
  v_count int := 0;
BEGIN
  FOR v_rec IN SELECT * FROM public.accounting_mapping_catalog() ORDER BY sort_order LOOP
    IF EXISTS (
      SELECT 1 FROM public.accounting_mappings
      WHERE tenant_id = p_tenant AND mapping_key = v_rec.mapping_key AND account_id IS NOT NULL
    ) THEN
      CONTINUE;
    END IF;

    v_acc := NULL;
    IF v_rec.role_alias IS NOT NULL THEN
      v_acc := public.resolve_account_by_pattern(p_tenant, v_rec.role_alias);
    END IF;
    IF v_acc IS NULL THEN
      v_acc := public.find_account_by_codes(p_tenant, v_rec.fallback_codes);
    END IF;
    IF v_acc IS NULL THEN
      SELECT id INTO v_acc FROM public.accounting_accounts
      WHERE tenant_id = p_tenant AND is_postable = true
        AND COALESCE(is_active, true)
        AND type = CASE WHEN v_rec.account_type = 'cost' THEN 'cost' ELSE v_rec.account_type END
      ORDER BY code LIMIT 1;
    END IF;

    IF v_acc IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.accounting_mappings (tenant_id, mapping_key, account_id, description, is_active)
    VALUES (p_tenant, v_rec.mapping_key, v_acc, v_rec.module || ' · ' || v_rec.operation, true)
    ON CONFLICT (tenant_id, mapping_key)
      DO UPDATE SET account_id = EXCLUDED.account_id, updated_at = now();
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ============================================================
-- 6. Estado del maestro de cuentas (para la UI y la IA)
-- ============================================================
CREATE OR REPLACE FUNCTION public.accounting_mapping_status(p_tenant uuid)
RETURNS TABLE (
  mapping_key text, module text, operation text, side text,
  expected_type text, account_id uuid, account_code text, account_name text,
  account_type text, source text, type_ok boolean, lines_count bigint,
  last_used timestamptz, detail text, remediation text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cat AS (SELECT * FROM public.accounting_mapping_catalog()),
  res AS (
    SELECT
      c.*,
      m.account_id AS mapped_id,
      COALESCE(m.account_id, public.resolve_account_by_pattern(p_tenant, COALESCE(c.role_alias, c.mapping_key)),
               public.find_account_by_codes(p_tenant, c.fallback_codes)) AS eff_id
    FROM cat c
    LEFT JOIN public.accounting_mappings m
      ON m.tenant_id = p_tenant AND m.mapping_key = c.mapping_key AND COALESCE(m.is_active, true)
  )
  SELECT
    r.mapping_key, r.module, r.operation, r.side, r.account_type AS expected_type,
    r.eff_id, a.code, a.name, a.type,
    CASE WHEN r.mapped_id IS NOT NULL THEN 'explicit'
         WHEN r.eff_id IS NOT NULL THEN 'fallback'
         ELSE 'unresolved' END AS source,
    CASE WHEN a.type IS NULL THEN false ELSE a.type = r.account_type END AS type_ok,
    COALESCE(l.cnt, 0) AS lines_count,
    l.last_used,
    CASE
      WHEN r.eff_id IS NULL THEN 'No existe cuenta asignada ni deducible para esta operación: los asientos de ' || r.module || ' pueden quedar incompletos.'
      WHEN r.mapped_id IS NULL THEN 'Cuenta deducida automáticamente por código (' || COALESCE(a.code,'?') || '). No está confirmada por el contador.'
      WHEN a.type <> r.account_type THEN 'La cuenta ' || a.code || ' es de tipo ' || a.type || ' y esta operación exige ' || r.account_type || '.'
      ELSE 'Configurada correctamente en ' || a.code || ' - ' || a.name || '.'
    END AS detail,
    CASE
      WHEN r.eff_id IS NULL THEN 'Cree la cuenta correspondiente en el plan y asígnela a esta clave en el Maestro de Cuentas.'
      WHEN r.mapped_id IS NULL THEN 'Confirme la cuenta en el Maestro de Cuentas para fijar el destino contable.'
      WHEN a.type <> r.account_type THEN 'Cambie la asignación a una cuenta de tipo ' || r.account_type || '.'
      ELSE 'Sin acción requerida.'
    END AS remediation
  FROM res r
  LEFT JOIN public.accounting_accounts a ON a.id = r.eff_id
  LEFT JOIN (
    SELECT jel.account_id, COUNT(*) cnt, MAX(je.created_at) last_used
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.entry_id
    WHERE je.tenant_id = p_tenant
    GROUP BY jel.account_id
  ) l ON l.account_id = r.eff_id
  ORDER BY r.sort_order;
$$;

-- ============================================================
-- 7. Conciliación operación ↔ contabilidad
-- ============================================================
CREATE OR REPLACE FUNCTION public.accounting_operation_reconciliation(
  p_tenant uuid,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS TABLE (
  module text, reference_type text, documents bigint, documents_posted bigint,
  documents_unposted bigint, documents_amount numeric, posted_amount numeric,
  difference numeric, status text, severity text, detail text, explanation text,
  remediation text, sample jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date := COALESCE(p_from, date_trunc('month', CURRENT_DATE)::date - interval '12 months');
  v_to date := COALESCE(p_to, CURRENT_DATE);
BEGIN
  RETURN QUERY
  WITH posted AS (
    SELECT je.reference_type, je.reference_id,
           SUM(jel.debit) AS amount
    FROM public.journal_entries je
    JOIN public.journal_entry_lines jel ON jel.entry_id = je.id
    WHERE je.tenant_id = p_tenant
      AND je.status = 'posted'
      AND je.date BETWEEN v_from AND v_to
    GROUP BY je.reference_type, je.reference_id
  ),
  docs AS (
    SELECT 'sales'::text AS module, 'sale'::text AS ref, s.id, COALESCE(s.total_in_base, s.total, 0)::numeric AS amount,
           COALESCE(s.ticket_number, left(s.id::text, 8)) AS label
    FROM public.sales s
    WHERE s.tenant_id = p_tenant AND s.status IN ('completed','paid','partial','pending')
      AND s.created_at::date BETWEEN v_from AND v_to
    UNION ALL
    SELECT 'returns', 'sale_return', r.id, COALESCE(r.total, 0)::numeric, COALESCE(r.return_number, left(r.id::text, 8))
    FROM public.sale_returns r
    WHERE r.tenant_id = p_tenant AND r.status <> 'cancelled'
      AND r.created_at::date BETWEEN v_from AND v_to
    UNION ALL
    SELECT 'purchases', 'purchase', p.id,
           COALESCE(p.total_in_base, COALESCE(p.subtotal,0) + COALESCE(p.tax,0))::numeric,
           COALESCE(p.purchase_number, left(p.id::text, 8))
    FROM public.purchases p
    WHERE p.tenant_id = p_tenant AND p.status IN ('received','partial','paid')
      AND COALESCE(p.received_at, p.created_at)::date BETWEEN v_from AND v_to
    UNION ALL
    SELECT 'treasury', 'payment', ap.id, COALESCE(ap.amount_in_base, ap.amount, 0)::numeric, left(ap.id::text, 8)
    FROM public.account_payments ap
    WHERE ap.tenant_id = p_tenant AND ap.created_at::date BETWEEN v_from AND v_to
    UNION ALL
    SELECT 'payroll', 'payroll', pr.id, COALESCE(pr.net_pay, 0)::numeric, COALESCE(pr.receipt_number, left(pr.id::text, 8))
    FROM public.payroll_runs pr
    WHERE pr.tenant_id = p_tenant AND pr.status = 'paid'
      AND COALESCE(pr.paid_at, pr.created_at)::date BETWEEN v_from AND v_to
    UNION ALL
    SELECT 'shifts', 'cash_movement', cm.id, COALESCE(cm.amount_in_base, cm.amount, 0)::numeric, COALESCE(cm.category, cm.movement_type)
    FROM public.shift_cash_movements cm
    WHERE cm.tenant_id = p_tenant AND cm.created_at::date BETWEEN v_from AND v_to
  ),
  joined AS (
    SELECT d.module, d.ref, d.id, d.amount, d.label,
           po.amount AS posted_amount
    FROM docs d
    LEFT JOIN posted po ON po.reference_type = d.ref AND po.reference_id = d.id
  ),
  agg AS (
    SELECT j.module, j.ref,
           COUNT(*)::bigint AS documents,
           COUNT(j.posted_amount)::bigint AS documents_posted,
           (COUNT(*) - COUNT(j.posted_amount))::bigint AS documents_unposted,
           ROUND(SUM(j.amount)::numeric, 2) AS documents_amount,
           ROUND(COALESCE(SUM(j.posted_amount), 0)::numeric, 2) AS posted_amount,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object('id', x.id, 'label', x.label, 'amount', ROUND(x.amount, 2)))
             FROM (SELECT * FROM joined k WHERE k.module = j.module AND k.posted_amount IS NULL ORDER BY k.amount DESC LIMIT 5) x
           ), '[]'::jsonb) AS sample
    FROM joined j
    GROUP BY j.module, j.ref
  )
  SELECT
    a.module, a.ref, a.documents, a.documents_posted, a.documents_unposted,
    a.documents_amount, a.posted_amount,
    ROUND(a.documents_amount - a.posted_amount, 2) AS difference,
    CASE WHEN a.documents_unposted = 0 THEN 'pass'
         WHEN a.documents_unposted::numeric / GREATEST(a.documents, 1) > 0.1 THEN 'fail'
         ELSE 'warn' END AS status,
    CASE WHEN a.documents_unposted = 0 THEN 'info'
         WHEN a.documents_unposted::numeric / GREATEST(a.documents, 1) > 0.1 THEN 'critical'
         ELSE 'medium' END AS severity,
    a.documents_unposted || ' de ' || a.documents || ' documentos sin asiento contable' AS detail,
    CASE a.module
      WHEN 'sales' THEN 'Cada venta debe generar un asiento: Debe Caja/Banco/CxC y Haber Ingresos + Impuesto, más Costo de Ventas contra Inventario.'
      WHEN 'returns' THEN 'Cada devolución debe revertir el ingreso y reponer el inventario en el asiento espejo.'
      WHEN 'purchases' THEN 'Cada compra recibida debe cargar Inventario e Impuesto acreditable y abonar Cuentas por Pagar.'
      WHEN 'treasury' THEN 'Cada cobro o pago debe mover Caja/Banco contra CxC o CxP.'
      WHEN 'payroll' THEN 'Cada nómina pagada debe registrar el gasto salarial, las retenciones y la salida de efectivo.'
      WHEN 'shifts' THEN 'Cada movimiento de caja del turno debe tener contrapartida contable según su categoría.'
      ELSE 'Operación con impacto contable.'
    END AS explanation,
    CASE WHEN a.documents_unposted = 0
      THEN 'Sin acción requerida.'
      ELSE 'Revise los documentos listados y ejecute el reposteo del módulo ' || a.module || '. Verifique además que el maestro de cuentas tenga asignadas las claves de ' || a.module || '.'
    END AS remediation,
    a.sample
  FROM agg a
  ORDER BY (CASE WHEN a.documents_unposted > 0 THEN 0 ELSE 1 END), a.module;
END;
$$;

-- ============================================================
-- 8. Composición de los KPIs financieros
-- ============================================================
CREATE OR REPLACE FUNCTION public.financial_kpi_breakdown(
  p_tenant uuid,
  p_period_id uuid DEFAULT NULL
)
RETURNS TABLE (
  bucket text, account_code text, account_name text, account_type text,
  debit_total numeric, credit_total numeric, closing_balance numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH per AS (
    SELECT COALESCE(
      p_period_id,
      (SELECT id FROM public.accounting_periods
        WHERE tenant_id = p_tenant AND CURRENT_DATE BETWEEN start_date AND end_date
        ORDER BY start_date DESC LIMIT 1),
      (SELECT id FROM public.accounting_periods WHERE tenant_id = p_tenant ORDER BY start_date DESC LIMIT 1)
    ) AS id
  )
  SELECT
    CASE
      WHEN a.type = 'income' THEN 'revenue'
      WHEN a.type IN ('expense','cost') THEN 'expense'
      WHEN a.control_role = 'cash' THEN 'cash'
      WHEN a.control_role = 'bank' THEN 'cash'
      WHEN a.control_role = 'accounts_receivable' THEN 'receivable'
      WHEN a.control_role = 'accounts_payable' THEN 'payable'
      WHEN a.type = 'asset' THEN 'asset'
      WHEN a.type = 'liability' THEN 'liability'
      ELSE 'equity'
    END AS bucket,
    a.code, a.name, a.type,
    ROUND(COALESCE(gl.debit_total, 0), 2),
    ROUND(COALESCE(gl.credit_total, 0), 2),
    ROUND(COALESCE(gl.closing_balance, 0), 2)
  FROM public.general_ledger gl
  JOIN public.accounting_accounts a ON a.id = gl.account_id
  WHERE gl.tenant_id = p_tenant
    AND gl.period_id = (SELECT id FROM per)
    AND (COALESCE(gl.debit_total,0) <> 0 OR COALESCE(gl.credit_total,0) <> 0 OR COALESCE(gl.closing_balance,0) <> 0)
  ORDER BY 1, a.code;
$$;

-- ============================================================
-- 9. Backfill del maestro de cuentas para todas las empresas
-- ============================================================
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    PERFORM public.sync_accounting_mappings(t.id);
  END LOOP;
END $$;