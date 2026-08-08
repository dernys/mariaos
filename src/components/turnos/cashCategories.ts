export type CashDirection = "in" | "out";

export interface CashCategoryDef {
  value: string;
  label: string;
  direction: CashDirection;
  /** Contrapartida contable a la que se imputa el movimiento */
  account: string;
}

export const CASH_CATEGORIES: CashCategoryDef[] = [
  { value: "bank_withdrawal", label: "Retiro del banco a caja", direction: "in", account: "Bancos" },
  { value: "owner_contribution", label: "Aporte del dueño", direction: "in", account: "Patrimonio" },
  { value: "customer_collection", label: "Cobro de cliente", direction: "in", account: "Cuentas por cobrar" },
  { value: "other_income", label: "Otro ingreso", direction: "in", account: "Otros ingresos" },
  { value: "bank_deposit", label: "Depósito bancario", direction: "out", account: "Bancos" },
  { value: "supplier_payment", label: "Pago a proveedor", direction: "out", account: "Cuentas por pagar" },
  { value: "expense", label: "Gasto operativo", direction: "out", account: "Gastos" },
  { value: "owner_draw", label: "Retiro del dueño", direction: "out", account: "Patrimonio" },
  { value: "other", label: "Otro egreso", direction: "out", account: "Gastos" },
];

export const cashCategoriesFor = (direction: CashDirection) =>
  CASH_CATEGORIES.filter((c) => c.direction === direction);

export const cashCategoryLabel = (value?: string | null) =>
  CASH_CATEGORIES.find((c) => c.value === value)?.label || value || "—";
