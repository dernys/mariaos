-- ============================================================
-- QW1 — Idempotencia financiera (Sprint 0-30, MarIA OS)
-- Estrategia: NO se modifica ninguna función existente. Se añaden
-- sobrecargas (overloads) con parámetros extra, de forma que las
-- llamadas actuales siguen resolviendo a la firma original.
-- Rollback:
--   DROP FUNCTION public.create_quick_sale(uuid,uuid,uuid,jsonb,jsonb,text,numeric,text,text);
--   DROP FUNCTION public.register_account_payment(text,uuid,numeric,text,text,numeric,text,uuid,text,text,text);
--   DROP FUNCTION public.receive_purchase(uuid,text,text);
--   DROP FUNCTION public.claim_operation(uuid,text,text,text,uuid);
--   DROP TABLE public.operation_idempotency;
-- ============================================================

CREATE TABLE public.operation_idempotency (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid,
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  correlation_id text,
  result_id uuid,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX operation_idempotency_unique
  ON public.operation_idempotency (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), operation, idempotency_key);

CREATE INDEX operation_idempotency_correlation_idx
  ON public.operation_idempotency (correlation_id);

GRANT SELECT, INSERT ON public.operation_idempotency TO authenticated;
GRANT ALL ON public.operation_idempotency TO service_role;

ALTER TABLE public.operation_idempotency ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read own idempotency records"
  ON public.operation_idempotency FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));

CREATE POLICY "Tenant members insert own idempotency records"
  ON public.operation_idempotency FOR INSERT TO authenticated
  WITH CHECK (tenant_id IS NULL OR public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));

-- ------------------------------------------------------------
-- claim_operation: intenta reservar la clave.
--   found = false  -> el llamador debe ejecutar la operación
--   found = true   -> ya se ejecutó; result_id es el resultado original
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_operation(
  p_tenant_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_correlation_id text DEFAULT NULL,
  p_result_id uuid DEFAULT NULL
) RETURNS TABLE (found boolean, result_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_id uuid;
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RETURN QUERY SELECT false, NULL::uuid;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.operation_idempotency (tenant_id, operation, idempotency_key, correlation_id, result_id, user_id)
    VALUES (p_tenant_id, p_operation, p_idempotency_key, p_correlation_id, p_result_id, auth.uid())
    RETURNING id INTO v_id;
    RETURN QUERY SELECT false, NULL::uuid;
    RETURN;
  EXCEPTION WHEN unique_violation THEN
    SELECT oi.result_id INTO v_existing
    FROM public.operation_idempotency oi
    WHERE oi.operation = p_operation
      AND oi.idempotency_key = p_idempotency_key
      AND coalesce(oi.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(p_tenant_id, '00000000-0000-0000-0000-000000000000'::uuid);
    RETURN QUERY SELECT true, v_existing;
    RETURN;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_operation(uuid, text, text, text, uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Venta rápida idempotente
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_quick_sale(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_employee_id uuid,
  p_items jsonb,
  p_payments jsonb,
  p_notes text,
  p_tax_rate numeric,
  p_idempotency_key text,
  p_correlation_id text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_found boolean;
  v_prev uuid;
  v_sale uuid;
BEGIN
  SELECT c.found, c.result_id INTO v_found, v_prev
  FROM public.claim_operation(p_tenant_id, 'create_quick_sale', p_idempotency_key, p_correlation_id) c;

  IF v_found THEN
    RETURN v_prev;
  END IF;

  v_sale := public.create_quick_sale(p_tenant_id, p_customer_id, p_employee_id, p_items, p_payments, p_notes, p_tax_rate);

  UPDATE public.operation_idempotency
  SET result_id = v_sale
  WHERE operation = 'create_quick_sale'
    AND idempotency_key = p_idempotency_key
    AND coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(p_tenant_id, '00000000-0000-0000-0000-000000000000'::uuid);

  RETURN v_sale;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_quick_sale(uuid, uuid, uuid, jsonb, jsonb, text, numeric, text, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Cobro/pago de cuenta idempotente
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_account_payment(
  p_party_type text,
  p_party_id uuid,
  p_amount numeric,
  p_method text,
  p_currency text,
  p_exchange_rate numeric,
  p_reference_type text,
  p_reference_id uuid,
  p_notes text,
  p_idempotency_key text,
  p_correlation_id text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_found boolean;
  v_prev uuid;
  v_payment uuid;
  v_tenant uuid;
BEGIN
  IF p_party_type = 'customer' THEN
    SELECT tenant_id INTO v_tenant FROM public.customers WHERE id = p_party_id;
  ELSIF p_party_type = 'supplier' THEN
    SELECT tenant_id INTO v_tenant FROM public.suppliers WHERE id = p_party_id;
  END IF;

  SELECT c.found, c.result_id INTO v_found, v_prev
  FROM public.claim_operation(v_tenant, 'register_account_payment', p_idempotency_key, p_correlation_id) c;

  IF v_found THEN
    RETURN v_prev;
  END IF;

  v_payment := public.register_account_payment(p_party_type, p_party_id, p_amount, p_method, p_currency, p_exchange_rate, p_reference_type, p_reference_id, p_notes);

  UPDATE public.operation_idempotency
  SET result_id = v_payment
  WHERE operation = 'register_account_payment'
    AND idempotency_key = p_idempotency_key
    AND coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(v_tenant, '00000000-0000-0000-0000-000000000000'::uuid);

  RETURN v_payment;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_account_payment(text, uuid, numeric, text, text, numeric, text, uuid, text, text, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Recepción de compra idempotente
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receive_purchase(
  p_purchase_id uuid,
  p_idempotency_key text,
  p_correlation_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_found boolean;
  v_prev uuid;
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.purchases WHERE id = p_purchase_id;

  SELECT c.found, c.result_id INTO v_found, v_prev
  FROM public.claim_operation(v_tenant, 'receive_purchase', p_idempotency_key, p_correlation_id, p_purchase_id) c;

  IF v_found THEN
    RETURN;
  END IF;

  PERFORM public.receive_purchase(p_purchase_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.receive_purchase(uuid, text, text) TO authenticated, service_role;