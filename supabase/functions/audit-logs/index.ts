import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isSA } = await admin.rpc("is_superadmin", { _user_id: user.id });
    if (!isSA) {
      return new Response(JSON.stringify({ error: "Solo superadmin" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const {
      tenant_id, user_id, entity_type, action, search,
      from_date, to_date, limit = 100, offset = 0,
    } = body;

    let q = admin.from("activity_log")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (tenant_id) q = q.eq("tenant_id", tenant_id);
    if (user_id) q = q.eq("performed_by", user_id);
    if (entity_type) q = q.eq("entity_type", entity_type);
    if (action) q = q.ilike("action", `%${action}%`);
    if (search) q = q.or(`description.ilike.%${search}%,action.ilike.%${search}%`);
    if (from_date) q = q.gte("created_at", from_date);
    if (to_date) q = q.lte("created_at", to_date);

    const { data: logs, count, error } = await q;
    if (error) throw error;

    // Enrich with user emails/names and tenant names
    const userIds = [...new Set((logs ?? []).map(l => l.performed_by).filter(Boolean))];
    const tenantIds = [...new Set((logs ?? []).map(l => l.tenant_id).filter(Boolean))];

    const [{ data: { users: authUsers } = { users: [] } }, { data: profiles }, { data: tenants }] = await Promise.all([
      admin.auth.admin.listUsers({ perPage: 1000 }),
      admin.from("profiles").select("user_id, full_name").in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
      admin.from("tenants").select("id, name").in("id", tenantIds.length ? tenantIds : ["00000000-0000-0000-0000-000000000000"]),
    ]);

    const enriched = (logs ?? []).map(l => ({
      ...l,
      user_email: authUsers?.find(u => u.id === l.performed_by)?.email ?? null,
      user_name: profiles?.find(p => p.user_id === l.performed_by)?.full_name ?? null,
      tenant_name: tenants?.find(t => t.id === l.tenant_id)?.name ?? null,
    }));

    return new Response(JSON.stringify({ logs: enriched, total: count ?? 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
