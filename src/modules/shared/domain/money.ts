// Fase 5 — Value Object `Money` como estándar del dominio.
//
// Regla: ningún importe circula por el dominio como `number` suelto.
// `Money` es inmutable, no permite mezclar monedas y centraliza el redondeo.
// Sin I/O: es dominio puro y se puede testear sin base de datos.

export type CurrencyCode = string;

export interface MoneyJSON {
  amount: number;
  currency: CurrencyCode;
}

/** Decimales por moneda (por defecto 2). */
const CURRENCY_DECIMALS: Record<string, number> = {
  CUP: 2,
  USD: 2,
  EUR: 2,
};

export function decimalsFor(currency: CurrencyCode): number {
  return CURRENCY_DECIMALS[currency.toUpperCase()] ?? 2;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export class CurrencyMismatchError extends Error {
  constructor(a: CurrencyCode, b: CurrencyCode) {
    super(`No se pueden combinar importes en ${a} y ${b} sin conversión explícita`);
    this.name = "CurrencyMismatchError";
  }
}

export class InvalidMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMoneyError";
  }
}

export class Money {
  readonly amount: number;
  readonly currency: CurrencyCode;

  private constructor(amount: number, currency: CurrencyCode) {
    this.amount = amount;
    this.currency = currency;
  }

  static of(amount: number | string | null | undefined, currency: CurrencyCode): Money {
    const value = typeof amount === "string" ? Number(amount) : (amount ?? 0);
    if (!Number.isFinite(value)) throw new InvalidMoneyError("Importe no numérico");
    if (!currency || currency.trim().length < 3) throw new InvalidMoneyError("Moneda inválida");
    const code = currency.trim().toUpperCase();
    return new Money(roundTo(value, decimalsFor(code)), code);
  }

  static zero(currency: CurrencyCode): Money {
    return Money.of(0, currency);
  }

  static fromJSON(json: MoneyJSON): Money {
    return Money.of(json.amount, json.currency);
  }

  private assertSame(other: Money) {
    if (other.currency !== this.currency) throw new CurrencyMismatchError(this.currency, other.currency);
  }

  add(other: Money): Money {
    this.assertSame(other);
    return Money.of(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSame(other);
    return Money.of(this.amount - other.amount, this.currency);
  }

  multiply(factor: number): Money {
    if (!Number.isFinite(factor)) throw new InvalidMoneyError("Factor no numérico");
    return Money.of(this.amount * factor, this.currency);
  }

  /** Aplica un porcentaje (`percent` en puntos: 21 => 21%). */
  percent(percent: number): Money {
    return this.multiply(percent / 100);
  }

  /** Variación relativa: +10 => 110% del importe original. */
  applyChangePct(percent: number): Money {
    return this.multiply(1 + percent / 100);
  }

  negate(): Money {
    return Money.of(-this.amount, this.currency);
  }

  abs(): Money {
    return Money.of(Math.abs(this.amount), this.currency);
  }

  isZero(): boolean {
    return this.amount === 0;
  }

  isNegative(): boolean {
    return this.amount < 0;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount === other.amount;
  }

  compare(other: Money): number {
    this.assertSame(other);
    return this.amount === other.amount ? 0 : this.amount > other.amount ? 1 : -1;
  }

  /** Conversión explícita con tasa declarada (nunca implícita). */
  convertTo(currency: CurrencyCode, rate: number): Money {
    if (!Number.isFinite(rate) || rate <= 0) throw new InvalidMoneyError("Tasa de cambio inválida");
    return Money.of(this.amount * rate, currency);
  }

  /** Reparto sin pérdida de centavos (el resto se asigna a las primeras partes). */
  allocate(weights: number[]): Money[] {
    const totalWeight = weights.reduce((s, w) => s + w, 0);
    if (totalWeight <= 0) throw new InvalidMoneyError("Pesos de reparto inválidos");
    const decimals = decimalsFor(this.currency);
    const factor = 10 ** decimals;
    const totalUnits = Math.round(this.amount * factor);
    const parts = weights.map((w) => Math.floor((totalUnits * w) / totalWeight));
    let remainder = totalUnits - parts.reduce((s, p) => s + p, 0);
    for (let i = 0; remainder > 0; i = (i + 1) % parts.length) {
      parts[i] += 1;
      remainder -= 1;
    }
    return parts.map((p) => Money.of(p / factor, this.currency));
  }

  toJSON(): MoneyJSON {
    return { amount: this.amount, currency: this.currency };
  }

  format(locale = "es-ES"): string {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: this.currency,
        minimumFractionDigits: decimalsFor(this.currency),
      }).format(this.amount);
    } catch {
      return `${this.amount.toFixed(decimalsFor(this.currency))} ${this.currency}`;
    }
  }

  toString(): string {
    return `${this.amount.toFixed(decimalsFor(this.currency))} ${this.currency}`;
  }
}

/** Suma una lista homogénea; devuelve cero en la moneda indicada si está vacía. */
export function sumMoney(items: Money[], currency?: CurrencyCode): Money {
  if (items.length === 0) {
    if (!currency) throw new InvalidMoneyError("Suma vacía sin moneda de referencia");
    return Money.zero(currency);
  }
  return items.reduce((acc, m) => acc.add(m));
}

/** Suma multi-moneda convirtiendo a la moneda base con tasas explícitas. */
export function sumToBase(
  items: Array<{ money: Money; rate: number }>,
  baseCurrency: CurrencyCode,
): Money {
  return items.reduce(
    (acc, { money, rate }) =>
      acc.add(money.currency === baseCurrency ? money : money.convertTo(baseCurrency, rate)),
    Money.zero(baseCurrency),
  );
}
