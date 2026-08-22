// P1 Payment Core — catálogo canónico de medios de pago (Cuba).
// La normalización real vive en la base de datos (payment_method_norm);
// aquí solo se envían códigos ya explícitos y se etiquetan para la UI.

export type PaymentMethodCode =
  | "CASH"
  | "BANK_TRANSFER"
  | "TRANSFERMOVIL"
  | "ENZONA"
  | "CARD_POS"
  | "CREDIT";

export type PaymentMethodClass = "cash" | "bank" | "digital" | "credit";

export type PaymentStatus =
  | "CREATED"
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED"
  | "REVERSED";

export interface PaymentMethodDef {
  code: PaymentMethodCode;
  label: string;
  cls: PaymentMethodClass;
  /** El cobro no puede darse por bueno desde el frontend. */
  requiresConfirmation: boolean;
  /** Exige número de referencia al registrarlo. */
  requiresReference: boolean;
  /** Muestra QR de cobro en el POS. */
  showsQr: boolean;
}

/** Medios seleccionables en el POS (CREDIT se expresa con el saldo fiado). */
export const PAYMENT_METHODS: PaymentMethodDef[] = [
  { code: "CASH", label: "Efectivo", cls: "cash", requiresConfirmation: false, requiresReference: false, showsQr: false },
  { code: "CARD_POS", label: "Tarjeta / POS", cls: "bank", requiresConfirmation: false, requiresReference: false, showsQr: false },
  { code: "TRANSFERMOVIL", label: "Transfermóvil", cls: "digital", requiresConfirmation: true, requiresReference: false, showsQr: true },
  { code: "ENZONA", label: "EnZona", cls: "digital", requiresConfirmation: true, requiresReference: false, showsQr: true },
  { code: "BANK_TRANSFER", label: "Transferencia bancaria", cls: "bank", requiresConfirmation: true, requiresReference: true, showsQr: false },
];

const LEGACY: Record<string, PaymentMethodCode> = {
  cash: "CASH",
  efectivo: "CASH",
  card: "CARD_POS",
  pos: "CARD_POS",
  tarjeta: "CARD_POS",
  qr: "TRANSFERMOVIL",
  transfer: "BANK_TRANSFER",
  transferencia: "BANK_TRANSFER",
  credit: "CREDIT",
  fiado: "CREDIT",
};

export function normalizeMethod(method?: string | null): PaymentMethodCode {
  if (!method) return "CASH";
  const upper = method.toUpperCase();
  if (PAYMENT_METHODS.some((m) => m.code === upper) || upper === "CREDIT") return upper as PaymentMethodCode;
  return LEGACY[method.toLowerCase()] ?? (upper as PaymentMethodCode);
}

export function methodDef(method?: string | null): PaymentMethodDef | undefined {
  return PAYMENT_METHODS.find((m) => m.code === normalizeMethod(method));
}

export function methodLabel(method?: string | null): string {
  const code = normalizeMethod(method);
  if (code === "CREDIT") return "Crédito / Fiado";
  return methodDef(code)?.label ?? code;
}

export function methodClass(method?: string | null): PaymentMethodClass {
  const code = normalizeMethod(method);
  if (code === "CREDIT") return "credit";
  return methodDef(code)?.cls ?? "bank";
}

export function requiresConfirmation(method?: string | null): boolean {
  return !!methodDef(method)?.requiresConfirmation;
}

export function isCashMethod(method?: string | null): boolean {
  return methodClass(method) === "cash";
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  CREATED: "Creado",
  PENDING: "Pendiente de confirmar",
  PAID: "Cobrado",
  FAILED: "Fallido",
  CANCELLED: "Cancelado",
  REFUNDED: "Reembolsado",
  REVERSED: "Revertido",
};

export function statusTone(status?: string | null): "success" | "warning" | "destructive" | "muted" {
  switch ((status || "").toUpperCase()) {
    case "PAID":
      return "success";
    case "PENDING":
    case "CREATED":
      return "warning";
    case "FAILED":
    case "CANCELLED":
      return "destructive";
    default:
      return "muted";
  }
}
