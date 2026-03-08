
-- Product categories
CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  color text DEFAULT '#10b981',
  parent_id uuid REFERENCES public.product_categories(id),
  tenant_id uuid REFERENCES public.tenants(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tax rates configuration
CREATE TABLE public.tax_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  rate numeric NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  tenant_id uuid REFERENCES public.tenants(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Currency configuration
CREATE TABLE public.currencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  symbol text NOT NULL DEFAULT '$',
  exchange_rate numeric NOT NULL DEFAULT 1,
  is_base boolean NOT NULL DEFAULT false,
  tenant_id uuid REFERENCES public.tenants(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Payment methods configuration
CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'cash',
  requires_card_info boolean NOT NULL DEFAULT false,
  tenant_id uuid REFERENCES public.tenants(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- System settings (key-value)
CREATE TABLE public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  value text,
  category text NOT NULL DEFAULT 'general',
  tenant_id uuid REFERENCES public.tenants(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(key, tenant_id)
);

-- Accounting: Chart of Accounts
CREATE TABLE public.accounting_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  type text NOT NULL, -- asset, liability, equity, income, expense
  parent_id uuid REFERENCES public.accounting_accounts(id),
  balance numeric NOT NULL DEFAULT 0,
  tenant_id uuid REFERENCES public.tenants(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Accounting: Journal Entries
CREATE TABLE public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  description text,
  reference_type text,
  reference_id uuid,
  status text NOT NULL DEFAULT 'draft',
  tenant_id uuid REFERENCES public.tenants(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Accounting: Journal Entry Lines
CREATE TABLE public.journal_entry_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounting_accounts(id),
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;

-- RLS Policies for all config tables (tenant-scoped)
-- product_categories
CREATE POLICY "Tenant view categories" ON public.product_categories FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant insert categories" ON public.product_categories FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant update categories" ON public.product_categories FOR UPDATE USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Admin delete categories" ON public.product_categories FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- tax_rates
CREATE POLICY "Tenant view taxes" ON public.tax_rates FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant insert taxes" ON public.tax_rates FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant update taxes" ON public.tax_rates FOR UPDATE USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Admin delete taxes" ON public.tax_rates FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- currencies
CREATE POLICY "Tenant view currencies" ON public.currencies FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant insert currencies" ON public.currencies FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant update currencies" ON public.currencies FOR UPDATE USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Admin delete currencies" ON public.currencies FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- payment_methods
CREATE POLICY "Tenant view payment_methods" ON public.payment_methods FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant insert payment_methods" ON public.payment_methods FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant update payment_methods" ON public.payment_methods FOR UPDATE USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Admin delete payment_methods" ON public.payment_methods FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- system_settings
CREATE POLICY "Tenant view settings" ON public.system_settings FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant insert settings" ON public.system_settings FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant update settings" ON public.system_settings FOR UPDATE USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

-- accounting_accounts
CREATE POLICY "Tenant view accounts" ON public.accounting_accounts FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant insert accounts" ON public.accounting_accounts FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant update accounts" ON public.accounting_accounts FOR UPDATE USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Admin delete accounts" ON public.accounting_accounts FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- journal_entries
CREATE POLICY "Tenant view entries" ON public.journal_entries FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant insert entries" ON public.journal_entries FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "Tenant update entries" ON public.journal_entries FOR UPDATE USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

-- journal_entry_lines
CREATE POLICY "Tenant view entry lines" ON public.journal_entry_lines FOR SELECT USING (entry_id IN (SELECT id FROM journal_entries WHERE tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())));
CREATE POLICY "Tenant insert entry lines" ON public.journal_entry_lines FOR INSERT WITH CHECK (entry_id IN (SELECT id FROM journal_entries WHERE tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())));

-- Triggers
CREATE TRIGGER update_product_categories_updated_at BEFORE UPDATE ON public.product_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_currencies_updated_at BEFORE UPDATE ON public.currencies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_accounting_accounts_updated_at BEFORE UPDATE ON public.accounting_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_journal_entries_updated_at BEFORE UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
