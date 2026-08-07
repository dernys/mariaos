// Fase 4 — Dominio del event store (shadow mode).
// Código puro: sin React, sin acceso a datos.

export const SHADOW_EVENT_TYPES = [
  "sales.completed",
  "purchase.received",
  "inventory.moved",
  "payment.registered",
] as const;

export type ShadowEventType = (typeof SHADOW_EVENT_TYPES)[number];

export interface DomainEvent {
  id: string;
  tenant_id: string | null;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string | null;
  version: number;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  correlation_id: string | null;
  operation_id: string | null;
  source: string;
  shadow: boolean;
  occurred_at: string;
}

export type DivergenceType = "event_without_projection" | "state_without_event";

export interface EventDivergence {
  tenant_id: string | null;
  divergence_type: DivergenceType;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string | null;
  detected_for: string;
  detail: string;
}

export interface ShadowSummary {
  tenant_id: string | null;
  total_events: number;
  since: string | null;
  last_event_at: string | null;
  by_type: Record<string, number>;
  divergences: number;
  divergences_by_type: Record<string, number>;
}

export const EMPTY_SUMMARY: ShadowSummary = {
  tenant_id: null,
  total_events: 0,
  since: null,
  last_event_at: null,
  by_type: {},
  divergences: 0,
  divergences_by_type: {},
};

export const EVENT_LABELS: Record<string, string> = {
  "sales.completed": "Venta completada",
  "purchase.received": "Compra recibida",
  "inventory.moved": "Movimiento de inventario",
  "payment.registered": "Pago registrado",
};

export function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? type;
}

/** Días completos que lleva corriendo el shadow run. */
export function shadowRunDays(summary: ShadowSummary, now: Date = new Date()): number {
  if (!summary.since) return 0;
  const start = new Date(summary.since).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((now.getTime() - start) / 86_400_000));
}

/**
 * Regla de gobierno de la Fase 4: ningún trigger legado se retira hasta que su
 * evento equivalente acumule 14 días sin divergencias.
 */
export const CLEAN_RUN_DAYS_REQUIRED = 14;

export type ShadowReadiness = "no_data" | "diverging" | "observing" | "ready";

export function shadowReadiness(summary: ShadowSummary, now: Date = new Date()): ShadowReadiness {
  if (summary.total_events === 0) return "no_data";
  if (summary.divergences > 0) return "diverging";
  return shadowRunDays(summary, now) >= CLEAN_RUN_DAYS_REQUIRED ? "ready" : "observing";
}

export const READINESS_LABELS: Record<ShadowReadiness, string> = {
  no_data: "Sin eventos aún",
  diverging: "Divergencias detectadas",
  observing: "En observación",
  ready: "Listo para promover",
};

/** Salud del shadow run: 100 = ningún evento divergente. */
export function shadowHealthScore(summary: ShadowSummary): number {
  if (summary.total_events === 0) return 0;
  const ratio = summary.divergences / summary.total_events;
  return Math.max(0, Math.min(100, Math.round((1 - ratio) * 100)));
}

/** Divergencias agrupadas por tipo de evento, ordenadas por severidad. */
export function divergencesByEventType(
  divergences: EventDivergence[],
): Array<{ event_type: string; total: number; without_projection: number; without_event: number }> {
  const map = new Map<string, { event_type: string; total: number; without_projection: number; without_event: number }>();
  for (const d of divergences) {
    const row =
      map.get(d.event_type) ??
      { event_type: d.event_type, total: 0, without_projection: 0, without_event: 0 };
    row.total += 1;
    if (d.divergence_type === "event_without_projection") row.without_projection += 1;
    else row.without_event += 1;
    map.set(d.event_type, row);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/** Monto de negocio contenido en el evento, cuando aplica. */
export function eventAmount(event: DomainEvent): number | null {
  const p = event.payload ?? {};
  const candidates = ["total", "amount", "amount_in_base", "quantity"];
  for (const key of candidates) {
    const value = p[key];
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  }
  return null;
}
