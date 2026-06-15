
-- ============================================================
-- BLOCK E: Real multicurrency + party_balance_by_currency + audit_trigger
-- ============================================================

-- 1. FX columns on transactional tables
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'CUP',
  ADD COLUMN IF NOT EXISTS exchange_rate numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_in_base numeric;

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'CUP',
  ADD COLUMN IF NOT EXISTS exchange_rate numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_in_base numeric;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS exchange_rate numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_in_base numeric;

ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'CUP',
  ADD COLUMN IF NOT EXISTS exchange_rate numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS amount_in_base numeric,
  ADD COLUMN IF NOT EXISTS amount_paid_in_base numeric NOT NULL DEFAULT 0;

-- 2. Helper to resolve exchange rate for tenant + currency + date
CREATE OR REPLACE FUNCTION public.get_exchange_rate(
  p_tenant uuid,
  p_currency text,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate numeric;
  v_base text;
BEGIN
  IF p_currency IS NULL THEN RETURN 1; END IF;

  SELECT code INTO v_base
  FROM public.currencies
  WHERE tenant_id = p_tenant AND is_base = true
  LIMIT 1;

  IF v_base IS NOT NULL AND v_base = p_currency THEN
    RETURN 1;
  END IF;

  SELECT rate INTO v_rate
  FROM public.exchange_rates_history
  WHERE tenant_id = p_tenant
    AND currency_code = p_currency
    AND effective_from <= p_date
  ORDER BY effective_from DESC
  LIMIT 1;

  IF v_rate IS NOT NULL THEN RETURN v_rate; END IF;

  SELECT exchange_rate INTO v_rate
  FROM public.currencies
  WHERE tenant_id = p_tenant AND code = p_currency
  LIMIT 1;

  RETURN COALESCE(v_rate, 1);
END;
$$;

-- 3. Auto-fill FX on insert / update for sales, purchases, invoices, accounts_payable
CREATE OR REPLACE FUNCTION public.fill_fx_sales()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.currency IS NULL THEN NEW.currency := 'CUP'; END IF;
  IF NEW.exchange_rate IS NULL OR NEW.exchange_rate = 0 THEN
    NEW.exchange_rate := public.get_exchange_rate(NEW.tenant_id, NEW.currency, COALESCE(NEW.created_at::date, CURRENT_DATE));
  END IF;
  NEW.total_in_base := ROUND(COALESCE(NEW.total,0) * NEW.exchange_rate, 4);
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.fill_fx_purchases()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.currency IS NULL THEN NEW.currency := 'CUP'; END IF;
  IF NEW.exchange_rate IS NULL OR NEW.exchange_rate = 0 THEN
    NEW.exchange_rate := public.get_exchange_rate(NEW.tenant_id, NEW.currency, COALESCE(NEW.created_at::date, CURRENT_DATE));
  END IF;
  NEW.total_in_base := ROUND(COALESCE(NEW.total,0) * NEW.exchange_rate, 4);
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.fill_fx_invoices()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.currency IS NULL THEN NEW.currency := 'CUP'; END IF;
  IF NEW.exchange_rate IS NULL OR NEW.exchange_rate = 0 THEN
    NEW.exchange_rate := public.get_exchange_rate(NEW.tenant_id, NEW.currency, COALESCE(NEW.issue_date, CURRENT_DATE));
  END IF;
  NEW.total_in_base := ROUND(COALESCE(NEW.total,0) * NEW.exchange_rate, 4);
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.fill_fx_payable()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.currency IS NULL THEN NEW.currency := 'CUP'; END IF;
  IF NEW.exchange_rate IS NULL OR NEW.exchange_rate = 0 THEN
    NEW.exchange_rate := public.get_exchange_rate(NEW.tenant_id, NEW.currency, CURRENT_DATE);
  END IF;
  NEW.amount_in_base := ROUND(COALESCE(NEW.amount,0) * NEW.exchange_rate, 4);
  NEW.amount_paid_in_base := ROUND(COALESCE(NEW.amount_paid,0) * NEW.exchange_rate, 4);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_fill_fx_sales ON public.sales;
CREATE TRIGGER trg_fill_fx_sales BEFORE INSERT OR UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.fill_fx_sales();

DROP TRIGGER IF EXISTS trg_fill_fx_purchases ON public.purchases;
CREATE TRIGGER trg_fill_fx_purchases BEFORE INSERT OR UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.fill_fx_purchases();

DROP TRIGGER IF EXISTS trg_fill_fx_invoices ON public.invoices;
CREATE TRIGGER trg_fill_fx_invoices BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.fill_fx_invoices();

DROP TRIGGER IF EXISTS trg_fill_fx_payable ON public.accounts_payable;
CREATE TRIGGER trg_fill_fx_payable BEFORE INSERT OR UPDATE ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION public.fill_fx_payable();

-- Backfill existing rows
UPDATE public.sales SET total_in_base = COALESCE(total,0) * COALESCE(exchange_rate,1) WHERE total_in_base IS NULL;
UPDATE public.purchases SET total_in_base = COALESCE(total,0) * COALESCE(exchange_rate,1) WHERE total_in_base IS NULL;
UPDATE public.invoices SET total_in_base = COALESCE(total,0) * COALESCE(exchange_rate,1) WHERE total_in_base IS NULL;
UPDATE public.accounts_payable SET amount_in_base = COALESCE(amount,0) * COALESCE(exchange_rate,1) WHERE amount_in_base IS NULL;

-- 4. party_balance_by_currency view: open balances per party + currency
CREATE OR REPLACE VIEW public.party_balance_by_currency
WITH (security_invoker = true)
AS
SELECT
  tenant_id,
  party_type,
  party_id,
  currency,
  SUM(COALESCE(amount,0) - COALESCE(amount_paid,0))            AS open_balance,
  SUM(COALESCE(amount_in_base,0) - COALESCE(amount_paid_in_base,0)) AS open_balance_in_base,
  COUNT(*) FILTER (WHERE status <> 'paid')                     AS open_documents,
  MIN(due_date) FILTER (WHERE status <> 'paid')                AS earliest_due
FROM public.accounts_payable
GROUP BY tenant_id, party_type, party_id, currency;

GRANT SELECT ON public.party_balance_by_currency TO authenticated, service_role;

-- 5. Generic audit_trigger() writing to activity_log
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_entity_id uuid;
  v_action text;
  v_old jsonb;
  v_new jsonb;
  v_diff jsonb := '{}'::jsonb;
  v_key text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_new := to_jsonb(NEW);
    v_tenant := (v_new->>'tenant_id')::uuid;
    v_entity_id := (v_new->>'id')::uuid;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_tenant := (v_new->>'tenant_id')::uuid;
    v_entity_id := (v_new->>'id')::uuid;
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      IF v_new->v_key IS DISTINCT FROM v_old->v_key
         AND v_key NOT IN ('updated_at','created_at') THEN
        v_diff := v_diff || jsonb_build_object(v_key,
          jsonb_build_object('old', v_old->v_key, 'new', v_new->v_key));
      END IF;
    END LOOP;
    IF v_diff = '{}'::jsonb THEN RETURN NEW; END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_old := to_jsonb(OLD);
    v_tenant := (v_old->>'tenant_id')::uuid;
    v_entity_id := (v_old->>'id')::uuid;
  END IF;

  IF v_entity_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.activity_log (entity_type, entity_id, action, description, metadata, performed_by, tenant_id)
  VALUES (
    TG_TABLE_NAME,
    v_entity_id,
    v_action,
    TG_TABLE_NAME || ' ' || v_action,
    CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('diff', v_diff)
         WHEN TG_OP = 'INSERT' THEN jsonb_build_object('new', v_new)
         ELSE jsonb_build_object('old', v_old) END,
    auth.uid(),
    v_tenant
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach audit_trigger to critical tables
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'sales','purchases','invoices','account_payments','accounts_payable',
    'journal_entries','products','customers','suppliers','inventory_movements',
    'stock_transfers','sales_shifts'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()', t, t);
  END LOOP;
END $$;
