// QW6 — Invariantes financieras del dominio (funciones puras, sin I/O).
//
// Estas reglas son la definición ejecutable de "los números cuadran".
// Se usan en tests y podrán reutilizarse en los módulos DDD (Fase 3).

export interface MoneyLike {
  amount: number;
  currency: string;
  exchange_rate?: number;
}

export interface SaleLineLike {
  qty: number;
  price: number;
  discount?: number;
}

export interface JournalLineLike {
  debit?: number;
  credit?: number;
}

export interface StockMovementLike {
  /** in | out | adjust */
  type: string;
  qty: number;
}

/** Tolerancia de redondeo monetario (2 decimales). */
export const EPSILON = 0.005;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function nearlyEqual(a: number, b: number, epsilon = EPSILON): boolean {
  return Math.abs(a - b) <= epsilon;
}

/** Contabilidad: Debe = Haber en el asiento. */
export function journalIsBalanced(lines: JournalLineLike[]): boolean {
  const debit = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const credit = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  return nearlyEqual(round2(debit), round2(credit));
}

/** Ventas: líneas − descuentos + impuestos = pagos + crédito. */
export function saleTotals(lines: SaleLineLike[], taxRatePct: number) {
  const gross = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const discount = lines.reduce((s, l) => s + (l.discount ?? 0), 0);
  const subtotal = round2(gross - discount);
  const tax = round2(subtotal * (taxRatePct / 100));
  return { gross: round2(gross), discount: round2(discount), subtotal, tax, total: round2(subtotal + tax) };
}

export function saleIsSettled(total: number, paid: number, credit: number): boolean {
  return nearlyEqual(round2(total), round2(paid + credit));
}

/** Inventario: inicial + entradas − salidas + ajustes = actual. */
export function expectedStock(opening: number, movements: StockMovementLike[]): number {
  return movements.reduce((stock, m) => {
    if (m.type === "in") return stock + m.qty;
    if (m.type === "out") return stock - m.qty;
    if (m.type === "adjust") return stock + m.qty;
    return stock;
  }, opening);
}

export function stockMatches(opening: number, movements: StockMovementLike[], current: number): boolean {
  return nearlyEqual(expectedStock(opening, movements), current, 1e-6);
}

/** Multi-moneda: toda operación monetaria necesita importe, moneda y tasa válidos. */
export function isValidMoney(m: Partial<MoneyLike> | null | undefined): boolean {
  if (!m) return false;
  if (typeof m.amount !== "number" || !Number.isFinite(m.amount)) return false;
  if (!m.currency || typeof m.currency !== "string" || m.currency.trim().length < 3) return false;
  if (m.exchange_rate !== undefined && (!Number.isFinite(m.exchange_rate) || m.exchange_rate <= 0)) return false;
  return true;
}

/** Suma en moneda base usando la tasa de cambio declarada. */
export function toBaseAmount(m: MoneyLike): number {
  if (!isValidMoney(m)) throw new Error("Operación monetaria sin moneda o tasa válida");
  return round2(m.amount * (m.exchange_rate ?? 1));
}
