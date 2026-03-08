import { supabase } from "@/integrations/supabase/client";

export async function logActivity(params: {
  entity_type: string;
  entity_id: string;
  action: string;
  description?: string;
  metadata?: Record<string, any>;
  tenant_id?: string | null;
  performed_by?: string;
}) {
  await supabase.from("activity_log").insert({
    entity_type: params.entity_type,
    entity_id: params.entity_id,
    action: params.action,
    description: params.description || null,
    metadata: params.metadata || {},
    tenant_id: params.tenant_id || null,
    performed_by: params.performed_by || null,
  });
}
