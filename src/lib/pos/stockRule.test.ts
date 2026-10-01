import { describe, it, expect } from "vitest";
import { availableStock } from "./stockRule";

describe("POS availableStock", () => {
  it("tienda sin fila en product_stock => 0 (no cae al total global)", () => {
    expect(availableStock({ hasRecipe: false, storeScoped: true, locationStock: undefined, globalStock: 50 })).toBe(0);
  });
  it("usa la existencia de la tienda cuando hay fila", () => {
    expect(availableStock({ hasRecipe: false, storeScoped: true, locationStock: 3, globalStock: 50 })).toBe(3);
  });
  it("receta => sin límite", () => {
    expect(availableStock({ hasRecipe: true, storeScoped: true, locationStock: 0, globalStock: 0 })).toBeNull();
  });
  it("sin tienda => total del producto", () => {
    expect(availableStock({ hasRecipe: false, storeScoped: false, locationStock: undefined, globalStock: 7 })).toBe(7);
  });
});
