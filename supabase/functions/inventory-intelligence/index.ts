import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

interface Body {
  tenant_id: string;
  mode?: "predict" | "abc" | "anomaly" | "rebalance" | "all";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "unauthorized" }, 401);

    const body = (await req.json()) as Body;
    if (!body.tenant_id) return json({ error: "tenant_id required" }, 400);
    const mode = body.mode || "all";

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Aggregate sales last 60 days by product
    const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const { data: sales } = await admin
      .from("sale_items")
      .select("product_id, qty, price, total, created_at, sales!inner(tenant_id, status, created_at)")
      .gte("created_at", since)
      .limit(5000);

    const filtered = (sales || []).filter((s: any) =>
      s.sales?.tenant_id === body.tenant_id && ["paid", "partial"].includes(s.sales?.status)
    );

    const stats: Record<string, { qty: number; revenue: number; count: number }> = {};
    filtered.forEach((s: any) => {
      if (!s.product_id) return;
      const k = s.product_id;
      stats[k] = stats[k] || { qty: 0, revenue: 0, count: 0 };
      stats[k].qty += Number(s.qty) || 0;
      stats[k].revenue += Number(s.total) || 0;
      stats[k].count += 1;
    });

    const { data: products } = await admin
      .from("products")
      .select("id, name, sku, cost, price, min_stock")
      .eq("tenant_id", body.tenant_id)
      .eq("is_active", true);

    const { data: stockRows } = await admin
      .from("product_stock")
      .select("product_id, location_type, location_id, stock, in_transit, reserved")
      .eq("tenant_id", body.tenant_id);

    const stockByProduct: Record<string, number> = {};
    const stockByLocation: Record<string, Record<string, number>> = {};
    (stockRows || []).forEach((r: any) => {
      stockByProduct[r.product_id] = (stockByProduct[r.product_id] || 0) + Number(r.stock || 0);
      const k = `${r.location_type}:${r.location_id}`;
      stockByLocation[r.product_id] = stockByLocation[r.product_id] || {};
      stockByLocation[r.product_id][k] = Number(r.stock || 0);
    });

    // ABC analysis by revenue
    const totalsByProduct = (products || []).map((p: any) => {
      const s = stats[p.id] || { qty: 0, revenue: 0, count: 0 };
      const stock = stockByProduct[p.id] || 0;
      const dailyDemand = s.qty / 60;
      const daysOfCover = dailyDemand > 0 ? stock / dailyDemand : 999;
      const margin = (Number(p.price) - Number(p.cost)) * s.qty;
      return { ...p, qty: s.qty, revenue: s.revenue, stock, daily_demand: dailyDemand, days_of_cover: daysOfCover, margin };
    });

    const sortedByRev = [...totalsByProduct].sort((a, b) => b.revenue - a.revenue);
    const totalRev = sortedByRev.reduce((acc, p) => acc + p.revenue, 0) || 1;
    let cum = 0;
    const abc = sortedByRev.map((p) => {
      cum += p.revenue;
      const pct = cum / totalRev;
      const cls = pct <= 0.8 ? "A" : pct <= 0.95 ? "B" : "C";
      return { ...p, abc_class: cls, revenue_share: p.revenue / totalRev };
    });

    // Predictions: products at risk of stockout (< 7 days cover)
    const stockoutRisk = totalsByProduct
      .filter((p) => p.daily_demand > 0 && p.days_of_cover < 7)
      .sort((a, b) => a.days_of_cover - b.days_of_cover)
      .slice(0, 20);

    // Slow movers: A=B=0 sales, with stock
    const slowMovers = totalsByProduct
      .filter((p) => p.qty === 0 && p.stock > 0)
      .sort((a, b) => b.stock - a.stock)
      .slice(0, 20);

    // Top profitable
    const topProfit = [...totalsByProduct].sort((a, b) => b.margin - a.margin).slice(0, 10);

    // Rebalance suggestions: same product with stock=0 in one location and surplus in another
    const rebalance: any[] = [];
    Object.entries(stockByLocation).forEach(([pid, locs]) => {
      const entries = Object.entries(locs);
      if (entries.length < 2) return;
      const empty = entries.filter(([_, s]) => s <= 0);
      const surplus = entries.filter(([_, s]) => s > 5).sort((a, b) => b[1] - a[1])[0];
      if (empty.length && surplus) {
        const prod = (products || []).find((p: any) => p.id === pid);
        if (prod) {
          rebalance.push({
            product_id: pid,
            product_name: prod.name,
            from: surplus[0],
            to: empty[0][0],
            suggested_qty: Math.floor(surplus[1] / 2),
          });
        }
      }
    });

    let aiSummary: string | null = null;
    if (LOVABLE_API_KEY && mode === "all") {
      try {
        const payload = {
          stockout_risk_count: stockoutRisk.length,
          top_at_risk: stockoutRisk.slice(0, 5).map((p) => ({ name: p.name, days: Math.round(p.days_of_cover * 10) / 10 })),
          slow_movers_count: slowMovers.length,
          rebalance_count: rebalance.length,
          top_profit: topProfit.slice(0, 3).map((p) => ({ name: p.name, margin: Math.round(p.margin) })),
        };
        const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: "Eres un agente de inventario senior. Responde en español, en máximo 4 frases ejecutivas con bullets si conviene. Foco: acción concreta." },
              { role: "user", content: `Análisis de inventario JSON:\n${JSON.stringify(payload)}\n\nResume riesgos clave y 3 acciones recomendadas.` },
            ],
          }),
        });
        if (ai.ok) {
          const aj = await ai.json();
          aiSummary = aj.choices?.[0]?.message?.content || null;
        }
      } catch (_) { /* ignore */ }
    }

    return json({
      generated_at: new Date().toISOString(),
      counts: {
        products: products?.length || 0,
        stockout_risk: stockoutRisk.length,
        slow_movers: slowMovers.length,
        rebalance: rebalance.length,
      },
      abc,
      stockout_risk: stockoutRisk,
      slow_movers: slowMovers,
      top_profit: topProfit,
      rebalance,
      ai_summary: aiSummary,
    }, 200);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
