import { describe, expect, it } from "vitest";
import {
  inventoryStats,
  inventoryValue,
  normalizeProductDraft,
  planMovement,
  stockStatus,
  validateProductDraft,
  type Product,
  type ProductDraft,
} from "./product";

const p = (over: Partial<Product>): Product => ({
  id: "1", name: "X", sku: "X1", description: null, category: null,
  price: 10, cost: 5, stock: 10, min_stock: 2, warehouse_id: null, is_active: true,
  ...over,
});

const draft = (over: Partial<ProductDraft> = {}): ProductDraft => ({
  name: "  Ron  ", sku: " R-1 ", price: 100, cost: 60, stock: 5, min_stock: 1, ...over,
});

describe("stock status", () => {
  it("clasifica agotado, bajo y disponible", () => {
    expect(stockStatus(0, 3)).toBe("outOfStock");
    expect(stockStatus(3, 3)).toBe("lowStock");
    expect(stockStatus(4, 3)).toBe("inStock");
  });
});

describe("valor e indicadores", () => {
  it("valora el inventario a costo", () => {
    expect(inventoryValue([{ stock: 2, cost: 50 }, { stock: 3, cost: 10 }])).toBe(130);
  });

  it("resume total, agotados, bajos y valor", () => {
    const stats = inventoryStats([p({ id: "a", stock: 0 }), p({ id: "b", stock: 2, min_stock: 2 }), p({ id: "c", stock: 9 })]);
    expect(stats).toEqual({ total: 3, out: 1, low: 1, value: 55 });
  });
});

describe("planMovement (invariantes de inventario)", () => {
  it("rechaza cantidades no positivas", () => {
    expect(planMovement({ type: "entry", quantity: 0, currentStock: 5 }).error).toBe("qtyGtZero");
  });

  it("suma en entradas", () => {
    expect(planMovement({ type: "entry", quantity: 4, currentStock: 5 })).toMatchObject({ ok: true, newStock: 9, delta: 4 });
  });

  it("resta en salidas", () => {
    expect(planMovement({ type: "exit", quantity: 4, currentStock: 5 })).toMatchObject({ ok: true, newStock: 1, delta: -4 });
  });

  it("nunca permite stock negativo", () => {
    expect(planMovement({ type: "exit", quantity: 9, currentStock: 5 }).error).toBe("notEnoughStock");
  });
});

describe("borrador de producto", () => {
  it("exige nombre y sku", () => {
    expect(validateProductDraft(draft({ name: " " }))).toBe("nameSkuRequired");
  });

  it("rechaza importes negativos", () => {
    expect(validateProductDraft(normalizeProductDraft(draft({ cost: -1 })))).toBe("negativeAmounts");
  });

  it("normaliza espacios y stock online", () => {
    const n = normalizeProductDraft(draft({ is_online: false, online_stock: 7 }));
    expect(n.name).toBe("Ron");
    expect(n.sku).toBe("R-1");
    expect(n.online_stock).toBe(0);
    expect(n.is_deliverable).toBe(true);
    expect(validateProductDraft(n)).toBeNull();
  });
});
