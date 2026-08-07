// Fase 5 — Casos de uso del módulo de inteligencia (grafo + gemelo digital).

import { observability } from "@/lib/observability";
import { beginOperation, traceFields } from "@/lib/context/operationContext";
import { EMPTY_GRAPH, graphInsights, graphStats, topNodes, type KnowledgeGraph } from "../domain/knowledgeGraph";
import {
  cashRunwayDays,
  emptyBaseline,
  revenueConcentrationPct,
  simulate,
  type Scenario,
  type TwinBaseline,
} from "../domain/twin";
import type { IntelligenceRepository } from "./intelligenceRepository";

export interface IntelligenceDeps {
  repo: IntelligenceRepository;
  tenantId: string | null;
  currency: string;
}

export interface TwinSnapshot {
  baseline: TwinBaseline;
  graph: KnowledgeGraph;
  stats: ReturnType<typeof graphStats>;
  insights: ReturnType<typeof graphInsights>;
  topProductsGraph: ReturnType<typeof topNodes>;
  topCustomersGraph: ReturnType<typeof topNodes>;
  runwayDays: number | null;
  concentrationPct: number;
}

export async function loadTwinSnapshot(deps: IntelligenceDeps): Promise<TwinSnapshot> {
  if (!deps.tenantId) {
    const baseline = emptyBaseline(deps.currency);
    return {
      baseline,
      graph: EMPTY_GRAPH,
      stats: graphStats(EMPTY_GRAPH),
      insights: graphInsights(EMPTY_GRAPH),
      topProductsGraph: [],
      topCustomersGraph: [],
      runwayDays: null,
      concentrationPct: 0,
    };
  }

  const [baseline, graph] = await Promise.all([
    deps.repo.loadBaseline(deps.tenantId, deps.currency),
    deps.repo.loadGraph(deps.tenantId),
  ]);

  return {
    baseline,
    graph,
    stats: graphStats(graph),
    insights: graphInsights(graph),
    topProductsGraph: topNodes(graph, "product", 5),
    topCustomersGraph: topNodes(graph, "customer", 5),
    runwayDays: cashRunwayDays(baseline),
    concentrationPct: revenueConcentrationPct(baseline),
  };
}

export async function rebuildGraph(deps: IntelligenceDeps) {
  if (!deps.tenantId) throw new Error("Sin empresa activa");
  return withOperation({ module: "intelligence", operation: "rebuild_knowledge_graph" }, async () => {
    const result = await deps.repo.rebuildGraph(deps.tenantId as string);
    logger.info("intelligence", "knowledge graph rebuilt", result);
    return result;
  });
}

export function runScenario(baseline: TwinBaseline, scenario: Scenario) {
  return simulate(baseline, scenario);
}
