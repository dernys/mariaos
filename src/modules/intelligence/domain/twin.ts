// Fase 5 — Dominio puro del gemelo digital: motor de simulación sobre la línea base real.
// Sin I/O. Todos los importes se manipulan con el value object `Money`.

import { Money, sumMoney } from "@/modules/shared/domain/money";

export interface TwinBaseline {
  windowDays: number;
  revenue: Money;
  cogs: Money;
  orders: number;
  units: number;
  avgDailyRevenue: Money;
  avgTicket: Money;
  grossMarginPct: number;
  monthlyPayroll: Money;
  cash: Money;
  topProducts: Array<{ productId: string | null; name: string; revenue: Money; units: number }>;
  computedAt: string | null;
}

export interface Scenario {
  /** Variación de precio de venta en % */
  priceChangePct: number;
  /** Variación de coste unitario en % */
  costChangePct: number;
  /** Variación de demanda (unidades) en % */
  demandChangePct: number;
  /** Variación de gastos fijos (nómina y estructura) en % */
  fixedCostChangePct: number;
  /** Horizonte de proyección en días */
  horizonDays: number;
}

export const DEFAULT_SCENARIO: Scenario = {
  priceChangePct: 0,
  costChangePct: 0,
  demandChangePct: 0,
  fixedCostChangePct: 0,
  horizonDays: 30,
};

export interface SimulationResult {
  currency: string;
  horizonDays: number;
  baseRevenue: Money;
  baseCogs: Money;
  baseFixedCosts: Money;
  baseProfit: Money;
  projRevenue: Money;
  projCogs: Money;
  projFixedCosts: Money;
  projProfit: Money;
  profitDelta: Money;
  profitDeltaPct: number;
  projMarginPct: number;
  projCash: Money;
  /** Unidades diarias necesarias para cubrir costes fijos en el escenario. */
  breakevenDailyUnits: number | null;
  verdict: "improves" | "neutral" | "worsens";
}

export function emptyBaseline(currency = "CUP"): TwinBaseline {
  return {
    windowDays: 30,
    revenue: Money.zero(currency),
    cogs: Money.zero(currency),
    orders: 0,
    units: 0,
    avgDailyRevenue: Money.zero(currency),
    avgTicket: Money.zero(currency),
    grossMarginPct: 0,
    monthlyPayroll: Money.zero(currency),
    cash: Money.zero(currency),
    topProducts: [],
    computedAt: null,
  };
}

function scaleToHorizon(m: Money, windowDays: number, horizonDays: number): Money {
  if (windowDays <= 0) return Money.zero(m.currency);
  return m.multiply(horizonDays / windowDays);
}

/**
 * Proyecta ingresos, costes y utilidad al horizonte solicitado.
 * Ingresos escalan con precio y demanda; COGS con coste y demanda;
 * los costes fijos (nómina) se prorratean del mes al horizonte.
 */
export function simulate(baseline: TwinBaseline, scenario: Scenario): SimulationResult {
  const currency = baseline.revenue.currency;
  const horizon = Math.max(1, Math.round(scenario.horizonDays));
  const window = Math.max(1, baseline.windowDays);

  const baseRevenue = scaleToHorizon(baseline.revenue, window, horizon);
  const baseCogs = scaleToHorizon(baseline.cogs, window, horizon);
  const baseFixedCosts = baseline.monthlyPayroll.multiply(horizon / 30);
  const baseProfit = baseRevenue.subtract(baseCogs).subtract(baseFixedCosts);

  const demandFactor = 1 + scenario.demandChangePct / 100;
  const projRevenue = baseRevenue
    .applyChangePct(scenario.priceChangePct)
    .multiply(demandFactor);
  const projCogs = baseCogs.applyChangePct(scenario.costChangePct).multiply(demandFactor);
  const projFixedCosts = baseFixedCosts.applyChangePct(scenario.fixedCostChangePct);
  const projProfit = projRevenue.subtract(projCogs).subtract(projFixedCosts);

  const profitDelta = projProfit.subtract(baseProfit);
  const denominator = Math.abs(baseProfit.amount);
  const profitDeltaPct = denominator > 0 ? (profitDelta.amount / denominator) * 100 : 0;
  const projMarginPct =
    projRevenue.amount > 0
      ? ((projRevenue.amount - projCogs.amount) / projRevenue.amount) * 100
      : 0;

  const projUnits = baseline.units * (horizon / window) * demandFactor;
  const unitContribution =
    projUnits > 0 ? (projRevenue.amount - projCogs.amount) / projUnits : 0;
  const breakevenDailyUnits =
    unitContribution > 0 ? projFixedCosts.amount / unitContribution / horizon : null;

  const verdict: SimulationResult["verdict"] =
    Math.abs(profitDelta.amount) < 0.01 ? "neutral" : profitDelta.amount > 0 ? "improves" : "worsens";

  return {
    currency,
    horizonDays: horizon,
    baseRevenue,
    baseCogs,
    baseFixedCosts,
    baseProfit,
    projRevenue,
    projCogs,
    projFixedCosts,
    projProfit,
    profitDelta,
    profitDeltaPct: Math.round(profitDeltaPct * 100) / 100,
    projMarginPct: Math.round(projMarginPct * 100) / 100,
    projCash: baseline.cash.add(projProfit),
    breakevenDailyUnits:
      breakevenDailyUnits === null ? null : Math.round(breakevenDailyUnits * 100) / 100,
    verdict,
  };
}

/** Días de caja que resisten los costes fijos proyectados sin ingresos. */
export function cashRunwayDays(baseline: TwinBaseline): number | null {
  const dailyFixed = baseline.monthlyPayroll.amount / 30;
  if (dailyFixed <= 0) return null;
  return Math.round((baseline.cash.amount / dailyFixed) * 10) / 10;
}

/** Concentración de ingresos en el top de productos (riesgo de dependencia). */
export function revenueConcentrationPct(baseline: TwinBaseline): number {
  if (baseline.revenue.amount <= 0 || baseline.topProducts.length === 0) return 0;
  const top = sumMoney(
    baseline.topProducts.map((p) => p.revenue),
    baseline.revenue.currency,
  );
  return Math.round((top.amount / baseline.revenue.amount) * 10000) / 100;
}
