-- ============ BUG-01: triggers duplicados ============
DROP TRIGGER IF EXISTS account_payments_apply ON public.account_payments;
DROP TRIGGER IF EXISTS account_payments_notify ON public.account_payments;
DROP TRIGGER IF EXISTS purchases_apply_credit ON public.purchases;
DROP TRIGGER IF EXISTS trg_purchases_updated ON public.purchases;
DROP TRIGGER IF EXISTS sales_apply_credit ON public.sales;
DROP TRIGGER IF EXISTS sales_consignment_alloc ON public.sales;
DROP TRIGGER IF EXISTS sales_loyalty ON public.sales;
DROP TRIGGER IF EXISTS update_sales_updated_at ON public.sales;
DROP TRIGGER IF EXISTS product_stock_low ON public.product_stock;
DROP TRIGGER IF EXISTS trg_inventory_movement_event ON public.inventory_movements;

-- ============ BUG-03: taxonomía unificada de cuentas ============
UPDATE public.accounting_accounts SET type = CASE type
  WHEN 'activo'   THEN 'asset'
  WHEN 'pasivo'   THEN 'liability'
  WHEN 'capital'  THEN 'equity'
  WHEN 'gasto'    THEN 'expense'
  WHEN 'ingreso'  THEN 'income'
  WHEN 'revenue'  THEN 'income'
  ELSE type END
WHERE type IN ('activo','pasivo','capital','gasto','ingreso','revenue');

ALTER TABLE public.accounting_accounts DROP CONSTRAINT IF EXISTS accounting_accounts_type_check;
ALTER TABLE public.accounting_accounts
  ADD CONSTRAINT accounting_accounts_type_check
  CHECK (type IN ('asset','liability','equity','income','expense','cost'));

-- ============ BUG-04: vistas de reportes con taxonomía correcta ============
CREATE OR REPLACE VIEW public.v_income_statement AS
SELECT gl.tenant_id, gl.period_id, a.type, a.code, a.name,
  CASE
    WHEN a.type = 'income' THEN gl.credit_total - gl.debit_total
    WHEN a.type IN ('expense','cost') THEN gl.debit_total - gl.credit_total
    ELSE 0::numeric
  END AS amount
FROM public.general_ledger gl
JOIN public.accounting_accounts a ON a.id = gl.account_id
WHERE a.type IN ('income','expense','cost');
ALTER VIEW public.v_income_statement SET (security_invoker = on);

CREATE OR REPLACE VIEW public.v_balance_sheet AS
SELECT gl.tenant_id, gl.period_id, a.type, a.code, a.name, gl.closing_balance
FROM public.general_ledger gl
JOIN public.accounting_accounts a ON a.id = gl.account_id
WHERE a.type IN ('asset','liability','equity');
ALTER VIEW public.v_balance_sheet SET (security_invoker = on);

-- ============ BUG-02: ventas completadas descuentan inventario ============
CREATE OR REPLACE FUNCTION public.trg_sale_stock_on_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.status,'') <> 'completed') THEN
    -- idempotencia: no descontar dos veces la misma venta
    IF NOT EXISTS (
      SELECT 1 FROM public.inventory_movements
      WHERE reference_type = 'sale' AND reference_id = NEW.id
    ) THEN
      PERFORM public.process_sale_stock(
        NEW.id,
        CASE WHEN NEW.store_id IS NOT NULL THEN 'store' ELSE 'tenant' END,
        COALESCE(NEW.store_id, NEW.tenant_id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sale_stock_on_complete ON public.sales;
CREATE TRIGGER trg_sale_stock_on_complete
AFTER INSERT OR UPDATE OF status ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.trg_sale_stock_on_complete();