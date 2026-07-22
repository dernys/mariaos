import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { assertTenantAccess, dbError, jsonResult } from "./_supabase";

export default defineTool({
  name: "list_ai_agents",
  title: "List AI agents",
  description: "List the configured MarIA OS AI agents for one tenant.",
  inputSchema: {
    tenant_id: z.string().describe("Tenant/company ID to inspect."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ tenant_id }, ctx) => {
    const access = await assertTenantAccess(ctx, tenant_id);
    if (!access.ok) return access.error;

    const { data, error } = await access.supabase
      .from("ai_agents")
      .select("id, type, name, description, status, autonomy_level, metrics, last_run_at, updated_at")
      .eq("tenant_id", tenant_id)
      .order("name");

    if (error) return dbError(error.message);

    return jsonResult(`Found ${data?.length ?? 0} agents for this tenant.`, { agents: data ?? [] });
  },
});