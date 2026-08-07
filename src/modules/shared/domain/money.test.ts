import { describe, expect, it } from "vitest";
import {
  CurrencyMismatchError,
  InvalidMoneyError,
  Money,
  sumMoney,
  sumToBase,
} from "./money";

describe("Money", () => {
  it("normaliza el importe a los decimales de la moneda", () => {
    expect(Money.of(10.005, "CUP").amount).toBe(10.01);
    expect(Money.of("3.333", "USD").amount).toBe(3.33);
  });

  it("rechaza monedas e importes inválidos", () => {
    expect(() => Money.of(10, "C")).toThrow(InvalidMoneyError);
    expect(() => Money.of(Number.NaN, "CUP")).toThrow(InvalidMoneyError);
  });

  it("suma y resta en la misma moneda", () => {
    const a = Money.of(100.5, "CUP");
    const b = Money.of(49.5, "CUP");
    expect(a.add(b).amount).toBe(150);
    expect(a.subtract(b).amount).toBe(51);
  });

  it("no permite mezclar monedas", () => {
    expect(() => Money.of(10, "CUP").add(Money.of(10, "USD"))).toThrow(CurrencyMismatchError);
  });

  it("aplica porcentajes y variaciones", () => {
    expect(Money.of(200, "CUP").percent(21).amount).toBe(42);
    expect(Money.of(200, "CUP").applyChangePct(-10).amount).toBe(180);
  });

  it("convierte solo con tasa explícita y válida", () => {
    expect(Money.of(10, "USD").convertTo("CUP", 320).amount).toBe(3200);
    expect(() => Money.of(10, "USD").convertTo("CUP", 0)).toThrow(InvalidMoneyError);
  });

  it("reparte sin perder centavos", () => {
    const parts = Money.of(100, "CUP").allocate([1, 1, 1]);
    expect(parts.map((p) => p.amount)).toEqual([33.34, 33.33, 33.33]);
    expect(sumMoney(parts).amount).toBe(100);
  });

  it("es inmutable", () => {
    const a = Money.of(10, "CUP");
    a.add(Money.of(5, "CUP"));
    expect(a.amount).toBe(10);
  });

  it("suma multi-moneda a la moneda base con tasas declaradas", () => {
    const total = sumToBase(
      [
        { money: Money.of(100, "CUP"), rate: 1 },
        { money: Money.of(1, "USD"), rate: 320 },
        { money: Money.of(1, "EUR"), rate: 350 },
      ],
      "CUP",
    );
    expect(total.amount).toBe(770);
  });

  it("suma vacía requiere moneda de referencia", () => {
    expect(sumMoney([], "USD").amount).toBe(0);
    expect(() => sumMoney([])).toThrow(InvalidMoneyError);
  });

  it("formatea con la moneda", () => {
    expect(Money.of(1234.5, "USD").toString()).toBe("1234.50 USD");
  });
});
