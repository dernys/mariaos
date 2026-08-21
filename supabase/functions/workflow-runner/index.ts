// MarIA OS - Workflow runner
// Processes unprocessed rows from public.business_events and triggers matching
// workflows for that tenant.
//
// Auth modes:
//  1) Cron / superadmin: x-runner-secret header == WORKFLOW_RUNNER_SECRET, or
//     a valid superadmin JWT. Processes ALL tenants' pending events.
//  2) Tenant user JWT: processes only events for tenants the user belongs to.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-runner-secret, x-correlation-id",
};

const MAX_EVENTS = 200;

function eventMatchesTrigger(ev: any, trigger: any): boolean {
  if (!trigger || typeof trigger !== "object") return false;
  const t = trigger.event_type ?? trigger.type ?? "*";
  if (t !== "*" && t !== ev.event_type) return false;
  if (trigger.source && trigger.source !== "*" && trigger.source !== ev.source) return false;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const runnerSecret = Deno.env.get("WORKFLOW_RUNNER_SECRET") ?? "";

    const providedSecret = req.headers.get("x-runner-secret") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";

    let mode: "global" | "user" | null = null;
    let allowedTenantIds: string[] | null = null; // null = no scope (global)

    const admin = createClient(supabaseUrl, serviceKey);

    if (runnerSecret && providedSecret === runnerSecret) {
      mode = "global";
    } else if (authHeader.startsWith("Bearer ")) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userRes } = await userClient.auth.getUser();
      if (userRes?.user) {
        const userId = userRes.user.id;
        const { data: sa } = await admin.from("superadmins").select("user_id").eq("user_id", userId).maybeSingle();
        if (sa) {
          // El superadmin opera SOLO sobre su negocio activo (o global si lo activó)
          const { data: ctx } = await admin.from("superadmin_context").select("tenant_id, mode").eq("user_id", userId).maybeSingle();
          if (ctx?.mode === "global") {
            mode = "global";
          } else if (ctx?.tenant_id) {
            allowedTenantIds = [ctx.tenant_id];
            mode = "user";
          }
        } else {
          const { data: memberships } = await admin
            .from("tenant_users")
            .select("tenant_id")
            .eq("user_id", userId);
          allowedTenantIds = (memberships ?? []).map((m: any) => m.tenant_id);
          if (allowedTenantIds.length > 0) mode = "user";
        }
      }
    }

    if (!mode) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Pull a batch of unprocessed events, scoped by mode
    let query = admin
      .from("business_events")
      .select("*")
      .eq("processed", false)
      .order("created_at", { ascending: true })
      .limit(MAX_EVENTS);

    if (mode === "user" && allowedTenantIds) {
      query = query.in("tenant_id", allowedTenantIds);
    }

    const { data: events, error: evErr } = await query;
    if (evErr) throw evErr;

    const processedIds: string[] = [];
    const triggered: Array<{ event_id: string; workflow_id: string }> = [];

    const byTenant = new Map<string, any[]>();
    (events ?? []).forEach((e: any) => {
      const arr = byTenant.get(e.tenant_id) ?? [];
      arr.push(e);
      byTenant.set(e.tenant_id, arr);
    });

    for (const [tenantId, evs] of byTenant.entries()) {
      const { data: workflows } = await admin
        .from("workflows")
        .select("id, name, trigger, definition, run_count")
        .eq("tenant_id", tenantId)
        .eq("enabled", true);

      const wfs = workflows ?? [];

      for (const ev of evs) {
        const matched = wfs.filter((w: any) => eventMatchesTrigger(ev, w.trigger));

        for (const w of matched) {
          await admin
            .from("workflows")
            .update({
              last_run_at: new Date().toISOString(),
              run_count: (w.run_count ?? 0) + 1,
            })
            .eq("id", w.id);

          await admin.from("agent_actions").insert({
            tenant_id: tenantId,
            agent_id: null,
            action_type: "workflow.triggered",
            status: "executed",
            requires_approval: false,
            payload: {
              workflow_id: w.id,
              workflow_name: w.name,
              event_id: ev.id,
              event_type: ev.event_type,
              event_source: ev.source,
              event_payload: ev.payload,
            },
          });

          triggered.push({ event_id: ev.id, workflow_id: w.id });
        }

        processedIds.push(ev.id);
      }
    }

    if (processedIds.length > 0) {
      await admin
        .from("business_events")
        .update({ processed: true })
        .in("id", processedIds);
    }

    return new Response(JSON.stringify({
      ok: true,
      mode,
      processed: processedIds.length,
      triggered: triggered.length,
      details: triggered,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("workflow-runner error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
