import { supabase } from "@/integrations/supabase/client";

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
}) {
  const metadata = {
    ...(params.metadata || {}),
    ...(params.correlation_id ? { correlation_id: params.correlation_id } : {}),
  };
  const { error } = await supabase.from("activity_log").insert({
    entity_type: params.entity_type,
    entity_id: params.entity_id,
    action: params.action,
    description: params.description || null,
    metadata,
    tenant_id: params.tenant_id || null,
    performed_by: params.performed_by || null,
  });
  if (error) {
    // Activity log must never break the calling flow; surface to console only.
    console.warn("logActivity failed", error.message);
  }
}
