import { supabase } from "@/integrations/supabase/client";
import { getObservabilityContext } from "@/lib/observability";
import { traceFields, type OperationContext } from "@/lib/context/operationContext";

export async function logActivity(params: {
  entity_type: string;
  entity_id: string;
  action: string;
  description?: string;
  metadata?: Record<string, any>;
  tenant_id?: string | null;
  performed_by?: string;
  /** Optional correlation id to link this entry with an AI decision / workflow run. */
  correlation_id?: string;
  /** Optional operation context: its trace fields are merged into metadata. */
  ctx?: OperationContext;
}) {
  const ambient = getObservabilityContext();
  // QW2 — correlación extremo a extremo: si la llamada no trae correlation_id
  // explícito, se hereda del contexto de operación ambiental.
  const correlationId =
    params.correlation_id ?? params.ctx?.correlation_id ?? ambient.correlation_id ?? null;

  const metadata = {
    ...(params.metadata || {}),
    ...(params.ctx ? traceFields(params.ctx) : {}),
    ...(correlationId ? { correlation_id: correlationId } : {}),
    ...(params.ctx?.operation_id ?? ambient.operation_id
      ? { operation_id: params.ctx?.operation_id ?? ambient.operation_id }
      : {}),
  };

  const { error } = await supabase.from("activity_log").insert({
    entity_type: params.entity_type,
    entity_id: params.entity_id,
    action: params.action,
    description: params.description || null,
    metadata,
    tenant_id: params.tenant_id ?? params.ctx?.tenant_id ?? ambient.tenant_id ?? null,
    performed_by: params.performed_by ?? params.ctx?.user_id ?? ambient.user_id ?? null,
  });
  if (error) {
    // Activity log must never break the calling flow; surface to console only.
    console.warn("logActivity failed", error.message);
  }
}
