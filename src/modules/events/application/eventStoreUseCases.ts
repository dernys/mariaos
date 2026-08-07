// Fase 4 — Casos de uso del event store en shadow mode.
// Los eventos NO escriben estado crítico: solo se observan y se comparan.

import { beginOperation, traceFields } from "@/lib/context/operationContext";
import { logger } from "@/lib/observability";
import {
  EMPTY_SUMMARY,
  divergencesByEventType,
  shadowHealthScore,
  shadowReadiness,
  shadowRunDays,
  type DomainEvent,
  type EventDivergence,
  type ShadowSummary,
} from "../domain/domainEvent";
import type { EventStoreRepository, EventQuery } from "./eventStoreRepository";

export interface EventStoreDeps {
  repo: EventStoreRepository;
  tenantId: string | null;
  userId?: string | null;
}

export interface ShadowSnapshot {
  events: DomainEvent[];
  divergences: EventDivergence[];
  summary: ShadowSummary;
  health: number;
  runDays: number;
  readiness: ReturnType<typeof shadowReadiness>;
  byEventType: ReturnType<typeof divergencesByEventType>;
}

export async function loadShadowSnapshot(
  deps: EventStoreDeps,
  query: Omit<EventQuery, "tenantId"> = {},
): Promise<ShadowSnapshot> {
  if (!deps.tenantId) {
    return {
      events: [],
      divergences: [],
      summary: EMPTY_SUMMARY,
      health: 0,
      runDays: 0,
      readiness: "no_data",
      byEventType: [],
    };
  }

  const [events, divergences, summary] = await Promise.all([
    deps.repo.listEvents({ tenantId: deps.tenantId, ...query }),
    deps.repo.listDivergences(deps.tenantId),
    deps.repo.getShadowSummary(deps.tenantId),
  ]);

  return {
    events,
    divergences,
    summary,
    health: shadowHealthScore(summary),
    runDays: shadowRunDays(summary),
    readiness: shadowReadiness(summary),
    byEventType: divergencesByEventType(divergences),
  };
}

/**
 * Emisión de eventos desde la aplicación (fuente `app`), con correlación.
 * Sigue siendo shadow: no dispara proyecciones ni asientos.
 */
export async function publishShadowEvent(
  deps: EventStoreDeps,
  input: {
    eventType: string;
    aggregateType: string;
    aggregateId: string | null;
    payload?: Record<string, unknown>;
    module?: string;
  },
): Promise<string | null> {
  const ctx = beginOperation({
    module: input.module ?? "events",
    operation: input.eventType,
    tenant_id: deps.tenantId,
    user_id: deps.userId ?? null,
  });

  try {
    const id = await deps.repo.emitEvent({
      tenantId: deps.tenantId,
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payload: input.payload ?? {},
      metadata: traceFields(ctx),
    });
    logger.info("shadow event emitido", { module: "events", operation: input.eventType, event_id: id });
    return id;
  } catch (error) {
    logger.error("shadow event falló", { module: "events", operation: input.eventType, error });
    return null;
  }
}
