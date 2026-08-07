// Fase 4 — Infraestructura: única frontera con Lovable Cloud para el event store.

import { supabase } from "@/integrations/supabase/client";
import {
  EMPTY_SUMMARY,
  type DomainEvent,
  type EventDivergence,
  type ShadowSummary,
} from "../domain/domainEvent";
import type { EventQuery, EventStoreRepository } from "../application/eventStoreRepository";

// `domain_events` y su vista son objetos nuevos: el cliente tipado se regenera
// de forma asíncrona, así que accedemos por nombre.
const db = supabase as unknown as {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

function normalizeEvent(row: any): DomainEvent {
  return {
    id: row.id,
    tenant_id: row.tenant_id ?? null,
    event_type: row.event_type,
    aggregate_type: row.aggregate_type,
    aggregate_id: row.aggregate_id ?? null,
    version: row.version ?? 1,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    correlation_id: row.correlation_id ?? null,
    operation_id: row.operation_id ?? null,
    source: row.source ?? "db_trigger",
    shadow: row.shadow ?? true,
    occurred_at: row.occurred_at,
  };
}

export const supabaseEventStoreRepository: EventStoreRepository = {
  async listEvents(query: EventQuery): Promise<DomainEvent[]> {
    if (!query.tenantId) return [];
    let q = db
      .from("domain_events")
      .select("*")
      .eq("tenant_id", query.tenantId)
      .order("occurred_at", { ascending: false })
      .limit(query.limit ?? 200);

    if (query.eventType) q = q.eq("event_type", query.eventType);
    if (query.search) q = q.or(`correlation_id.ilike.%${query.search}%,aggregate_id.eq.${query.search}`);

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(normalizeEvent);
  },

  async listDivergences(tenantId: string | null): Promise<EventDivergence[]> {
    if (!tenantId) return [];
    const { data, error } = await db
      .from("domain_event_divergences")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("detected_for", { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data ?? []) as EventDivergence[];
  },

  async getShadowSummary(tenantId: string | null): Promise<ShadowSummary> {
    if (!tenantId) return EMPTY_SUMMARY;
    const { data, error } = await db.rpc("domain_events_shadow_summary", { p_tenant_id: tenantId });
    if (error) throw error;
    return { ...EMPTY_SUMMARY, ...(data ?? {}) } as ShadowSummary;
  },

  async emitEvent(input): Promise<string | null> {
    const { data, error } = await db.rpc("emit_domain_event", {
      p_tenant_id: input.tenantId,
      p_event_type: input.eventType,
      p_aggregate_type: input.aggregateType,
      p_aggregate_id: input.aggregateId,
      p_payload: input.payload ?? {},
      p_metadata: input.metadata ?? {},
      p_source: "app",
    });
    if (error) throw error;
    return (data as string) ?? null;
  },
};
