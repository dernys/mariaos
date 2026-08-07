// Fase 5 — Capa UI del módulo de inteligencia: TanStack Query.
// Este directorio NO puede importar supabase-js (regla de eslint).

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/hooks/useTenant";
import {
  loadTwinSnapshot,
  rebuildGraph,
  runScenario,
  type IntelligenceDeps,
} from "../application/intelligenceUseCases";
import { supabaseIntelligenceRepository } from "../infrastructure/supabaseIntelligenceRepository";
import { DEFAULT_SCENARIO, emptyBaseline, type Scenario } from "../domain/twin";
import { EMPTY_GRAPH, graphInsights, graphStats } from "../domain/knowledgeGraph";

export function useIntelligenceDeps(currency = "CUP"): IntelligenceDeps {
  const tenantId = useTenant();
  return useMemo(
    () => ({ repo: supabaseIntelligenceRepository, tenantId, currency }),
    [tenantId, currency],
  );
}

export function useDigitalTwin(currency = "CUP") {
  const deps = useIntelligenceDeps(currency);
  const qc = useQueryClient();
  const [scenario, setScenario] = useState<Scenario>(DEFAULT_SCENARIO);

  const query = useQuery({
    queryKey: ["digital-twin", deps.tenantId, currency],
    queryFn: () => loadTwinSnapshot(deps),
    enabled: !!deps.tenantId,
    staleTime: 60_000,
  });

  const rebuild = useMutation({
    mutationFn: () => rebuildGraph(deps),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["digital-twin"] }),
  });

  const baseline = query.data?.baseline ?? emptyBaseline(currency);
  const simulation = useMemo(() => runScenario(baseline, scenario), [baseline, scenario]);

  const patchScenario = (patch: Partial<Scenario>) => setScenario((s) => ({ ...s, ...patch }));
  const resetScenario = () => setScenario(DEFAULT_SCENARIO);

  return {
    loading: query.isLoading,
    refetch: query.refetch,
    baseline,
    graph: query.data?.graph ?? EMPTY_GRAPH,
    stats: query.data?.stats ?? graphStats(EMPTY_GRAPH),
    insights: query.data?.insights ?? graphInsights(EMPTY_GRAPH),
    topProductsGraph: query.data?.topProductsGraph ?? [],
    topCustomersGraph: query.data?.topCustomersGraph ?? [],
    runwayDays: query.data?.runwayDays ?? null,
    concentrationPct: query.data?.concentrationPct ?? 0,
    scenario,
    patchScenario,
    resetScenario,
    simulation,
    rebuild,
  };
}
