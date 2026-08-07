import { describe, expect, it } from "vitest";
import {
  CLEAN_RUN_DAYS_REQUIRED,
  EMPTY_SUMMARY,
  divergencesByEventType,
  eventAmount,
  eventLabel,
  shadowHealthScore,
  shadowReadiness,
  shadowRunDays,
  type DomainEvent,
  type EventDivergence,
  type ShadowSummary,
} from "./domainEvent";

const summary = (over: Partial<ShadowSummary> = {}): ShadowSummary => ({ ...EMPTY_SUMMARY, ...over });

const event = (over: Partial<DomainEvent> = {}): DomainEvent => ({
  id: "e1",
  tenant_id: "t1",
  event_type: "sales.completed",
  aggregate_type: "sale",
  aggregate_id: "s1",
  version: 1,
  payload: {},
  metadata: {},
  correlation_id: null,
  operation_id: null,
  source: "db_trigger",
  shadow: true,
  occurred_at: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("shadowRunDays", () => {
  it("es 0 sin eventos", () => {
    expect(shadowRunDays(summary())).toBe(0);
  });

  it("cuenta días completos desde el primer evento", () => {
    const s = summary({ total_events: 3, since: "2026-01-01T00:00:00.000Z" });
    expect(shadowRunDays(s, new Date("2026-01-11T00:00:00.000Z"))).toBe(10);
  });
});

describe("shadowReadiness", () => {
  it("sin eventos => no_data", () => {
    expect(shadowReadiness(summary())).toBe("no_data");
  });

  it("con divergencias => diverging aunque haya pasado el plazo", () => {
    const s = summary({ total_events: 10, divergences: 1, since: "2026-01-01T00:00:00.000Z" });
    expect(shadowReadiness(s, new Date("2026-03-01T00:00:00.000Z"))).toBe("diverging");
  });

  it("limpio pero antes del plazo => observing", () => {
    const s = summary({ total_events: 10, since: "2026-01-01T00:00:00.000Z" });
    expect(shadowReadiness(s, new Date("2026-01-05T00:00:00.000Z"))).toBe("observing");
  });

  it("limpio y con el plazo cumplido => ready", () => {
    const s = summary({ total_events: 10, since: "2026-01-01T00:00:00.000Z" });
    const now = new Date(Date.parse(s.since!) + CLEAN_RUN_DAYS_REQUIRED * 86_400_000);
    expect(shadowReadiness(s, now)).toBe("ready");
  });
});

describe("shadowHealthScore", () => {
  it("0 sin eventos", () => expect(shadowHealthScore(summary())).toBe(0));
  it("100 sin divergencias", () =>
    expect(shadowHealthScore(summary({ total_events: 50 }))).toBe(100));
  it("proporcional a las divergencias", () =>
    expect(shadowHealthScore(summary({ total_events: 100, divergences: 25 }))).toBe(75));
});

describe("divergencesByEventType", () => {
  it("agrupa y ordena por total", () => {
    const rows: EventDivergence[] = [
      { tenant_id: "t1", divergence_type: "event_without_projection", event_type: "sales.completed", aggregate_type: "sale", aggregate_id: "a", detected_for: "x", detail: "" },
      { tenant_id: "t1", divergence_type: "state_without_event", event_type: "sales.completed", aggregate_type: "sale", aggregate_id: "b", detected_for: "x", detail: "" },
      { tenant_id: "t1", divergence_type: "state_without_event", event_type: "inventory.moved", aggregate_type: "inventory_movement", aggregate_id: "c", detected_for: "x", detail: "" },
    ];
    const grouped = divergencesByEventType(rows);
    expect(grouped[0]).toEqual({
      event_type: "sales.completed",
      total: 2,
      without_projection: 1,
      without_event: 1,
    });
    expect(grouped[1].event_type).toBe("inventory.moved");
  });
});

describe("eventAmount / eventLabel", () => {
  it("lee el total de una venta", () => {
    expect(eventAmount(event({ payload: { total: 1500.5 } }))).toBe(1500.5);
  });
  it("acepta numeric serializado como texto", () => {
    expect(eventAmount(event({ payload: { amount: "42.00" } }))).toBe(42);
  });
  it("devuelve null si no hay monto", () => {
    expect(eventAmount(event({ payload: { note: "x" } }))).toBeNull();
  });
  it("traduce tipos conocidos y respeta desconocidos", () => {
    expect(eventLabel("sales.completed")).toBe("Venta completada");
    expect(eventLabel("custom.thing")).toBe("custom.thing");
  });
});
