// Fase 4 — Capa UI del módulo de eventos: TanStack Query.
// Este directorio NO puede importar supabase-js (regla de eslint).

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import {
  loadShadowSnapshot,
  publishShadowEvent,
  type EventStoreDeps,
} from "../application/eventStoreUseCases";
import { supabaseEventStoreRepository } from "../infrastructure/supabaseEventStoreRepository";

export function useEventStoreDeps(): EventStoreDeps {
  const tenantId = useTenant();
  const { user } = useAuth();
  return useMemo(
    () => ({ repo: supabaseEventStoreRepository, tenantId, userId: user?.id ?? null }),
    [tenantId, user?.id],
  );
}

export function useShadowEvents(filters: { eventType?: string | null; search?: string | null } = {}) {
  const deps = useEventStoreDeps();
  const query = useQuery({
    queryKey: ["domain-events", deps.tenantId, filters.eventType ?? "all", filters.search ?? ""],
    queryFn: () =>
      loadShadowSnapshot(deps, { eventType: filters.eventType ?? null, search: filters.search ?? null }),
    enabled: !!deps.tenantId,
    staleTime: 20_000,
  });

  return {
    ...query,
    events: query.data?.events ?? [],
    divergences: query.data?.divergences ?? [],
    summary: query.data?.summary,
    health: query.data?.health ?? 0,
    runDays: query.data?.runDays ?? 0,
    readiness: query.data?.readiness ?? "no_data",
    byEventType: query.data?.byEventType ?? [],
    loading: query.isLoading,
  };
}

export function usePublishShadowEvent() {
  const deps = useEventStoreDeps();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      eventType: string;
      aggregateType: string;
      aggregateId: string | null;
      payload?: Record<string, unknown>;
      module?: string;
    }) => publishShadowEvent(deps, vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["domain-events"] }),
  });
}
