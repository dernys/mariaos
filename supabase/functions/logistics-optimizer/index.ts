import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // --- Auth: require JWT ---
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userRes.user.id;

    const { tenant_id } = await req.json();
    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // --- Tenant membership check (or superadmin) ---
    const [{ data: membership }, { data: superadmin }] = await Promise.all([
      supabase.from("tenant_users").select("tenant_id").eq("tenant_id", tenant_id).eq("user_id", userId).maybeSingle(),
      supabase.from("superadmins").select("user_id").eq("user_id", userId).maybeSingle(),
    ]);
    if (!membership && !superadmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const [stocksRes, prodRes, storesRes, whRes, salesRes] = await Promise.all([
      supabase.from("product_stock").select("product_id, location_type, location_id, stock").eq("tenant_id", tenant_id),
      supabase.from("products").select("id, name, sku, min_stock, max_stock, cost").eq("tenant_id", tenant_id),
      supabase.from("stores").select("id, name, operational_status, geo_lat, geo_lng").eq("tenant_id", tenant_id),
      supabase.from("warehouses").select("id, name, warehouse_type").eq("tenant_id", tenant_id),
      supabase.from("inventory_movements").select("product_id, location_type, location_id, quantity, movement_type, created_at").eq("tenant_id", tenant_id).gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()),
    ]);

    const products = new Map((prodRes.data || []).map((p: any) => [p.id, p]));
    const stocks = stocksRes.data || [];

    // Demand per product per location (last 30d)
    const demand: Record<string, number> = {};
    (salesRes.data || []).forEach((m: any) => {
      if (m.movement_type === "sale") {
        const key = `${m.product_id}|${m.location_type}|${m.location_id}`;
        demand[key] = (demand[key] || 0) + Number(m.quantity || 0);
      }
    });

    // Detect overstock and stockout per location
    const overstock: any[] = [];
    const understock: any[] = [];
    stocks.forEach((s: any) => {
      const p: any = products.get(s.product_id);
      if (!p) return;
      const key = `${s.product_id}|${s.location_type}|${s.location_id}`;
      const sold30 = demand[key] || 0;
      const dailyDemand = sold30 / 30;
      const daysOfCover = dailyDemand > 0 ? s.stock / dailyDemand : 999;

      if (p.max_stock > 0 && s.stock > p.max_stock * 1.2) {
        overstock.push({ product_id: s.product_id, name: p.name, sku: p.sku, location_type: s.location_type, location_id: s.location_id, stock: s.stock, max_stock: p.max_stock, excess: s.stock - p.max_stock, days_of_cover: Math.round(daysOfCover) });
      }
      if (p.min_stock > 0 && s.stock <= p.min_stock) {
        understock.push({ product_id: s.product_id, name: p.name, sku: p.sku, location_type: s.location_type, location_id: s.location_id, stock: s.stock, min_stock: p.min_stock, days_of_cover: Math.round(daysOfCover), daily_demand: dailyDemand });
      }
    });

    // Suggest transfers: match overstock with understock for same product
    const suggestions: any[] = [];
    understock.forEach((u) => {
      const sources = overstock.filter((o) => o.product_id === u.product_id);
      sources.forEach((src) => {
        const qty = Math.min(src.excess, Math.max(u.min_stock - u.stock, Math.ceil(u.daily_demand * 14)));
        if (qty > 0) {
          suggestions.push({
            product_id: u.product_id,
            product_name: u.name,
            sku: u.sku,
            from_type: src.location_type,
            from_id: src.location_id,
            to_type: u.location_type,
            to_id: u.location_id,
            suggested_qty: qty,
            urgency: u.days_of_cover < 7 ? "high" : "medium",
          });
        }
      });
    });

    // Recent incidents
    const incidentsRes = await supabase
      .from("store_incidents")
      .select("id, store_id, title, severity, status, created_at")
      .eq("tenant_id", tenant_id)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(20);

    const summary = {
      total_skus: products.size,
      overstock_count: overstock.length,
      understock_count: understock.length,
      transfer_suggestions: suggestions.length,
      open_incidents: incidentsRes.data?.length || 0,
    };

    return new Response(JSON.stringify({
      summary,
      overstock: overstock.slice(0, 50),
      understock: understock.slice(0, 50),
      suggestions: suggestions.slice(0, 50),
      incidents: incidentsRes.data || [],
      stores: storesRes.data || [],
      warehouses: whRes.data || [],
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
