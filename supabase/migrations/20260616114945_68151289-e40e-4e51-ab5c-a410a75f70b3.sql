
-- ============================================================
-- BLOQUE G: Event Bus financiero + Posting Rules
-- ============================================================

-- 1) financial_events: bus único de hechos económicos
CREATE TABLE IF NOT EXISTS public.financial_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_type text NOT NULL,
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  event_date date NOT NULL DEFAULT CURRENT_DATE,
  currency text NOT NULL DEFAULT 'CUP',
  exchange_rate numeric NOT NULL DEFAULT 1,
  amount numeric NOT NULL DEFAULT 0,
  amount_in_base numeric NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending', -- pending | posted | failed | skipped
  error text,
  posted_journal_id uuid,
  posted_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_events_unique_source UNIQUE (source_table, source_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_financial_events_tenant_status ON public.financial_events(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_financial_events_type_date ON public.financial_events(tenant_id, event_type, event_date);

GRANT SELECT, INSERT, UPDATE ON public.financial_events TO authenticated;
GRANT ALL ON public.financial_events TO service_role;
ALTER TABLE public.financial_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant access financial_events" ON public.financial_events
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()));

-- 2) posting_rules: catálogo configurable
CREATE TABLE IF NOT EXISTS public.posting_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_code text,           -- NULL = regla por defecto global
  event_type text NOT NULL,
  sequence int NOT NULL DEFAULT 1,
  description text NOT NULL,
  debit_account_code text NOT NULL,
  credit_account_code text NOT NULL,
  amount_field text NOT NULL DEFAULT 'amount', -- campo del payload (o 'amount')
  condition_expr text,         -- jsonb path opcional para activar la regla
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posting_rules_lookup ON public.posting_rules(event_type, profile_code, active);

GRANT SELECT ON public.posting_rules TO authenticated;
GRANT ALL ON public.posting_rules TO service_role;
ALTER TABLE public.posting_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read posting_rules" ON public.posting_rules
  FOR SELECT TO authenticated USING (true);

-- 3) Función para resolver cuenta por código dentro del tenant
CREATE OR REPLACE FUNCTION public.resolve_account_id(p_tenant_id uuid, p_code text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.accounting_accounts
  WHERE tenant_id = p_tenant_id AND code = p_code
  LIMIT 1;
$$;

-- 4) Función central: post_financial_event
CREATE OR REPLACE FUNCTION public.post_financial_event(p_event_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.financial_events%ROWTYPE;
  v_profile text;
  v_rule public.posting_rules%ROWTYPE;
  v_journal_id uuid;
  v_debit_acc uuid;
  v_credit_acc uuid;
  v_amount numeric;
  v_amount_base numeric;
  v_rules_found int := 0;
BEGIN
  SELECT * INTO v_event FROM public.financial_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event % not found', p_event_id; END IF;
  IF v_event.status = 'posted' THEN RETURN v_event.posted_journal_id; END IF;

  -- Resolver perfil contable del tenant (columna se añade en Bloque H; fallback NULL)
  BEGIN
    EXECUTE 'SELECT accounting_profile_code FROM public.tenants WHERE id = $1'
      INTO v_profile USING v_event.tenant_id;
  EXCEPTION WHEN undefined_column THEN
    v_profile := NULL;
  END;

  -- Crear cabecera del asiento
  INSERT INTO public.journal_entries (
    tenant_id, entry_date, description, reference, status, created_by
  ) VALUES (
    v_event.tenant_id,
    v_event.event_date,
    'Auto: ' || v_event.event_type || ' #' || v_event.source_id::text,
    v_event.source_table || ':' || v_event.source_id::text,
    'posted',
    v_event.created_by
  ) RETURNING id INTO v_journal_id;

  -- Aplicar reglas (perfil específico primero, luego global)
  FOR v_rule IN
    SELECT * FROM public.posting_rules
    WHERE event_type = v_event.event_type
      AND active = true
      AND (profile_code = v_profile OR profile_code IS NULL)
    ORDER BY (profile_code IS NULL), sequence
  LOOP
    v_rules_found := v_rules_found + 1;
    -- Resolver monto: campo del payload o el monto raíz
    IF v_rule.amount_field = 'amount' THEN
      v_amount := v_event.amount;
      v_amount_base := v_event.amount_in_base;
    ELSE
      v_amount := COALESCE((v_event.payload ->> v_rule.amount_field)::numeric, 0);
      v_amount_base := v_amount * v_event.exchange_rate;
    END IF;
    IF v_amount = 0 THEN CONTINUE; END IF;

    v_debit_acc := public.resolve_account_id(v_event.tenant_id, v_rule.debit_account_code);
    v_credit_acc := public.resolve_account_id(v_event.tenant_id, v_rule.credit_account_code);

    IF v_debit_acc IS NULL OR v_credit_acc IS NULL THEN
      -- Skip si las cuentas no existen aún
      CONTINUE;
    END IF;

    INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
      VALUES (v_journal_id, v_debit_acc, v_amount_base, 0, v_rule.description);
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
      VALUES (v_journal_id, v_credit_acc, 0, v_amount_base, v_rule.description);
  END LOOP;

  -- Si no hay reglas, marcar skipped y borrar cabecera
  IF v_rules_found = 0 THEN
    DELETE FROM public.journal_entries WHERE id = v_journal_id;
    UPDATE public.financial_events
      SET status = 'skipped', error = 'no posting rule', posted_at = now()
      WHERE id = p_event_id;
    RETURN NULL;
  END IF;

  UPDATE public.financial_events
    SET status = 'posted', posted_journal_id = v_journal_id, posted_at = now(), error = NULL
    WHERE id = p_event_id;

  RETURN v_journal_id;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.financial_events
    SET status = 'failed', error = SQLERRM
    WHERE id = p_event_id;
  RAISE;
END;
$$;

-- 5) Trigger dispatcher: cada evento nuevo se contabiliza automáticamente
CREATE OR REPLACE FUNCTION public.trg_dispatch_financial_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.post_financial_event(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    -- ya queda registrado en status=failed
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dispatch_financial_event ON public.financial_events;
CREATE TRIGGER dispatch_financial_event
AFTER INSERT ON public.financial_events
FOR EACH ROW
EXECUTE FUNCTION public.trg_dispatch_financial_event();

-- 6) Auditoría
DROP TRIGGER IF EXISTS audit_financial_events ON public.financial_events;
CREATE TRIGGER audit_financial_events
AFTER INSERT OR UPDATE OR DELETE ON public.financial_events
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

DROP TRIGGER IF EXISTS audit_posting_rules ON public.posting_rules;
CREATE TRIGGER audit_posting_rules
AFTER INSERT OR UPDATE OR DELETE ON public.posting_rules
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- 7) Seed: reglas genéricas iniciales (profile_code NULL = aplica a cualquier tenant
--    cuyo plan de cuentas use estos códigos. Bloque H añadirá perfiles específicos.)
INSERT INTO public.posting_rules (profile_code, event_type, sequence, description, debit_account_code, credit_account_code, amount_field) VALUES
  (NULL, 'sale_revenue',      1, 'Venta - reconocimiento ingreso',      '1105', '4101', 'amount'),
  (NULL, 'sale_cogs',         1, 'Venta - costo de mercancía vendida',  '5101', '1201', 'amount'),
  (NULL, 'sale_tax',          1, 'Venta - impuesto trasladado',         '1105', '2103', 'amount'),
  (NULL, 'payment_received',  1, 'Cobro de cliente',                    '1101', '1105', 'amount'),
  (NULL, 'purchase_received', 1, 'Compra de mercancía',                 '1201', '2101', 'amount'),
  (NULL, 'purchase_tax',      1, 'Compra - impuesto acreditable',       '1108', '2101', 'amount'),
  (NULL, 'payment_made',      1, 'Pago a proveedor',                    '2101', '1101', 'amount'),
  (NULL, 'payroll_expense',   1, 'Gasto de nómina',                     '5201', '2104', 'amount'),
  (NULL, 'payroll_payment',   1, 'Pago de nómina',                      '2104', '1101', 'amount'),
  (NULL, 'delivery_fee',      1, 'Comisión a repartidor',               '5202', '2101', 'amount'),
  (NULL, 'sale_return',       1, 'Devolución de venta - reverso ingreso','4102','1105', 'amount'),
  (NULL, 'loyalty_accrual',   1, 'Provisión puntos de fidelización',    '5203', '2105', 'amount'),
  (NULL, 'inventory_adjust',  1, 'Ajuste de inventario',                '5104', '1201', 'amount')
ON CONFLICT DO NOTHING;
