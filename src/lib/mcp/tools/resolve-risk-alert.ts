import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { assertTenantAccess, dbError, jsonResult } from "./_supabase";

export default defineTool({
  name: "resolve_risk_alert",
  title: "Resolve risk alert",
  description: "Mark an open MarIA OS risk alert as resolved for a tenant the signed-in user can access.",
  inputSchema: {
    tenant_id: z.string().describe("Tenant/company ID that owns the risk alert."),
    risk_alert_id: z.string().describe("Risk alert ID to resolve."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ tenant_id, risk_alert_id }, ctx) => {
    const access = await assertTenantAccess(ctx, tenant_id);
    if (!access.ok) return access.error;

    const { data, error } = await access.supabase
      .from("risk_alerts")
      .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: ctx.getUserId() })
      .eq("tenant_id", tenant_id)
      .eq("id", risk_alert_id)
      .select("id, title, status, resolved_at, resolved_by")
      .maybeSingle();

    if (error) return dbError(error.message);
    if (!data) return dbError("Risk alert not found or not accessible.");

    return jsonResult("Risk alert resolved.", { risk_alert: data });
  },
});