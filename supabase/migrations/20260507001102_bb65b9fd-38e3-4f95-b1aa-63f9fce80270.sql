
-- Series de facturación por tenant
CREATE TABLE public.invoice_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  prefix text NOT NULL DEFAULT 'F',
  next_number bigint NOT NULL DEFAULT 1,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

ALTER TABLE public.invoice_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant view invoice_series" ON public.invoice_series FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant insert invoice_series" ON public.invoice_series FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant update invoice_series" ON public.invoice_series FOR UPDATE
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Superadmin all invoice_series" ON public.invoice_series FOR ALL TO authenticated
  USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));

-- Facturas
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  series_code text NOT NULL,
  invoice_number text NOT NULL,
  status text NOT NULL DEFAULT 'issued', -- issued | cancelled
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  -- Emisor (snapshot)
  issuer_name text NOT NULL,
  issuer_tax_id text,
  issuer_address text,
  issuer_phone text,
  issuer_email text,
  -- Receptor (snapshot)
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_tax_id text,
  customer_address text,
  customer_email text,
  customer_phone text,
  -- Totales
  currency text NOT NULL DEFAULT 'CUP',
  subtotal numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  -- Líneas snapshot
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  -- Documento
  pdf_url text,
  -- Envío email
  email_sent_to text,
  email_sent_at timestamptz,
  -- Anulación
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancelled_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, series_code, invoice_number)
);

CREATE INDEX idx_invoices_tenant_date ON public.invoices(tenant_id, issue_date DESC);
CREATE INDEX idx_invoices_sale ON public.invoices(sale_id);
CREATE INDEX idx_invoices_customer ON public.invoices(customer_id);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant view invoices" ON public.invoices FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant insert invoices" ON public.invoices FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant update invoices" ON public.invoices FOR UPDATE
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Superadmin all invoices" ON public.invoices FOR ALL TO authenticated
  USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));

CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_invoice_series_updated BEFORE UPDATE ON public.invoice_series
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: issue_invoice — crea la factura con número correlativo
CREATE OR REPLACE FUNCTION public.issue_invoice(p_sale_id uuid, p_series_code text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
  v_tenant record;
  v_customer record;
  v_series record;
  v_number bigint;
  v_invoice_number text;
  v_invoice_id uuid;
  v_items jsonb;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF v_sale IS NULL THEN RAISE EXCEPTION 'Venta no encontrada'; END IF;

  -- Evita duplicados
  IF EXISTS (SELECT 1 FROM invoices WHERE sale_id = p_sale_id AND status = 'issued') THEN
    RAISE EXCEPTION 'Esta venta ya tiene factura emitida';
  END IF;

  SELECT * INTO v_tenant FROM tenants WHERE id = v_sale.tenant_id;
  IF v_sale.customer_id IS NOT NULL THEN
    SELECT * INTO v_customer FROM customers WHERE id = v_sale.customer_id;
  END IF;

  -- Resolver serie (default si no se pasa)
  IF p_series_code IS NOT NULL THEN
    SELECT * INTO v_series FROM invoice_series
      WHERE tenant_id = v_sale.tenant_id AND code = p_series_code AND is_active = true FOR UPDATE;
  ELSE
    SELECT * INTO v_series FROM invoice_series
      WHERE tenant_id = v_sale.tenant_id AND is_default = true AND is_active = true FOR UPDATE;
  END IF;

  -- Crear serie default si no existe
  IF v_series IS NULL THEN
    INSERT INTO invoice_series (tenant_id, code, name, prefix, is_default)
      VALUES (v_sale.tenant_id, 'A', 'Serie A', 'F', true)
      RETURNING * INTO v_series;
  END IF;

  v_number := v_series.next_number;
  v_invoice_number := v_series.prefix || '-' || lpad(v_number::text, 6, '0');

  UPDATE invoice_series SET next_number = next_number + 1, updated_at = now()
    WHERE id = v_series.id;

  -- Snapshot de items
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'product_name', product_name,
    'sku', sku,
    'qty', qty,
    'price', price,
    'total', total
  ) ORDER BY created_at), '[]'::jsonb) INTO v_items
  FROM sale_items WHERE sale_id = p_sale_id;

  INSERT INTO invoices (
    tenant_id, sale_id, series_code, invoice_number, status,
    issuer_name, issuer_tax_id, issuer_address, issuer_phone, issuer_email,
    customer_id, customer_name, customer_tax_id, customer_address, customer_email, customer_phone,
    subtotal, tax, total, amount_paid, items, created_by
  ) VALUES (
    v_sale.tenant_id, p_sale_id, v_series.code, v_invoice_number, 'issued',
    v_tenant.name, v_tenant.rfc, v_tenant.address, v_tenant.phone, v_tenant.email,
    v_sale.customer_id,
    COALESCE(v_customer.name, 'Consumidor final'),
    v_customer.rfc, v_customer.address, v_customer.email, v_customer.phone,
    v_sale.subtotal, v_sale.tax, v_sale.total, v_sale.amount_paid, v_items, auth.uid()
  ) RETURNING id INTO v_invoice_id;

  RETURN v_invoice_id;
END;
$$;
