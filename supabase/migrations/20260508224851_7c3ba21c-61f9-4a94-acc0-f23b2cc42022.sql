
-- =====================================================
-- 1. HELPER: is_tenant_member
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_superadmin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.tenant_users
        WHERE user_id = auth.uid() AND tenant_id = _tenant
      );
$$;

-- =====================================================
-- 2. RESTRICT tenants PII (marketplace public view)
-- =====================================================
DROP POLICY IF EXISTS "Anyone can view active tenants" ON public.tenants;

CREATE OR REPLACE VIEW public.tenants_public
WITH (security_invoker = on) AS
  SELECT id, name, slug, logo_url, business_type
  FROM public.tenants
  WHERE is_active = true;

GRANT SELECT ON public.tenants_public TO anon, authenticated;

-- Allow public read of the safe view via a permissive policy on base table for those columns is not granular,
-- so we expose strictly via the view; base table now requires membership/superadmin.

-- =====================================================
-- 3. AUTO-FILL tenant_id helper trigger
-- =====================================================
CREATE OR REPLACE FUNCTION public.autofill_tenant_id()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_tid uuid;
BEGIN
  IF NEW.tenant_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT tenant_id INTO v_tid FROM public.tenant_users
      WHERE user_id = auth.uid() LIMIT 1;
    IF v_tid IS NOT NULL THEN NEW.tenant_id := v_tid; END IF;
  END IF;
  RETURN NEW;
END $$;

-- Attach autofill to common writable tables that have tenant_id
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'products','customers','employees','suppliers','sales','purchases',
    'product_categories','warehouses','stores','restaurant_tables',
    'invoices','sale_returns','account_payments','stock_transfers',
    'inventory_movements','sales_shifts','shift_cash_movements',
    'kitchen_orders','online_orders','delivery_zones','delivery_riders',
    'delivery_assignments','employee_attendance','work_schedules',
    'payroll_runs','notifications','activity_log','coupons','promotions',
    'loyalty_movements','journal_entries','accounting_accounts',
    'tax_rates','currencies','payment_methods'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_autofill_tenant ON public.%I;', t);
    EXECUTE format(
      'CREATE TRIGGER trg_autofill_tenant BEFORE INSERT ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.autofill_tenant_id();', t);
  END LOOP;
END $$;

-- =====================================================
-- 4. WIRE UP MISSING TRIGGERS (cross-module flows)
-- =====================================================

-- Ticket numbering on sales
DROP TRIGGER IF EXISTS trg_assign_ticket_number ON public.sales;
CREATE TRIGGER trg_assign_ticket_number
  BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.assign_ticket_number();

-- Sale credit balance (when partial/pending) — on insert and update of amount_paid
DROP TRIGGER IF EXISTS trg_apply_sale_credit_balance ON public.sales;
CREATE TRIGGER trg_apply_sale_credit_balance
  AFTER INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.apply_sale_credit_balance();

-- Purchase credit balance
DROP TRIGGER IF EXISTS trg_apply_purchase_credit_balance ON public.purchases;
CREATE TRIGGER trg_apply_purchase_credit_balance
  AFTER INSERT ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.apply_purchase_credit_balance();

-- Account payment → updates balances + sale/purchase amount_paid
DROP TRIGGER IF EXISTS trg_apply_account_payment_balance ON public.account_payments;
CREATE TRIGGER trg_apply_account_payment_balance
  AFTER INSERT ON public.account_payments
  FOR EACH ROW EXECUTE FUNCTION public.apply_account_payment_balance();

-- Notify on account payment
DROP TRIGGER IF EXISTS trg_notify_account_payment ON public.account_payments;
CREATE TRIGGER trg_notify_account_payment
  AFTER INSERT ON public.account_payments
  FOR EACH ROW EXECUTE FUNCTION public.notify_account_payment();

-- Low stock notification
DROP TRIGGER IF EXISTS trg_notify_low_stock ON public.product_stock;
CREATE TRIGGER trg_notify_low_stock
  AFTER UPDATE OF stock ON public.product_stock
  FOR EACH ROW EXECUTE FUNCTION public.notify_low_stock();

-- Sale journal entry
DROP TRIGGER IF EXISTS trg_post_sale_journal ON public.sales;
CREATE TRIGGER trg_post_sale_journal
  AFTER INSERT OR UPDATE OF status ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.trg_post_sale_journal();

-- Purchase journal entry
DROP TRIGGER IF EXISTS trg_post_purchase_journal ON public.purchases;
CREATE TRIGGER trg_post_purchase_journal
  AFTER UPDATE OF status ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.trg_post_purchase_journal();

-- Loyalty points on paid sale
DROP TRIGGER IF EXISTS trg_auto_award_loyalty ON public.sales;
CREATE TRIGGER trg_auto_award_loyalty
  AFTER UPDATE OF status ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.trg_auto_award_loyalty();

-- Consignment allocation on paid sale
DROP TRIGGER IF EXISTS trg_consignment_on_paid ON public.sales;
CREATE TRIGGER trg_consignment_on_paid
  AFTER UPDATE OF status ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.trg_consignment_on_paid();

-- Invoice issued notification
DROP TRIGGER IF EXISTS trg_notify_invoice_issued ON public.invoices;
CREATE TRIGGER trg_notify_invoice_issued
  AFTER INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.notify_invoice_issued();

-- Shift change notification
DROP TRIGGER IF EXISTS trg_notify_shift_change ON public.sales_shifts;
CREATE TRIGGER trg_notify_shift_change
  AFTER INSERT OR UPDATE ON public.sales_shifts
  FOR EACH ROW EXECUTE FUNCTION public.notify_shift_change();

-- Sale return notification
DROP TRIGGER IF EXISTS trg_notify_sale_return ON public.sale_returns;
CREATE TRIGGER trg_notify_sale_return
  AFTER INSERT ON public.sale_returns
  FOR EACH ROW EXECUTE FUNCTION public.notify_sale_return();

-- Sync supplier_products from purchase items
DROP TRIGGER IF EXISTS trg_sync_supplier_product ON public.purchase_items;
CREATE TRIGGER trg_sync_supplier_product
  AFTER INSERT ON public.purchase_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_supplier_product_from_purchase();

-- updated_at touch on key tables
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'products','customers','employees','suppliers','sales','purchases',
    'tenants','profiles','invoices','warehouses','stores','restaurant_tables',
    'sales_shifts','accounting_accounts','tax_rates','currencies',
    'payment_methods','pos_settings','module_settings','system_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name=t AND column_name='updated_at') THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_updated_at ON public.%I;', t);
      EXECUTE format(
        'CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();', t);
    END IF;
  END LOOP;
END $$;
