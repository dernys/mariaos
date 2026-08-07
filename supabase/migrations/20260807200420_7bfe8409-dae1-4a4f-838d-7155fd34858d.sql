-- Fase 5 — twin_baseline con ventana adaptativa
-- Rollback: restaurar la versión anterior (misma función, sin p_days ni fallback).
CREATE OR REPLACE FUNCTION public.twin_baseline(p_tenant_id uuid, p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days int := greatest(coalesce(p_days, 30), 1);
  v_from timestamptz;
  v_to timestamptz := now();
  v_last timestamptz;
  v_revenue numeric := 0;
  v_cogs numeric := 0;
  v_orders int := 0;
  v_units numeric := 0;
  v_payroll numeric := 0;
  v_cash numeric := 0;
  v_stale boolean := false;
  v_top jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.is_tenant_member(p_tenant_id) OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_from := v_to - (v_days || ' days')::interval;

  -- Ventana adaptativa: si no hay ventas recientes, usar el último período con actividad.
  IF NOT EXISTS (
    SELECT 1 FROM public.sales s
    WHERE s.tenant_id = p_tenant_id AND s.status = 'completed' AND s.created_at >= v_from
  ) THEN
    SELECT max(s.created_at) INTO v_last
    FROM public.sales s
    WHERE s.tenant_id = p_tenant_id AND s.status = 'completed';
    IF v_last IS NOT NULL THEN
      v_to := v_last;
      v_from := v_last - (v_days || ' days')::interval;
      v_stale := true;
    END IF;
  END IF;

  SELECT coalesce(sum(s.total), 0), count(*)
    INTO v_revenue, v_orders
  FROM public.sales s
  WHERE s.tenant_id = p_tenant_id AND s.status = 'completed'
    AND s.created_at BETWEEN v_from AND v_to;

  SELECT coalesce(sum(si.qty * coalesce(p.cost, 0)), 0), coalesce(sum(si.qty), 0)
    INTO v_cogs, v_units
  FROM public.sales s
  JOIN public.sale_items si ON si.sale_id = s.id
  LEFT JOIN public.products p ON p.id = si.product_id
  WHERE s.tenant_id = p_tenant_id AND s.status = 'completed'
    AND s.created_at BETWEEN v_from AND v_to;

  SELECT coalesce(sum(e.salary), 0) INTO v_payroll
  FROM public.employees e
  WHERE e.tenant_id = p_tenant_id AND coalesce(e.is_active, true);

  SELECT coalesce(sum(b.current_balance), 0) INTO v_cash
  FROM public.bank_accounts b WHERE b.tenant_id = p_tenant_id;

  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO v_top FROM (
    SELECT si.product_id, coalesce(si.product_name, 'N/D') AS name,
           round(sum(si.total)::numeric, 2) AS revenue,
           sum(si.qty) AS units
    FROM public.sales s
    JOIN public.sale_items si ON si.sale_id = s.id
    WHERE s.tenant_id = p_tenant_id AND s.status = 'completed'
      AND s.created_at BETWEEN v_from AND v_to
    GROUP BY si.product_id, si.product_name
    ORDER BY 3 DESC
    LIMIT 5
  ) t;

  RETURN jsonb_build_object(
    'window_days', v_days,
    'window_from', v_from,
    'window_to', v_to,
    'stale_window', v_stale,
    'revenue', round(v_revenue, 2),
    'cogs', round(v_cogs, 2),
    'orders', v_orders,
    'units', v_units,
    'avg_daily_revenue', round(v_revenue / v_days, 2),
    'avg_ticket', CASE WHEN v_orders > 0 THEN round(v_revenue / v_orders, 2) ELSE 0 END,
    'gross_margin_pct', CASE WHEN v_revenue > 0 THEN round(((v_revenue - v_cogs) / v_revenue) * 100, 2) ELSE 0 END,
    'monthly_payroll', round(v_payroll, 2),
    'cash', round(v_cash, 2),
    'top_products', v_top,
    'computed_at', now()
  );
END;
$$;

DROP FUNCTION IF EXISTS public.twin_baseline(uuid);
REVOKE ALL ON FUNCTION public.twin_baseline(uuid, int) FROM public;
GRANT EXECUTE ON FUNCTION public.twin_baseline(uuid, int) TO authenticated;