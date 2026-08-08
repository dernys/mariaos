CREATE OR REPLACE FUNCTION public.refresh_shift_totals(p_shift_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total numeric := 0;
  v_tx int := 0;
  v_cash numeric := 0;
BEGIN
  IF p_shift_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(total),0), COUNT(*)
    INTO v_total, v_tx
    FROM public.sales
    WHERE shift_id = p_shift_id AND COALESCE(status,'') <> 'cancelled';

  SELECT COALESCE(SUM(sp.amount_in_base),0)
    INTO v_cash
    FROM public.sale_payments sp
    JOIN public.sales s ON s.id = sp.sale_id
    WHERE s.shift_id = p_shift_id AND COALESCE(s.status,'') <> 'cancelled' AND sp.method = 'cash';

  UPDATE public.sales_shifts
     SET total_sales = v_total,
         total_transactions = v_tx
   WHERE id = p_shift_id;
END $$;

CREATE OR REPLACE FUNCTION public.trg_refresh_shift_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.shift_id IS DISTINCT FROM NEW.shift_id THEN
    PERFORM public.refresh_shift_totals(OLD.shift_id);
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_shift_totals(OLD.shift_id);
    RETURN OLD;
  END IF;
  PERFORM public.refresh_shift_totals(NEW.shift_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sales_refresh_shift_totals ON public.sales;
CREATE TRIGGER trg_sales_refresh_shift_totals
AFTER INSERT OR UPDATE OF total, status, shift_id, amount_paid OR DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_shift_totals();

CREATE OR REPLACE FUNCTION public.trg_payments_refresh_shift_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_shift uuid;
BEGIN
  SELECT shift_id INTO v_shift FROM public.sales WHERE id = COALESCE(NEW.sale_id, OLD.sale_id);
  PERFORM public.refresh_shift_totals(v_shift);
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_sale_payments_refresh_shift_totals ON public.sale_payments;
CREATE TRIGGER trg_sale_payments_refresh_shift_totals
AFTER INSERT OR UPDATE OR DELETE ON public.sale_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_payments_refresh_shift_totals();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.sales_shifts LOOP
    PERFORM public.refresh_shift_totals(r.id);
  END LOOP;
END $$;