// MarIA OS - Agent runner
// Receives an agent_id, gathers tenant context relevant to the agent type,
// asks Lovable AI Gateway for structured analysis, persists decisions + actions.
import { resolveTenantScope } from "../_shared/tenantScope.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

// --- Zod schema for LLM structured output ---
const RecommendationSchema = z.object({
  title: z.string().min(1).max(200),
  rationale: z.string().max(2000).optional().default(""),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  requires_approval: z.boolean().optional().default(true),
});
const AgentOutputSchema = z.object({
  summary: z.string().min(1).max(1000),
  insights: z.array(z.string().max(500)).max(20).default([]),
  recommendations: z.array(RecommendationSchema).max(10).default([]),
});
type AgentOutput = z.infer<typeof AgentOutputSchema>;


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
};

const SYSTEM_PROMPTS: Record<string, string> = {
  cfo: "Eres el Agente CFO de MarIA OS. Analizas finanzas, márgenes, flujo de caja, cuentas por cobrar/pagar y rentabilidad. Detectas riesgos financieros y propones decisiones concretas accionables.",
  inventory: "Eres el Agente de Inventario de MarIA OS. Analizas stock, rotación, productos sin movimiento, quiebres, sobrestock y recomiendas reposiciones, transferencias y ajustes de mínimos.",
  operations: "Eres el Agente de Operaciones de MarIA OS. Analizas ventas, turnos, rendimiento de empleados, mesas, productividad por tienda y recomiendas optimizaciones operativas.",
  marketplace: "Eres el Agente de Marketplace de MarIA OS. Analizas el catálogo público, pedidos online, conversión, tendencias y propones campañas, precios y mejoras de catálogo.",
  compliance: "Eres el Agente de Cumplimiento de MarIA OS. Detectas inconsistencias contables, ventas canceladas anómalas, accesos sospechosos y propones controles.",
  procurement: "Eres el Agente de Compras de MarIA OS. Analizas proveedores, lead times, costos, consignaciones y recomiendas órdenes de compra y negociaciones.",
  analytics: "Eres el Agente de Analítica de MarIA OS. Detectas tendencias, anomalías, oportunidades de crecimiento y traduces datos en insights ejecutivos.",
};

async function gatherContext(supabase: any, tenantId: string, type: string) {
  const ctx: Record<string, any> = {};
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  if (type === "cfo" || type === "analytics" || type === "operations") {
    const { data: sales } = await supabase
      .from("sales")
      .select("total, status, created_at, amount_paid")
      .eq("tenant_id", tenantId)
      .gte("created_at", since)
      .limit(500);
    ctx.sales_30d = {
      count: sales?.length ?? 0,
      revenue: sales?.reduce((s: number, x: any) => s + Number(x.total || 0), 0) ?? 0,
      cancelled: sales?.filter((x: any) => x.status === "cancelled").length ?? 0,
      pending: sales?.filter((x: any) => x.status === "pending" || x.status === "partial").length ?? 0,
      pending_amount: sales?.filter((x: any) => x.status !== "paid" && x.status !== "cancelled").reduce((s: number, x: any) => s + (Number(x.total || 0) - Number(x.amount_paid || 0)), 0) ?? 0,
    };
  }

  if (type === "cfo") {
    const { data: cust } = await supabase.from("customers").select("balance").eq("tenant_id", tenantId).gt("balance", 0);
    const { data: sup } = await supabase.from("suppliers").select("balance").eq("tenant_id", tenantId).gt("balance", 0);
    ctx.accounts_receivable = cust?.reduce((s: number, x: any) => s + Number(x.balance || 0), 0) ?? 0;
    ctx.accounts_payable = sup?.reduce((s: number, x: any) => s + Number(x.balance || 0), 0) ?? 0;
  }

  if (type === "inventory" || type === "procurement") {
    const { data: low } = await supabase
      .from("products")
      .select("id, name, sku, min_stock, price")
      .eq("tenant_id", tenantId)
      .gt("min_stock", 0)
      .limit(50);
    ctx.products_with_min = low?.length ?? 0;
    ctx.sample_products = low?.slice(0, 20).map((p: any) => ({ name: p.name, sku: p.sku, min_stock: p.min_stock })) ?? [];
  }

  if (type === "marketplace") {
    const { data: orders } = await supabase
      .from("online_orders")
      .select("status, total, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", since)
      .limit(200);
    ctx.online_orders_30d = orders?.length ?? 0;
    ctx.online_revenue_30d = orders?.reduce((s: number, x: any) => s + Number(x.total || 0), 0) ?? 0;
  }

  if (type === "compliance") {
    const { data: cancels } = await supabase.from("sales").select("id, cancel_reason, cancelled_at, total").eq("tenant_id", tenantId).eq("status", "cancelled").gte("created_at", since).limit(100);
    ctx.recent_cancellations = cancels?.length ?? 0;
    ctx.cancellation_value = cancels?.reduce((s: number, x: any) => s + Number(x.total || 0), 0) ?? 0;
  }

  if (type === "procurement") {
    const { data: suppliers } = await supabase.from("suppliers").select("name, balance").eq("tenant_id", tenantId).limit(20);
    ctx.suppliers = suppliers ?? [];
  }

  // Logs contables detallados: el maestro de cuentas y la conciliación
  // operación ↔ contabilidad son la base para diagnósticos y acciones del agente.
  if (type === "cfo" || type === "compliance") {
    const [mapping, recon, diag] = await Promise.all([
      supabase.rpc("accounting_mapping_status", { p_tenant: tenantId }),
      supabase.rpc("accounting_operation_reconciliation", { p_tenant: tenantId, p_from: null, p_to: null }),
      supabase.rpc("financial_engine_diagnostics", { p_tenant: tenantId }),
    ]);
    ctx.account_master = (mapping.data ?? []).map((r: any) => ({
      key: r.mapping_key, module: r.module, account: r.account_code, source: r.source,
      type_ok: r.type_ok, detail: r.detail, remediation: r.remediation,
    }));
    ctx.accounting_reconciliation = (recon.data ?? []).map((r: any) => ({
      module: r.module, documents: r.documents, unposted: r.documents_unposted,
      documents_amount: r.documents_amount, posted_amount: r.posted_amount,
      difference: r.difference, status: r.status, detail: r.detail, remediation: r.remediation,
    }));
    ctx.financial_diagnostics = (diag.data ?? [])
      .filter((r: any) => r.status !== "pass" && r.status !== "ok")
      .map((r: any) => ({ area: r.area, check: r.check_code, status: r.status, severity: r.severity, detail: r.detail }));
  }

  return ctx;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY missing");

    // Auth check
    const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { agent_id } = await req.json();
    if (!agent_id) throw new Error("agent_id required");

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: agent, error: agentErr } = await admin.from("ai_agents").select("*").eq("id", agent_id).single();
    if (agentErr || !agent) throw new Error("agent not found");

    // --- Authorization: el tenant del agente debe estar en el alcance del llamante ---
    const scope = await resolveTenantScope(admin, userRes.user.id, agent.tenant_id);
    if (scope.error) {
      return new Response(JSON.stringify({ error: scope.error.message }), { status: scope.error.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }


    const ctx = await gatherContext(admin, agent.tenant_id, agent.type);

    const system = SYSTEM_PROMPTS[agent.type] ?? "Eres un agente de IA empresarial.";
    const userPrompt = `Contexto del tenant (últimos 30 días):\n${JSON.stringify(ctx, null, 2)}\n\nProduce un análisis ejecutivo y entre 1 y 4 recomendaciones accionables. Responde en JSON con esta forma exacta:\n{\n  "summary": "string corto en español",\n  "insights": ["bullet 1", "bullet 2"],\n  "recommendations": [{"title":"...", "rationale":"...", "priority":"low|medium|high|critical", "requires_approval": true}]\n}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system + " Responde siempre en JSON válido y en español." },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "Límite de uso alcanzado. Intenta más tarde." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: "Créditos de IA agotados. Añade créditos en el workspace." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      throw new Error("AI gateway error: " + txt);
    }

    const aiJson = await aiRes.json();
    const raw = aiJson.choices?.[0]?.message?.content ?? "{}";
    const correlationId = crypto.randomUUID();

    // --- Parse + Zod validate ---
    let rawParsed: unknown;
    try { rawParsed = typeof raw === "string" ? JSON.parse(raw) : raw; }
    catch { rawParsed = { summary: String(raw), insights: [], recommendations: [] }; }

    const validation = AgentOutputSchema.safeParse(rawParsed);
    let parsed: AgentOutput;
    let validation_errors: any = null;
    if (validation.success) {
      parsed = validation.data;
    } else {
      validation_errors = validation.error.flatten();
      console.warn("agent-runner: LLM output failed Zod validation", validation_errors);
      // Best-effort fallback so we still persist *something* auditable
      const r: any = rawParsed ?? {};
      parsed = {
        summary: typeof r.summary === "string" ? r.summary.slice(0, 1000) : `Análisis de ${agent.name}`,
        insights: Array.isArray(r.insights) ? r.insights.filter((x: any) => typeof x === "string").slice(0, 20) : [],
        recommendations: Array.isArray(r.recommendations)
          ? r.recommendations
              .filter((x: any) => x && typeof x.title === "string")
              .slice(0, 10)
              .map((x: any) => ({
                title: String(x.title).slice(0, 200),
                rationale: typeof x.rationale === "string" ? x.rationale.slice(0, 2000) : "",
                priority: ["low", "medium", "high", "critical"].includes(x.priority) ? x.priority : "medium",
                requires_approval: x.requires_approval !== false,
              }))
          : [],
      };
    }

    // Persist decision
    const { data: decision } = await admin
      .from("business_decisions")
      .insert({
        tenant_id: agent.tenant_id,
        agent_id: agent.id,
        title: parsed.summary.slice(0, 120),
        context: { ...ctx, correlation_id: correlationId },
        recommendation: { ...parsed, validation_errors },
        reasoning: parsed.summary,
        status: "pending",
      })
      .select()
      .single();

    // Persist actions for each recommendation
    const recs = parsed.recommendations;
    if (recs.length > 0) {
      await admin.from("agent_actions").insert(
        recs.map((r) => ({
          tenant_id: agent.tenant_id,
          agent_id: agent.id,
          action_type: r.title.slice(0, 80),
          status: agent.autonomy_level === "autonomous" ? "executed" : "pending",
          requires_approval: r.requires_approval !== false,
          payload: { ...r, correlation_id: correlationId, decision_id: decision?.id },
        }))
      );
    }

    // --- Persist into business_memory (long-term tenant knowledge) ---
    try {
      await admin.from("business_memory").insert({
        tenant_id: agent.tenant_id,
        topic: `agent:${agent.type}`,
        summary: parsed.summary.slice(0, 500),
        details: {
          agent_id: agent.id,
          agent_name: agent.name,
          insights: parsed.insights,
          recommendation_count: recs.length,
          priorities: recs.map((r) => r.priority),
          context_snapshot: ctx,
          correlation_id: correlationId,
          had_validation_errors: !!validation_errors,
          generated_at: new Date().toISOString(),
        },
        source_decision_id: decision?.id ?? null,
      });
    } catch (memErr) {
      console.warn("business_memory insert failed", memErr);
    }

    // Update agent metrics
    const metrics = (agent.metrics ?? {}) as any;
    metrics.runs = (metrics.runs ?? 0) + 1;
    metrics.last_recommendations = recs.length;
    metrics.last_validation_ok = !validation_errors;
    await admin.from("ai_agents").update({ last_run_at: new Date().toISOString(), metrics }).eq("id", agent.id);

    // Emit business event
    await admin.from("business_events").insert({
      tenant_id: agent.tenant_id,
      source: `agent:${agent.type}`,
      event_type: "agent.analysis.completed",
      payload: {
        agent_id: agent.id,
        decision_id: decision?.id,
        recommendations: recs.length,
        correlation_id: correlationId,
        validation_ok: !validation_errors,
      },
    });

    return new Response(JSON.stringify({
      ok: true,
      decision,
      recommendations: recs,
      correlation_id: correlationId,
      validation_ok: !validation_errors,
      validation_errors,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "x-correlation-id": correlationId },
    });

  } catch (e) {
    console.error("agent-runner error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
