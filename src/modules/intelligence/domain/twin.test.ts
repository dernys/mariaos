import { describe, expect, it } from "vitest";
import { Money } from "@/modules/shared/domain/money";
import {
  DEFAULT_SCENARIO,
  cashRunwayDays,
  emptyBaseline,
  revenueConcentrationPct,
  simulate,
  type TwinBaseline,
} from "./twin";
import { graphInsights, graphStats, neighbors, topNodes, type KnowledgeGraph } from "./knowledgeGraph";

function baseline(overrides: Partial<TwinBaseline> = {}): TwinBaseline {
  return {
    ...emptyBaseline("CUP"),
    windowDays: 30,
    revenue: Money.of(30000, "CUP"),
    cogs: Money.of(12000, "CUP"),
    orders: 300,
    units: 900,
    avgDailyRevenue: Money.of(1000, "CUP"),
    avgTicket: Money.of(100, "CUP"),
    grossMarginPct: 60,
    monthlyPayroll: Money.of(6000, "CUP"),
    cash: Money.of(15000, "CUP"),
    topProducts: [
      { productId: "p1", name: "A", revenue: Money.of(12000, "CUP"), units: 200 },
      { productId: "p2", name: "B", revenue: Money.of(6000, "CUP"), units: 150 },
    ],
    computedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("simulate", () => {
  it("escenario neutro reproduce la línea base", () => {
    const r = simulate(baseline(), DEFAULT_SCENARIO);
    expect(r.projRevenue.amount).toBe(30000);
    expect(r.projCogs.amount).toBe(12000);
    expect(r.projFixedCosts.amount).toBe(6000);
    expect(r.baseProfit.amount).toBe(12000);
    expect(r.profitDelta.amount).toBe(0);
    expect(r.verdict).toBe("neutral");
  });

  it("subida de precio sin caída de demanda mejora la utilidad", () => {
    const r = simulate(baseline(), { ...DEFAULT_SCENARIO, priceChangePct: 10 });
    expect(r.projRevenue.amount).toBe(33000);
    expect(r.projProfit.amount).toBe(15000);
    expect(r.verdict).toBe("improves");
  });

  it("subida de coste con caída de demanda empeora la utilidad", () => {
    const r = simulate(baseline(), {
      ...DEFAULT_SCENARIO,
      costChangePct: 20,
      demandChangePct: -15,
    });
    expect(r.verdict).toBe("worsens");
    expect(r.profitDelta.isNegative()).toBe(true);
  });

  it("escala al horizonte solicitado", () => {
    const r = simulate(baseline(), { ...DEFAULT_SCENARIO, horizonDays: 90 });
    expect(r.projRevenue.amount).toBe(90000);
    expect(r.projFixedCosts.amount).toBe(18000);
  });

  it("mantiene la moneda del dominio", () => {
    const r = simulate(baseline(), DEFAULT_SCENARIO);
    expect(r.currency).toBe("CUP");
    expect(r.projCash.currency).toBe("CUP");
  });

  it("calcula punto de equilibrio en unidades diarias", () => {
    const r = simulate(baseline(), DEFAULT_SCENARIO);
    expect(r.breakevenDailyUnits).toBeGreaterThan(0);
  });

  it("no rompe con línea base vacía", () => {
    const r = simulate(emptyBaseline("USD"), DEFAULT_SCENARIO);
    expect(r.projProfit.amount).toBe(0);
    expect(r.breakevenDailyUnits).toBeNull();
  });
});

describe("señales del gemelo", () => {
  it("runway de caja según costes fijos", () => {
    expect(cashRunwayDays(baseline())).toBe(75);
    expect(cashRunwayDays(emptyBaseline("CUP"))).toBeNull();
  });

  it("concentración de ingresos del top de productos", () => {
    expect(revenueConcentrationPct(baseline())).toBe(60);
    expect(revenueConcentrationPct(emptyBaseline("CUP"))).toBe(0);
  });
});

const graph: KnowledgeGraph = {
  nodes: [
    { id: "n1", type: "product", key: "p1", label: "Ron", attributes: {}, importance: 30 },
    { id: "n2", type: "product", key: "p2", label: "Cola", attributes: {}, importance: 10 },
    { id: "n3", type: "supplier", key: "s1", label: "Distribuidora", attributes: {}, importance: 40 },
    { id: "n4", type: "customer", key: "c1", label: "Cliente A", attributes: {}, importance: 20 },
    { id: "n5", type: "store", key: "st1", label: "Tienda", attributes: {}, importance: 0 },
  ],
  edges: [
    { id: "e1", srcId: "n3", dstId: "n1", relation: "supplies", weight: 100, attributes: { amount: 1000 } },
    { id: "e2", srcId: "n4", dstId: "n1", relation: "bought", weight: 5, attributes: { amount: 500 } },
  ],
};

describe("grafo de conocimiento", () => {
  it("estadísticas y nodos aislados", () => {
    const s = graphStats(graph);
    expect(s.nodeCount).toBe(5);
    expect(s.edgeCount).toBe(2);
    expect(s.isolatedNodes).toBe(2); // n2 y n5
    expect(s.byType.find((t) => t.type === "product")?.count).toBe(2);
  });

  it("nodos más influyentes por tipo", () => {
    expect(topNodes(graph, "product", 1)[0].label).toBe("Ron");
  });

  it("vecinos con dirección y peso", () => {
    const n = neighbors(graph, "n1");
    expect(n).toHaveLength(2);
    expect(n[0].direction).toBe("in");
  });

  it("detecta dependencia de proveedor y concentración de cliente", () => {
    const codes = graphInsights(graph).map((i) => i.code);
    expect(codes).toContain("KG-002");
    expect(codes).toContain("KG-003");
    expect(codes).toContain("KG-001");
  });

  it("grafo vacío devuelve señal informativa", () => {
    expect(graphInsights({ nodes: [], edges: [] })[0].code).toBe("KG-000");
  });
});
