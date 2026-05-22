import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = req.headers.get("x-api-key") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!apiKey) return json({ error: "missing api key" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const keyHash = await sha256(apiKey);

    const { data: keyRow } = await admin
      .from("tenant_api_keys")
      .select("id, tenant_id, scopes, is_active, expires_at")
      .eq("key_hash", keyHash)
      .maybeSingle();

    if (!keyRow || !keyRow.is_active) return json({ error: "invalid api key" }, 401);
    if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) return json({ error: "key expired" }, 401);

    await admin.from("tenant_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);

    const tenantId = keyRow.tenant_id;
    const scopes: string[] = keyRow.scopes || [];
    const url = new URL(req.url);
    const path = url.pathname.replace(/^.*\/api-v1/, "").replace(/^\//, "");
    const method = req.method;

    const requireScope = (s: string) => scopes.includes(s) || scopes.includes("admin");

    // GET /products
    if (path === "products" && method === "GET") {
      if (!requireScope("read")) return json({ error: "forbidden" }, 403);
      const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);
      const { data, error } = await admin.from("products")
        .select("id, sku, name, price, cost, is_active, min_stock")
        .eq("tenant_id", tenantId).limit(limit);
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    // GET /sales
    if (path === "sales" && method === "GET") {
      if (!requireScope("read")) return json({ error: "forbidden" }, 403);
      const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);
      const from = url.searchParams.get("from");
      let q = admin.from("sales").select("id, total, status, customer_id, store_id, created_at")
        .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(limit);
      if (from) q = q.gte("created_at", from);
      const { data, error } = await q;
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    // GET /stock
    if (path === "stock" && method === "GET") {
      if (!requireScope("read")) return json({ error: "forbidden" }, 403);
      const { data, error } = await admin.from("product_stock")
        .select("product_id, location_type, location_id, stock, reserved")
        .eq("tenant_id", tenantId).limit(1000);
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    // GET /customers
    if (path === "customers" && method === "GET") {
      if (!requireScope("read")) return json({ error: "forbidden" }, 403);
      const { data, error } = await admin.from("customers")
        .select("id, name, email, phone, balance")
        .eq("tenant_id", tenantId).limit(500);
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    return json({ error: "not found", path }, 404);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
