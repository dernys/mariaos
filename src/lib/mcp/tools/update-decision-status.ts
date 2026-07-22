import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { assertTenantAccess, dbError, jsonResult } from "./_supabase";

export default defineTool({
  name: "update_decision_status",
  title: "Update decision status",
  description: "Approve, reject, or reset a pending MarIA OS business decision for a tenant the signed-in user can access.",
  inputSchema: {
    tenant_id: z.string().describe("Tenant/company ID that owns the decision."),
    decision_id: z.string().describe("Business decision ID to update."),
    status: z.enum(["approved", "rejected", "pending"]).describe("New decision status."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ tenant_id, decision_id, status }, ctx) => {
    const access = await assertTenantAccess(ctx, tenant_id);
    if (!access.ok) return access.error;

    const { data, error } = await access.supabase
      .from("business_decisions")
      .update({ status })
      .eq("tenant_id", tenant_id)
      .eq("id", decision_id)
      .select("id, title, status, updated_at")
      .maybeSingle();

    if (error) return dbError(error.message);
    if (!data) return dbError("Decision not found or not accessible.");

    return jsonResult(`Decision updated to ${status}.`, { decision: data });
  },
});