
-- 1) Helper: ensure default accounts per tenant
CREATE OR REPLACE FUNCTION public.ensure_default_accounts(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO accounting_accounts (tenant_id, code, name, type) VALUES
    (p_tenant_id, '1100', 'Caja', 'asset'),
    (p_tenant_id, '1110', 'Bancos', 'asset'),
    (p_tenant_id, '1200', 'Cuentas por Cobrar', 'asset'),
    (p_tenant_id, '1300', 'Inventario', 'asset'),
    (p_tenant_id, '2100', 'Cuentas por Pagar', 'liability'),
    (p_tenant_id, '2200', 'Impuestos por Pagar', 'liability'),
    (p_tenant_id, '4100', 'Ventas', 'revenue'),
    (p_tenant_id, '5100', 'Costo de Ventas', 'expense')
  ON CONFLICT DO NOTHING;
END; $$;

-- Add unique constraint to allow upserts
DO $$ BEGIN
  ALTER TABLE accounting_accounts ADD CONSTRAINT accounting_accounts_tenant_code_uniq UNIQUE (tenant_id, code);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

-- 2) Post journal entry for a sale
CREATE OR REPLACE FUNCTION public.post_sale_journal_entry(p_sale_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_sale record;
  v_entry_id uuid;
  v_cash_total numeric := 0;
  v_card_total numeric := 0;
  v_pending numeric := 0;
  v_acc_caja uuid; v_acc_banco uuid; v_acc_cxc uuid;
  v_acc_ventas uuid; v_acc_iva uuid;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF v_sale IS NULL THEN RETURN NULL; END IF;

  -- Skip if already posted
  IF EXISTS (SELECT 1 FROM journal_entries WHERE reference_type='sale' AND reference_id=p_sale_id) THEN
    RETURN NULL;
  END IF;

  PERFORM ensure_default_accounts(v_sale.tenant_id);

  SELECT id INTO v_acc_caja FROM accounting_accounts WHERE tenant_id=v_sale.tenant_id AND code='1100';
  SELECT id INTO v_acc_banco FROM accounting_accounts WHERE tenant_id=v_sale.tenant_id AND code='1110';
  SELECT id INTO v_acc_cxc FROM accounting_accounts WHERE tenant_id=v_sale.tenant_id AND code='1200';
  SELECT id INTO v_acc_ventas FROM accounting_accounts WHERE tenant_id=v_sale.tenant_id AND code='4100';
  SELECT id INTO v_acc_iva FROM accounting_accounts WHERE tenant_id=v_sale.tenant_id AND code='2200';

  SELECT COALESCE(SUM(amount_in_base) FILTER (WHERE method='cash'),0),
         COALESCE(SUM(amount_in_base) FILTER (WHERE method IN ('card','qr','transfer')),0)
    INTO v_cash_total, v_card_total
    FROM sale_payments WHERE sale_id = p_sale_id;

  v_pending := GREATEST(0, COALESCE(v_sale.total,0) - COALESCE(v_sale.amount_paid,0));

  INSERT INTO journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, status, created_by)
  VALUES (v_sale.tenant_id, 'V-'||substr(p_sale_id::text,1,8), CURRENT_DATE,
          'Venta '||COALESCE(v_sale.ticket_number, p_sale_id::text), 'sale', p_sale_id, 'posted', auth.uid())
  RETURNING id INTO v_entry_id;

  -- Debits
  IF v_cash_total > 0 THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
    VALUES (v_entry_id, v_acc_caja, v_cash_total, 0, 'Cobro efectivo');
  END IF;
  IF v_card_total > 0 THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
    VALUES (v_entry_id, v_acc_banco, v_card_total, 0, 'Cobro tarjeta/transferencia');
  END IF;
  IF v_pending > 0 THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
    VALUES (v_entry_id, v_acc_cxc, v_pending, 0, 'Saldo a cobrar');
  END IF;

  -- Credits
  INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
  VALUES (v_entry_id, v_acc_ventas, 0, COALESCE(v_sale.subtotal,0), 'Ingreso por venta');

  IF COALESCE(v_sale.tax,0) > 0 THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
    VALUES (v_entry_id, v_acc_iva, 0, v_sale.tax, 'Impuestos cobrados');
  END IF;

  RETURN v_entry_id;
END; $$;

-- 3) Post journal entry for a purchase reception
CREATE OR REPLACE FUNCTION public.post_purchase_journal_entry(p_purchase_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_p record; v_entry_id uuid;
  v_acc_inv uuid; v_acc_iva uuid; v_acc_cxp uuid; v_acc_caja uuid;
  v_paid numeric; v_pending numeric;
BEGIN
  SELECT * INTO v_p FROM purchases WHERE id = p_purchase_id;
  IF v_p IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE reference_type='purchase' AND reference_id=p_purchase_id) THEN
    RETURN NULL;
  END IF;

  PERFORM ensure_default_accounts(v_p.tenant_id);
  SELECT id INTO v_acc_inv FROM accounting_accounts WHERE tenant_id=v_p.tenant_id AND code='1300';
  SELECT id INTO v_acc_iva FROM accounting_accounts WHERE tenant_id=v_p.tenant_id AND code='2200';
  SELECT id INTO v_acc_cxp FROM accounting_accounts WHERE tenant_id=v_p.tenant_id AND code='2100';
  SELECT id INTO v_acc_caja FROM accounting_accounts WHERE tenant_id=v_p.tenant_id AND code='1100';

  v_paid := COALESCE(v_p.amount_paid,0);
  v_pending := GREATEST(0, COALESCE(v_p.total,0) - v_paid);

  INSERT INTO journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, status, created_by)
  VALUES (v_p.tenant_id, 'C-'||substr(p_purchase_id::text,1,8), CURRENT_DATE,
          'Compra '||COALESCE(v_p.purchase_number, p_purchase_id::text), 'purchase', p_purchase_id, 'posted', auth.uid())
  RETURNING id INTO v_entry_id;

  -- Debit inventario (subtotal) and IVA
  INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
  VALUES (v_entry_id, v_acc_inv, COALESCE(v_p.subtotal,0), 0, 'Entrada inventario');

  IF COALESCE(v_p.tax,0) > 0 THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
    VALUES (v_entry_id, v_acc_iva, v_p.tax, 0, 'IVA acreditable');
  END IF;

  IF v_paid > 0 THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
    VALUES (v_entry_id, v_acc_caja, 0, v_paid, 'Pago al recibir');
  END IF;
  IF v_pending > 0 THEN
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
    VALUES (v_entry_id, v_acc_cxp, 0, v_pending, 'Saldo por pagar');
  END IF;

  RETURN v_entry_id;
END; $$;

-- 4) Triggers
CREATE OR REPLACE FUNCTION public.trg_post_sale_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status IN ('paid','partial','pending') THEN
    PERFORM public.post_sale_journal_entry(NEW.id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS sales_post_journal ON public.sales;
CREATE TRIGGER sales_post_journal AFTER INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.trg_post_sale_journal();

CREATE OR REPLACE FUNCTION public.trg_post_purchase_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'received' AND (OLD.status IS NULL OR OLD.status <> 'received') THEN
    PERFORM public.post_purchase_journal_entry(NEW.id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS purchases_post_journal ON public.purchases;
CREATE TRIGGER purchases_post_journal AFTER UPDATE ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.trg_post_purchase_journal();

-- 5) Apply credit balances on sales/purchases (re-attach in case missing)
DROP TRIGGER IF EXISTS sales_apply_credit ON public.sales;
CREATE TRIGGER sales_apply_credit AFTER INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.apply_sale_credit_balance();

DROP TRIGGER IF EXISTS purchases_apply_credit ON public.purchases;
CREATE TRIGGER purchases_apply_credit AFTER INSERT ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.apply_purchase_credit_balance();

-- Auto-award loyalty
DROP TRIGGER IF EXISTS sales_loyalty ON public.sales;
CREATE TRIGGER sales_loyalty AFTER INSERT OR UPDATE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_award_loyalty();

-- Apply payments
DROP TRIGGER IF EXISTS account_payments_apply ON public.account_payments;
CREATE TRIGGER account_payments_apply AFTER INSERT ON public.account_payments
FOR EACH ROW EXECUTE FUNCTION public.apply_account_payment_balance();

-- Notifications
DROP TRIGGER IF EXISTS account_payments_notify ON public.account_payments;
CREATE TRIGGER account_payments_notify AFTER INSERT ON public.account_payments
FOR EACH ROW EXECUTE FUNCTION public.notify_account_payment();

DROP TRIGGER IF EXISTS shifts_notify ON public.sales_shifts;
CREATE TRIGGER shifts_notify AFTER INSERT OR UPDATE ON public.sales_shifts
FOR EACH ROW EXECUTE FUNCTION public.notify_shift_change();

DROP TRIGGER IF EXISTS invoices_notify ON public.invoices;
CREATE TRIGGER invoices_notify AFTER INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.notify_invoice_issued();

-- low stock
DROP TRIGGER IF EXISTS product_stock_low ON public.product_stock;
CREATE TRIGGER product_stock_low AFTER INSERT OR UPDATE ON public.product_stock
FOR EACH ROW EXECUTE FUNCTION public.notify_low_stock();

-- updated_at on supplier_products
DROP TRIGGER IF EXISTS supplier_products_updated ON public.supplier_products;
CREATE TRIGGER supplier_products_updated BEFORE UPDATE ON public.supplier_products
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- supplier_products from purchase
DROP TRIGGER IF EXISTS purchase_items_sync_supplier ON public.purchase_items;
CREATE TRIGGER purchase_items_sync_supplier AFTER INSERT ON public.purchase_items
FOR EACH ROW EXECUTE FUNCTION public.sync_supplier_product_from_purchase();
