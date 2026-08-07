import { describe, it, expect } from "vitest";
import {
  journalIsBalanced,
  saleTotals,
  saleIsSettled,
  expectedStock,
  stockMatches,
  isValidMoney,
  toBaseAmount,
  nearlyEqual,
} from "@/lib/finance/invariants";

// Fixtures de los tres tipos de tenant que MarIA OS soporta.
const fixtures = {
  bar: { lines: [{ qty: 3, price: 4.5 }, { qty: 2, price: 2.25 }], taxPct: 0 },
  restaurante: { lines: [{ qty: 1, price: 18.9, discount: 1.9 }, { qty: 4, price: 3.5 }], taxPct: 10 },
  comercio: { lines: [{ qty: 12, price: 149.99 }], taxPct: 5 },
};

describe("invariante contable: Debe = Haber", () => {
  it("acepta un asiento cuadrado", () => {
    expect(journalIsBalanced([{ debit: 120.5 }, { credit: 100.5 }, { credit: 20 }])).toBe(true);
  });
  it("rechaza un asiento descuadrado", () => {
    expect(journalIsBalanced([{ debit: 100 }, { credit: 99 }])).toBe(false);
  });
  it("tolera redondeo de céntimo", () => {
    expect(journalIsBalanced([{ debit: 33.33 }, { debit: 33.33 }, { debit: 33.34 }, { credit: 100 }])).toBe(true);
  });
});

describe("invariante de ventas: líneas − descuentos + impuestos = pagos + crédito", () => {
  it.each(Object.entries(fixtures))("cuadra para el tenant %s", (_name, f) => {
    const t = saleTotals(f.lines, f.taxPct);
    expect(nearlyEqual(t.total, t.subtotal + t.tax)).toBe(true);
    // pago total
    expect(saleIsSettled(t.total, t.total, 0)).toBe(true);
    // pago parcial + crédito
    const paid = Math.round(t.total * 40) / 100;
    expect(saleIsSettled(t.total, paid, t.total - paid)).toBe(true);
  });

  it("aplica descuentos antes del impuesto", () => {
    const t = saleTotals([{ qty: 1, price: 100, discount: 10 }], 10);
    expect(t.subtotal).toBe(90);
    expect(t.tax).toBe(9);
    expect(t.total).toBe(99);
  });

  it("detecta una venta no liquidada", () => {
    const t = saleTotals(fixtures.comercio.lines, fixtures.comercio.taxPct);
    expect(saleIsSettled(t.total, 10, 0)).toBe(false);
  });
});

describe("invariante de inventario: inicial + entradas − salidas + ajustes = actual", () => {
  it("calcula el stock esperado", () => {
    const movs = [
      { type: "in", qty: 100 },
      { type: "out", qty: 30 },
      { type: "adjust", qty: -5 },
      { type: "out", qty: 15 },
    ];
    expect(expectedStock(0, movs)).toBe(50);
    expect(stockMatches(0, movs, 50)).toBe(true);
    expect(stockMatches(0, movs, 49)).toBe(false);
  });

  it("respeta el stock inicial heredado", () => {
    expect(expectedStock(20, [{ type: "out", qty: 5 }])).toBe(15);
  });
});

describe("invariante multi-moneda", () => {
  it("exige importe, moneda y tasa válidos", () => {
    expect(isValidMoney({ amount: 10, currency: "CUP" })).toBe(true);
    expect(isValidMoney({ amount: 10, currency: "USD", exchange_rate: 120 })).toBe(true);
    expect(isValidMoney({ amount: 10 } as any)).toBe(false);
    expect(isValidMoney({ amount: 10, currency: "US" })).toBe(false);
    expect(isValidMoney({ amount: 10, currency: "USD", exchange_rate: 0 })).toBe(false);
    expect(isValidMoney(null)).toBe(false);
  });

  it("convierte a moneda base con la tasa declarada", () => {
    expect(toBaseAmount({ amount: 10, currency: "USD", exchange_rate: 120 })).toBe(1200);
    expect(toBaseAmount({ amount: 250.5, currency: "CUP" })).toBe(250.5);
  });

  it("nunca permite operar sin moneda", () => {
    expect(() => toBaseAmount({ amount: 5 } as any)).toThrow();
  });
});
