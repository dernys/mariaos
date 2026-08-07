import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEMO_PASSWORD = "Demo2026!";
const ALLOWED_ROLES = new Set(["admin", "gerente", "cajero"]);
// SEC-001 (docs/security-audit.md): esta función es pública y crea usuarios con
// contraseña conocida y propiedad del tenant. Debe operar EXCLUSIVAMENTE sobre
// tenants marcados explícitamente como demo (tenants.is_demo = true); nunca
// sobre empresas reales.
function isDemoTenant(t?: { is_demo?: boolean | null } | null) {
  return t?.is_demo === true;
}


// SEC-003 (docs/security-audit.md): límite de tasa por IP para evitar abuso del
// endpoint público de demos (por isolate; suficiente para el tráfico esperado).
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();
function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 24);
}


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, key);

    const body = await req.json().catch(() => ({}));
    const action = body?.action ?? "list";

    // List: returns demo tenants + role email map (no secrets)
    if (action === "list") {
      const { data: tenants } = await admin
        .from("tenants")
        .select("id, name, business_type")
        .eq("is_active", true)
        .order("name");
      const items = (tenants ?? []).filter((t: any) => isDemoTenant(t.name)).map((t: any) => {
        const slug = slugify(t.name);
        return {
          tenant_id: t.id,
          name: t.name,
          business_type: t.business_type,
          roles: ["admin", "gerente", "cajero"].map((r) => ({
            role: r,
            email: `${r}.${slug}@demo.maria-os.app`,
          })),
        };
      });
      return new Response(JSON.stringify({ ok: true, password: DEMO_PASSWORD, tenants: items }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure: create-if-missing a demo user for a tenant+role, return creds
    const tenantId: string | undefined = body?.tenant_id;
    const role: string | undefined = body?.role;
    if (!tenantId || !role || !ALLOWED_ROLES.has(role)) {
      return new Response(JSON.stringify({ error: "tenant_id y role (admin|gerente|cajero) son requeridos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: tenant } = await admin.from("tenants").select("id, name").eq("id", tenantId).maybeSingle();
    if (!tenant) {
      return new Response(JSON.stringify({ error: "Tenant no encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isDemoTenant(tenant.name)) {
      // SEC-001: nunca crear usuarios ni conceder propiedad en tenants reales.
      return new Response(JSON.stringify({ error: "not_a_demo_tenant" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const slug = slugify(tenant.name);
    const email = `${role}.${slug}@demo.maria-os.app`;

    // Find existing user
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    let userId = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;

    if (!userId) {
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: `${role.charAt(0).toUpperCase() + role.slice(1)} ${tenant.name}` },
      });
      if (cErr) throw cErr;
      userId = created.user!.id;
    } else {
      // Ensure password is the demo one (idempotent)
      await admin.auth.admin.updateUserById(userId, { password: DEMO_PASSWORD, email_confirm: true });
    }

    await admin.from("profiles").upsert(
      { user_id: userId, full_name: `${role} ${tenant.name}` },
      { onConflict: "user_id" }
    );
    await admin.from("tenant_users").upsert(
      { tenant_id: tenantId, user_id: userId, is_owner: role === "admin" },
      { onConflict: "tenant_id,user_id" }
    );
    await admin.from("user_roles").upsert(
      { user_id: userId, role },
      { onConflict: "user_id,role" }
    );

    return new Response(JSON.stringify({ ok: true, email, password: DEMO_PASSWORD }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
