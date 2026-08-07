// QW1/QW2 — Frontera única para invocar operaciones financieras.
//
// Toda operación financiera desde la UI debe pasar por aquí para garantizar:
//  - idempotencia (una intención = un efecto financiero),
//  - trazabilidad (correlation_id de extremo a extremo),
//  - observabilidad (éxito/fallo con contexto).
//
// El correlation_id se crea al abrir el diálogo/intención, NO en cada clic,
// de modo que un doble clic o un reintento reutiliza la misma clave.

import { supabase } from "@/integrations/supabase/client";
import { beginOperation, idempotencyKeyFor, traceFields, type OperationContext } from "@/lib/context/operationContext";
import { observability } from "@/lib/observability";

export interface FinancialCallResult<T> {
  data: T | null;
  error: string | null;
  ctx: OperationContext;
}

/**
 * Invoca un RPC financiero con clave de idempotencia derivada del contexto.
 * `args` son los parámetros propios del RPC; la clave y la correlación se añaden aquí.
 */
export async function callFinancialRpc<T = unknown>(
  fn: string,
  args: Record<string, unknown>,
  ctx: OperationContext,
): Promise<FinancialCallResult<T>> {
  const payload = {
    ...args,
    p_idempotency_key: idempotencyKeyFor(ctx),
    p_correlation_id: ctx.correlation_id,
  };

  observability.info(`rpc:${fn} start`, traceFields(ctx));

  const { data, error } = await (supabase.rpc as any)(fn, payload);

  if (error) {
    observability.error(`rpc:${fn} failed`, { ...traceFields(ctx), db_error: error.message });
    return { data: null, error: error.message, ctx };
  }

  observability.info(`rpc:${fn} ok`, { ...traceFields(ctx), result: data ?? null });
  return { data: data as T, error: null, ctx };
}

/** Abre una intención de venta rápida (un correlation_id por intención). */
export function beginSaleIntent(tenantId: string | null, userId?: string | null) {
  return beginOperation({ module: "sales", operation: "create_quick_sale", tenant_id: tenantId, user_id: userId });
}

export function beginPaymentIntent(tenantId: string | null, userId?: string | null) {
  return beginOperation({ module: "finance", operation: "register_account_payment", tenant_id: tenantId, user_id: userId });
}

export function beginPurchaseReceiptIntent(tenantId: string | null, userId?: string | null) {
  return beginOperation({ module: "purchasing", operation: "receive_purchase", tenant_id: tenantId, user_id: userId });
}
