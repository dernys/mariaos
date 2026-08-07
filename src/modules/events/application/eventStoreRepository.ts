// Fase 4 — Puerto del event store. La UI y los casos de uso solo conocen esta interfaz.

import type { DomainEvent, EventDivergence, ShadowSummary } from "../domain/domainEvent";

export interface EventQuery {
  tenantId: string | null;
  eventType?: string | null;
  search?: string | null;
  limit?: number;
}

export interface EventStoreRepository {
  listEvents(query: EventQuery): Promise<DomainEvent[]>;
  listDivergences(tenantId: string | null): Promise<EventDivergence[]>;
  getShadowSummary(tenantId: string | null): Promise<ShadowSummary>;
  emitEvent(input: {
    tenantId: string | null;
    eventType: string;
    aggregateType: string;
    aggregateId: string | null;
    payload?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<string | null>;
}
