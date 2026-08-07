-- Fase 5 — Knowledge Graph + baseline del gemelo digital
-- Rollback: DROP FUNCTION public.twin_baseline(uuid); DROP FUNCTION public.rebuild_knowledge_graph(uuid);
--           DROP TABLE public.kg_edges; DROP TABLE public.kg_nodes;

CREATE TABLE public.kg_nodes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  node_type text NOT NULL,
  node_key text NOT NULL,
  label text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  importance numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, node_type, node_key)
);

GRANT SELECT ON public.kg_nodes TO authenticated;
GRANT ALL ON public.kg_nodes TO service_role;
ALTER TABLE public.kg_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kg_nodes_select_members" ON public.kg_nodes
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));

CREATE TABLE public.kg_edges (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  src_id uuid NOT NULL REFERENCES public.kg_nodes(id) ON DELETE CASCADE,
  dst_id uuid NOT NULL REFERENCES public.kg_nodes(id) ON DELETE CASCADE,
  relation text NOT NULL,
  weight numeric NOT NULL DEFAULT 1,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, src_id, dst_id, relation)
);

GRANT SELECT ON public.kg_edges TO authenticated;
GRANT ALL ON public.kg_edges TO service_role;
ALTER TABLE public.kg_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kg_edges_select_members" ON public.kg_edges
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));

CREATE INDEX idx_kg_nodes_tenant_type ON public.kg_nodes(tenant_id, node_type);
CREATE INDEX idx_kg_edges_tenant_rel ON public.kg_edges(tenant_id, relation);
CREATE INDEX idx_kg_edges_src ON public.kg_edges(src_id);
CREATE INDEX idx_kg_edges_dst ON public.kg_edges(dst_id);

CREATE TRIGGER update_kg_nodes_updated_at BEFORE UPDATE ON public.kg_nodes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_kg_edges_updated_at BEFORE UPDATE ON public.kg_edges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Reconstruye el grafo de conocimiento de una empresa
CREATE OR REPLACE FUNCTION public.rebuild_knowledge_graph(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nodes int := 0;
  v_edges int := 0;
BEGIN
  IF NOT (public.is_tenant_member(p_tenant_id) OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  DELETE FROM public.kg_edges WHERE tenant_id = p_tenant_id;
  DELETE FROM public.kg_nodes WHERE tenant_id = p_tenant_id;

  -- Nodos: productos
  INSERT INTO public.kg_nodes (tenant_id, node_type, node_key, label, attributes)
  SELECT p.tenant_id, 'product', p.id::text, p.name,
         jsonb_build_object('sku', p.sku, 'price', p.price, 'cost', p.cost,
                            'category', p.category, 'brand', p.brand, 'stock', p.stock)
  FROM public.products p
  WHERE p.tenant_id = p_tenant_id AND coalesce(p.is_active, true)
  ON CONFLICT (tenant_id, node_type, node_key) DO NOTHING;

  -- Nodos: categorías
  INSERT INTO public.kg_nodes (tenant_id, node_type, node_key, label)
  SELECT DISTINCT p_tenant_id, 'category', p.category, p.category
  FROM public.products p
  WHERE p.tenant_id = p_tenant_id AND p.category IS NOT NULL AND p.category <> ''
  ON CONFLICT (tenant_id, node_type, node_key) DO NOTHING;

  -- Nodos: clientes
  INSERT INTO public.kg_nodes (tenant_id, node_type, node_key, label, attributes)
  SELECT c.tenant_id, 'customer', c.id::text, c.name,
         jsonb_build_object('balance', c.balance, 'total_spent', c.total_spent,
                            'visits', c.visits_count, 'tier', c.loyalty_tier)
  FROM public.customers c WHERE c.tenant_id = p_tenant_id
  ON CONFLICT (tenant_id, node_type, node_key) DO NOTHING;

  -- Nodos: proveedores
  INSERT INTO public.kg_nodes (tenant_id, node_type, node_key, label, attributes)
  SELECT s.tenant_id, 'supplier', s.id::text, s.name,
         jsonb_build_object('balance', s.balance)
  FROM public.suppliers s WHERE s.tenant_id = p_tenant_id
  ON CONFLICT (tenant_id, node_type, node_key) DO NOTHING;

  -- Nodos: tiendas
  INSERT INTO public.kg_nodes (tenant_id, node_type, node_key, label, attributes)
  SELECT st.tenant_id, 'store', st.id::text, st.name,
         jsonb_build_object('store_type', st.store_type, 'status', st.operational_status)
  FROM public.stores st WHERE st.tenant_id = p_tenant_id
  ON CONFLICT (tenant_id, node_type, node_key) DO NOTHING;

  -- Nodos: empleados
  INSERT INTO public.kg_nodes (tenant_id, node_type, node_key, label, attributes)
  SELECT e.tenant_id, 'employee', e.id::text, e.name,
         jsonb_build_object('position', e.position, 'salary', e.salary, 'active', e.is_active)
  FROM public.employees e WHERE e.tenant_id = p_tenant_id
  ON CONFLICT (tenant_id, node_type, node_key) DO NOTHING;

  -- Aristas: producto -> categoría
  INSERT INTO public.kg_edges (tenant_id, src_id, dst_id, relation, weight)
  SELECT p_tenant_id, np.id, nc.id, 'in_category', 1
  FROM public.products p
  JOIN public.kg_nodes np ON np.tenant_id = p_tenant_id AND np.node_type = 'product' AND np.node_key = p.id::text
  JOIN public.kg_nodes nc ON nc.tenant_id = p_tenant_id AND nc.node_type = 'category' AND nc.node_key = p.category
  WHERE p.tenant_id = p_tenant_id
  ON CONFLICT DO NOTHING;

  -- Aristas: cliente -> producto (compró)
  INSERT INTO public.kg_edges (tenant_id, src_id, dst_id, relation, weight, attributes)
  SELECT p_tenant_id, nc.id, np.id, 'bought', sum(si.qty),
         jsonb_build_object('amount', round(sum(si.total)::numeric, 2), 'orders', count(DISTINCT s.id))
  FROM public.sales s
  JOIN public.sale_items si ON si.sale_id = s.id
  JOIN public.kg_nodes nc ON nc.tenant_id = p_tenant_id AND nc.node_type = 'customer' AND nc.node_key = s.customer_id::text
  JOIN public.kg_nodes np ON np.tenant_id = p_tenant_id AND np.node_type = 'product' AND np.node_key = si.product_id::text
  WHERE s.tenant_id = p_tenant_id AND s.status = 'completed' AND s.customer_id IS NOT NULL
  GROUP BY nc.id, np.id
  ON CONFLICT DO NOTHING;

  -- Aristas: tienda -> producto (vendió)
  INSERT INTO public.kg_edges (tenant_id, src_id, dst_id, relation, weight, attributes)
  SELECT p_tenant_id, ns.id, np.id, 'sold', sum(si.qty),
         jsonb_build_object('amount', round(sum(si.total)::numeric, 2))
  FROM public.sales s
  JOIN public.sale_items si ON si.sale_id = s.id
  JOIN public.kg_nodes ns ON ns.tenant_id = p_tenant_id AND ns.node_type = 'store' AND ns.node_key = s.store_id::text
  JOIN public.kg_nodes np ON np.tenant_id = p_tenant_id AND np.node_type = 'product' AND np.node_key = si.product_id::text
  WHERE s.tenant_id = p_tenant_id AND s.status = 'completed' AND s.store_id IS NOT NULL
  GROUP BY ns.id, np.id
  ON CONFLICT DO NOTHING;

  -- Aristas: proveedor -> producto (suministra)
  INSERT INTO public.kg_edges (tenant_id, src_id, dst_id, relation, weight, attributes)
  SELECT p_tenant_id, nsup.id, np.id, 'supplies', sum(pi.qty),
         jsonb_build_object('amount', round(sum(pi.total)::numeric, 2))
  FROM public.purchases pu
  JOIN public.purchase_items pi ON pi.purchase_id = pu.id
  JOIN public.kg_nodes nsup ON nsup.tenant_id = p_tenant_id AND nsup.node_type = 'supplier' AND nsup.node_key = pu.supplier_id::text
  JOIN public.kg_nodes np ON np.tenant_id = p_tenant_id AND np.node_type = 'product' AND np.node_key = pi.product_id::text
  WHERE pu.tenant_id = p_tenant_id AND pu.supplier_id IS NOT NULL
  GROUP BY nsup.id, np.id
  ON CONFLICT DO NOTHING;

  -- Aristas: empleado -> tienda (opera)
  INSERT INTO public.kg_edges (tenant_id, src_id, dst_id, relation, weight, attributes)
  SELECT p_tenant_id, ne.id, ns.id, 'operates', count(*),
         jsonb_build_object('amount', round(sum(s.total)::numeric, 2))
  FROM public.sales s
  JOIN public.kg_nodes ne ON ne.tenant_id = p_tenant_id AND ne.node_type = 'employee' AND ne.node_key = s.employee_id::text
  JOIN public.kg_nodes ns ON ns.tenant_id = p_tenant_id AND ns.node_type = 'store' AND ns.node_key = s.store_id::text
  WHERE s.tenant_id = p_tenant_id AND s.status = 'completed'
  GROUP BY ne.id, ns.id
  ON CONFLICT DO NOTHING;

  -- Importancia = grado ponderado normalizado
  UPDATE public.kg_nodes n
  SET importance = sub.deg
  FROM (
    SELECT id, sum(w) AS deg FROM (
      SELECT src_id AS id, weight AS w FROM public.kg_edges WHERE tenant_id = p_tenant_id
      UNION ALL
      SELECT dst_id AS id, weight AS w FROM public.kg_edges WHERE tenant_id = p_tenant_id
    ) t GROUP BY id
  ) sub
  WHERE n.id = sub.id AND n.tenant_id = p_tenant_id;

  SELECT count(*) INTO v_nodes FROM public.kg_nodes WHERE tenant_id = p_tenant_id;
  SELECT count(*) INTO v_edges FROM public.kg_edges WHERE tenant_id = p_tenant_id;

  RETURN jsonb_build_object('nodes', v_nodes, 'edges', v_edges, 'rebuilt_at', now());
END;
$$;

-- Línea base del gemelo digital (entrada del motor de simulación en el cliente)
CREATE OR REPLACE FUNCTION public.twin_baseline(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days int := 30;
  v_revenue numeric := 0;
  v_cogs numeric := 0;
  v_orders int := 0;
  v_units numeric := 0;
  v_payroll numeric := 0;
  v_cash numeric := 0;
  v_top jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.is_tenant_member(p_tenant_id) OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT coalesce(sum(s.total), 0), count(*)
    INTO v_revenue, v_orders
  FROM public.sales s
  WHERE s.tenant_id = p_tenant_id AND s.status = 'completed'
    AND s.created_at >= now() - (v_days || ' days')::interval;

  SELECT coalesce(sum(si.qty * coalesce(p.cost, 0)), 0), coalesce(sum(si.qty), 0)
    INTO v_cogs, v_units
  FROM public.sales s
  JOIN public.sale_items si ON si.sale_id = s.id
  LEFT JOIN public.products p ON p.id = si.product_id
  WHERE s.tenant_id = p_tenant_id AND s.status = 'completed'
    AND s.created_at >= now() - (v_days || ' days')::interval;

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
      AND s.created_at >= now() - (v_days || ' days')::interval
    GROUP BY si.product_id, si.product_name
    ORDER BY 3 DESC
    LIMIT 5
  ) t;

  RETURN jsonb_build_object(
    'window_days', v_days,
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

REVOKE ALL ON FUNCTION public.rebuild_knowledge_graph(uuid) FROM public;
REVOKE ALL ON FUNCTION public.twin_baseline(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.rebuild_knowledge_graph(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.twin_baseline(uuid) TO authenticated;