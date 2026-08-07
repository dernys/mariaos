/* eslint-disable @typescript-eslint/no-explicit-any -- filas sin tipar: objetos nuevos, el cliente tipado se regenera de forma asíncrona */
// Fase 5 — Infraestructura: única frontera con Lovable Cloud para inteligencia.

import { supabase } from "@/integrations/supabase/client";
import { Money } from "@/modules/shared/domain/money";
import type { KgEdge, KgNode, KnowledgeGraph } from "../domain/knowledgeGraph";
import { emptyBaseline, type TwinBaseline } from "../domain/twin";
import type { IntelligenceRepository } from "../application/intelligenceRepository";

// `kg_nodes`, `kg_edges`, `rebuild_knowledge_graph` y `twin_baseline` son objetos
// nuevos: el cliente tipado se regenera de forma asíncrona.
const db = supabase as unknown as {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

function toNode(row: any): KgNode {
  return {
    id: row.id,
    type: row.node_type,
    key: row.node_key,
    label: row.label,
    attributes: (row.attributes ?? {}) as Record<string, unknown>,
    importance: Number(row.importance ?? 0),
  };
}

function toEdge(row: any): KgEdge {
  return {
    id: row.id,
    srcId: row.src_id,
    dstId: row.dst_id,
    relation: row.relation,
    weight: Number(row.weight ?? 0),
    attributes: (row.attributes ?? {}) as Record<string, unknown>,
  };
}

export const supabaseIntelligenceRepository: IntelligenceRepository = {
  async loadGraph(tenantId: string): Promise<KnowledgeGraph> {
    const [nodesRes, edgesRes] = await Promise.all([
      db.from("kg_nodes").select("*").eq("tenant_id", tenantId).order("importance", { ascending: false }).limit(2000),
      db.from("kg_edges").select("*").eq("tenant_id", tenantId).order("weight", { ascending: false }).limit(5000),
    ]);
    if (nodesRes.error) throw nodesRes.error;
    if (edgesRes.error) throw edgesRes.error;
    return {
      nodes: (nodesRes.data ?? []).map(toNode),
      edges: (edgesRes.data ?? []).map(toEdge),
    };
  },

  async rebuildGraph(tenantId: string) {
    const { data, error } = await db.rpc("rebuild_knowledge_graph", { p_tenant_id: tenantId });
    if (error) throw error;
    return { nodes: Number(data?.nodes ?? 0), edges: Number(data?.edges ?? 0) };
  },

  async loadBaseline(tenantId: string, currency: string): Promise<TwinBaseline> {
    const { data, error } = await db.rpc("twin_baseline", { p_tenant_id: tenantId });
    if (error) throw error;
    if (!data) return emptyBaseline(currency);

    const m = (v: unknown) => Money.of(Number(v ?? 0), currency);
    return {
      windowDays: Number(data.window_days ?? 30),
      revenue: m(data.revenue),
      cogs: m(data.cogs),
      orders: Number(data.orders ?? 0),
      units: Number(data.units ?? 0),
      avgDailyRevenue: m(data.avg_daily_revenue),
      avgTicket: m(data.avg_ticket),
      grossMarginPct: Number(data.gross_margin_pct ?? 0),
      monthlyPayroll: m(data.monthly_payroll),
      cash: m(data.cash),
      topProducts: (data.top_products ?? []).map((p: any) => ({
        productId: p.product_id ?? null,
        name: p.name ?? "N/D",
        revenue: m(p.revenue),
        units: Number(p.units ?? 0),
      })),
      staleWindow: Boolean(data.stale_window),
      windowTo: data.window_to ?? null,
      computedAt: data.computed_at ?? null,
    };
  },
};
