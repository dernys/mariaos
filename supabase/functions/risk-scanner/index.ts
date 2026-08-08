// Risk scanner - scans tenant data and inserts risk_alerts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });

    const { tenant_id } = await req.json();
    if (!tenant_id) throw new Error("tenant_id required");

    const admin = createClient(supabaseUrl, serviceKey);
    const alerts: any[] = [];
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Excessive cancellations
    const { data: cancels } = await admin.from("sales").select("id, total, cancel_reason").eq("tenant_id", tenant_id).eq("status", "cancelled").gte("created_at", since);
    if ((cancels?.length ?? 0) >= 5) {
      alerts.push({
        tenant_id,
        severity: cancels!.length >= 15 ? "critical" : "high",
        category: "fraud",
        title: `${cancels!.length} ventas canceladas en 7 días`,
        description: `Valor cancelado: ${cancels!.reduce((s, x) => s + Number(x.total || 0), 0).toFixed(2)}. Revisa motivos y operadores.`,
        entity_type: "sale",
      });
    }

    // 2. Negative stock
    const { data: negStock } = await admin.from("product_stock").select("product_id, stock, location_type, location_id").eq("tenant_id", tenant_id).lt("stock", 0).limit(50);
    if (negStock && negStock.length > 0) {
      alerts.push({
        tenant_id,
        severity: "high",
        category: "loss",
        title: `${negStock.length} productos con stock negativo`,
        description: "Existe inconsistencia entre ventas y entradas de inventario.",
        entity_type: "product",
        metadata: { items: negStock.slice(0, 10) },
      });
    }

    // 3. High overdue receivables
    const { data: cust } = await admin.from("customers").select("name, balance").eq("tenant_id", tenant_id).gt("balance", 0).order("balance", { ascending: false }).limit(5);
    const totalAR = cust?.reduce((s, x) => s + Number(x.balance || 0), 0) ?? 0;
    if (totalAR > 1000) {
      alerts.push({
        tenant_id,
        severity: totalAR > 10000 ? "high" : "medium",
        category: "financial",
        title: `Cuentas por cobrar acumuladas: ${totalAR.toFixed(2)}`,
        description: `Top deudores: ${cust!.map((c) => `${c.name} (${Number(c.balance).toFixed(2)})`).join(", ")}`,
        entity_type: "customer",
      });
    }

    // 4. Low stock alerts
    const { data: lowStock } = await admin
      .from("products")
      .select("id, name, min_stock")
      .eq("tenant_id", tenant_id)
      .gt("min_stock", 0)
      .limit(200);
    if (lowStock && lowStock.length > 0) {
      const ids = lowStock.map((p: any) => p.id);
      const { data: stocks } = await admin.from("product_stock").select("product_id, stock").in("product_id", ids);
      const byId: Record<string, number> = {};
      stocks?.forEach((s: any) => { byId[s.product_id] = (byId[s.product_id] ?? 0) + Number(s.stock || 0); });
      const breached = lowStock.filter((p: any) => (byId[p.id] ?? 0) <= Number(p.min_stock));
      if (breached.length >= 3) {
        alerts.push({
          tenant_id,
          severity: breached.length >= 10 ? "high" : "medium",
          category: "operational",
          title: `${breached.length} productos bajo el mínimo de stock`,
          description: `Ej.: ${breached.slice(0, 5).map((p: any) => p.name).join(", ")}`,
          entity_type: "product",
        });
      }
    }

    if (alerts.length > 0) {
      await admin.from("risk_alerts").insert(alerts);
    }

    return new Response(JSON.stringify({ ok: true, created: alerts.length, alerts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
