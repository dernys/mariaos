// QW2 — Correlation ID / contexto de operación.
//
// Toda operación de negocio transporta:
//   tenant_id · user_id · operation_id · correlation_id · timestamp
//
// - operation_id:   identifica ESTE intento concreto (cambia en cada reintento).
// - correlation_id: identifica la INTENCIÓN del usuario y sobrevive a los
//   reintentos, así que enlaza frontend → RPC → funciones SQL → triggers → auditoría.
// - idempotency_key: derivada del correlation_id, es lo que garantiza que dos
//   envíos de la misma intención produzcan un único efecto financiero (QW1).

export interface OperationContext {
  module: string;
  operation: string;
  tenant_id?: string | null;
  user_id?: string | null;
  operation_id: string;
  correlation_id: string;
  timestamp: string;
}

export function newId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export interface BeginOperationInput {
  module: string;
  operation: string;
  tenant_id?: string | null;
  user_id?: string | null;
  /** Reutiliza el correlation_id de una intención ya iniciada (reintentos). */
  correlationId?: string;
}

export function beginOperation(input: BeginOperationInput): OperationContext {
  return {
    module: input.module,
    operation: input.operation,
    tenant_id: input.tenant_id ?? null,
    user_id: input.user_id ?? null,
    operation_id: newId("op"),
    correlation_id: input.correlationId ?? newId("cid"),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Clave de idempotencia estable para una intención del usuario.
 * Misma intención (mismo correlation_id) => misma clave => un solo efecto.
 */
export function idempotencyKeyFor(ctx: OperationContext): string {
  return `${ctx.operation}:${ctx.correlation_id}`;
}

/** Campos planos, listos para adjuntar a logs o a metadata de auditoría. */
export function traceFields(ctx: OperationContext) {
  return {
    tenant_id: ctx.tenant_id,
    user_id: ctx.user_id,
    module: ctx.module,
    operation: ctx.operation,
    operation_id: ctx.operation_id,
    correlation_id: ctx.correlation_id,
    timestamp: ctx.timestamp,
  };
}
