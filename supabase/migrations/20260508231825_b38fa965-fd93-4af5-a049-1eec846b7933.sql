
-- ==========================================
-- 1. E-invoice tenant settings
-- ==========================================
CREATE TABLE IF NOT EXISTS public.einvoice_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE,
  mode text NOT NULL DEFAULT 'local', -- 'local' | 'electronic'
  provider text, -- 'generic_ubl' | 'webhook' | 'sat_mx' | 'dian_co' ...
  tax_regime text,
  legal_name text,
  legal_tax_id text,
  webhook_url text,
  webhook_secret text,
  certificate_url text,
  signature_key text,
  auto_transmit boolean NOT NULL DEFAULT false,
  test_mode boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.einvoice_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant manage einvoice_settings" ON public.einvoice_settings
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
    OR is_superadmin(auth.uid())
  ) WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
    OR is_superadmin(auth.uid())
  );

CREATE TRIGGER trg_einvoice_settings_updated BEFORE UPDATE ON public.einvoice_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==========================================
-- 2. E-invoice columns on invoices
-- ==========================================
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS cufe text,
  ADD COLUMN IF NOT EXISTS transmission_status text NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS transmitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS xml_content text,
  ADD COLUMN IF NOT EXISTS xml_url text,
  ADD COLUMN IF NOT EXISTS provider_response jsonb,
  ADD COLUMN IF NOT EXISTS provider text;

-- transmission_status values: local | pending | transmitted | failed

-- ==========================================
-- 3. RPC: create_quick_sale
-- ==========================================
CREATE OR REPLACE FUNCTION public.create_quick_sale(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_employee_id uuid,
  p_items jsonb,        -- [{product_id, product_name, sku, qty, price}]
  p_payments jsonb DEFAULT '[]'::jsonb,  -- [{method, currency, amount, exchange_rate}]
  p_notes text DEFAULT NULL,
  p_tax_rate numeric DEFAULT 0
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_paid numeric := 0;
  v_status text := 'pending';
  v_item jsonb;
  v_pay jsonb;
  v_party_type text;
  v_party_id uuid;
BEGIN
  -- Permission check
  IF NOT (is_superadmin(auth.uid()) OR EXISTS (
    SELECT 1 FROM tenant_users WHERE user_id = auth.uid() AND tenant_id = p_tenant_id
  )) THEN
    RAISE EXCEPTION 'No autorizado en este tenant';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La venta debe contener al menos un producto';
  END IF;

  -- Calculate totals
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_subtotal := v_subtotal + (COALESCE((v_item->>'qty')::numeric, 1) * COALESCE((v_item->>'price')::numeric, 0));
  END LOOP;
  v_tax := round(v_subtotal * (COALESCE(p_tax_rate, 0) / 100.0), 2);
  v_total := v_subtotal + v_tax;

  FOR v_pay IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    v_paid := v_paid + COALESCE((v_pay->>'amount')::numeric, 0) * COALESCE((v_pay->>'exchange_rate')::numeric, 1);
  END LOOP;

  IF v_paid >= v_total THEN v_status := 'paid';
  ELSIF v_paid > 0 THEN v_status := 'partial';
  ELSE v_status := 'pending';
  END IF;

  -- Insert sale
  INSERT INTO sales (tenant_id, customer_id, employee_id, subtotal, tax, total, amount_paid, status, notes)
  VALUES (p_tenant_id, p_customer_id, p_employee_id, v_subtotal, v_tax, v_total, v_paid, v_status, p_notes)
  RETURNING id INTO v_sale_id;

  -- Insert items
  INSERT INTO sale_items (sale_id, product_name, sku, price, qty, total)
  SELECT
    v_sale_id,
    (it->>'product_name')::text,
    (it->>'sku')::text,
    COALESCE((it->>'price')::numeric, 0),
    COALESCE((it->>'qty')::integer, 1),
    COALESCE((it->>'qty')::numeric, 1) * COALESCE((it->>'price')::numeric, 0)
  FROM jsonb_array_elements(p_items) it;

  -- Insert payments (account_payments) if customer/employee available
  IF v_paid > 0 THEN
    IF p_customer_id IS NOT NULL THEN v_party_type := 'customer'; v_party_id := p_customer_id;
    ELSIF p_employee_id IS NOT NULL THEN v_party_type := 'employee'; v_party_id := p_employee_id;
    ELSE v_party_type := 'customer'; v_party_id := NULL;
    END IF;

    IF v_party_id IS NOT NULL THEN
      FOR v_pay IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
        INSERT INTO account_payments (
          tenant_id, party_type, party_id, reference_type, reference_id,
          direction, method, currency, amount, amount_in_base, exchange_rate, performed_by
        ) VALUES (
          p_tenant_id, v_party_type, v_party_id, 'sale', v_sale_id,
          'in',
          COALESCE(v_pay->>'method', 'cash'),
          COALESCE(v_pay->>'currency', 'CUP'),
          COALESCE((v_pay->>'amount')::numeric, 0),
          COALESCE((v_pay->>'amount')::numeric, 0) * COALESCE((v_pay->>'exchange_rate')::numeric, 1),
          COALESCE((v_pay->>'exchange_rate')::numeric, 1),
          auth.uid()
        );
      END LOOP;
    END IF;
  END IF;

  RETURN v_sale_id;
END;
$$;

-- ==========================================
-- 4. RPC: mark_invoice_transmitted
-- ==========================================
CREATE OR REPLACE FUNCTION public.mark_invoice_transmitted(
  p_invoice_id uuid,
  p_status text,         -- transmitted | failed | pending
  p_cufe text DEFAULT NULL,
  p_xml text DEFAULT NULL,
  p_xml_url text DEFAULT NULL,
  p_provider text DEFAULT NULL,
  p_response jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE invoices SET
    transmission_status = p_status,
    transmitted_at = CASE WHEN p_status = 'transmitted' THEN now() ELSE transmitted_at END,
    cufe = COALESCE(p_cufe, cufe),
    xml_content = COALESCE(p_xml, xml_content),
    xml_url = COALESCE(p_xml_url, xml_url),
    provider = COALESCE(p_provider, provider),
    provider_response = COALESCE(p_response, provider_response)
  WHERE id = p_invoice_id;
END;
$$;
