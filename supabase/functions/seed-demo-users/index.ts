import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Roles a crear por tenant y sus credenciales de acceso demo.
// El email se construye con el "slug" de la empresa para no chocar entre tenants.
const DEMO_ROLES: Array<{ role: "admin" | "gerente" | "supervisor" | "cajero" | "inventarista"; label: string; is_owner: boolean }> = [
  { role: "admin", label: "Administrador", is_owner: true },
  { role: "gerente", label: "Gerente", is_owner: false },
  { role: "cajero", label: "Cajero", is_owner: false },
];

const DEMO_PASSWORD = "Demo2026!";

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 24);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Auth: only superadmin can trigger the seeder.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await admin.auth.getUser(token);
    if (!caller) {
      return new Response(JSON.stringify({ error: "No autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isSA } = await admin.rpc("is_superadmin", { _user_id: caller.id });
    if (!isSA) {
      return new Response(JSON.stringify({ error: "Sólo superadmin" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const tenantId: string | undefined = body?.tenant_id;

    // Target tenants: one specified, or all active.
    let q = admin.from("tenants").select("id, name, business_type, is_active").eq("is_active", true);
    if (tenantId) q = q.eq("id", tenantId);
    const { data: tenants, error: tErr } = await q;
    if (tErr) throw tErr;
    const list = tenants ?? [];

    const created: any[] = [];

    for (const tenant of list) {
      const slug = slugify(tenant.name);
      for (const spec of DEMO_ROLES) {
        const email = `${spec.role}.${slug}@demo.maria-os.app`;

        // Look up existing user by email
        let userId: string | null = null;
        const { data: existing } = await admin.auth.admin.listUsers({ perPage: 1000 });
        const found = existing?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (found) {
          userId = found.id;
        } else {
          const { data: newUser, error: cErr } = await admin.auth.admin.createUser({
            email,
            password: DEMO_PASSWORD,
            email_confirm: true,
            user_metadata: { full_name: `${spec.label} ${tenant.name}` },
          });
          if (cErr) {
            created.push({ tenant: tenant.name, role: spec.role, email, error: cErr.message });
            continue;
          }
          userId = newUser.user!.id;
        }

        // Ensure profile row (some flows rely on trigger; keep idempotent)
        await admin.from("profiles").upsert(
          { user_id: userId, full_name: `${spec.label} ${tenant.name}` },
          { onConflict: "user_id" }
        );

        // Link to tenant
        await admin.from("tenant_users").upsert(
          { tenant_id: tenant.id, user_id: userId, is_owner: spec.is_owner },
          { onConflict: "tenant_id,user_id" }
        );

        // Assign role
        await admin.from("user_roles").upsert(
          { user_id: userId, role: spec.role },
          { onConflict: "user_id,role" }
        );

        created.push({ tenant: tenant.name, role: spec.role, email, password: DEMO_PASSWORD });
      }
    }

    return new Response(JSON.stringify({ ok: true, users: created }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
