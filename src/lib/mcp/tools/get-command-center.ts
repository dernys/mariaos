import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { assertTenantAccess, dbError, jsonResult } from "./_supabase";

export default defineTool({
  name: "get_command_center",
  title: "Get command center",
  description: "Return a compact operational snapshot with agents, pending decisions, and open risk alerts for one tenant.",
  inputSchema: {
    tenant_id: z.string().describe("Tenant/company ID to summarize."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ tenant_id }, ctx) => {
    const access = await assertTenantAccess(ctx, tenant_id);
    if (!access.ok) return access.error;

    const [agents, decisions, risks] = await Promise.all([
      access.supabase
        .from("ai_agents")
        .select("id, type, name, status, autonomy_level, last_run_at")
        .eq("tenant_id", tenant_id)
        .order("created_at", { ascending: false }),
      access.supabase
        .from("business_decisions")
        .select("id, agent_id, title, status, recommendation, created_at")
        .eq("tenant_id", tenant_id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(10),
      access.supabase
        .from("risk_alerts")
        .select("id, severity, category, title, description, status, created_at")
        .eq("tenant_id", tenant_id)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const firstError = agents.error ?? decisions.error ?? risks.error;
    if (firstError) return dbError(firstError.message);

    const snapshot = {
      tenant_id,
      counts: {
        agents: agents.data?.length ?? 0,
        active_agents: agents.data?.filter((agent) => agent.status === "active").length ?? 0,
        pending_decisions: decisions.data?.length ?? 0,
        open_risks: risks.data?.length ?? 0,
      },
      agents: agents.data ?? [],
      pending_decisions: decisions.data ?? [],
      open_risks: risks.data ?? [],
    };

    return jsonResult(
      `Snapshot ready: ${snapshot.counts.active_agents} active agents, ${snapshot.counts.pending_decisions} pending decisions, ${snapshot.counts.open_risks} open risks.`,
      snapshot,
    );
  },
});