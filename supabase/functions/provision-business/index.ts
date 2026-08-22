// Provisiona un negocio completo desde una plantilla de negocio.
// Orquesta: verificación de superadmin -> creación (opcional) del usuario
// administrador inicial -> RPC transaccional create_business_from_template.
// Si la RPC falla, se compensa borrando el usuario recién creado (rollback total).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let createdUserId: string | null = null;
  let admin: ReturnType<typeof createClient> | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    admin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "No autenticado" }, 401);

    const { data: { user: caller } } = await admin.auth.getUser(token);
    if (!caller) return json({ error: "No autenticado" }, 401);

    const { data: isSA } = await admin.rpc("is_superadmin", { _user_id: caller.id });
    if (!isSA) return json({ error: "Solo un superadministrador puede crear negocios" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "create");

    if (action === "templates") {
      const { data, error } = await admin
        .from("business_templates")
        .select("code, business_type, name, description, icon, accounting_profile_code, default_country_code, config")
        .eq("is_active", true)
        .order("sort_order");
      if (error) return json({ error: error.message }, 400);
      return json({ templates: data ?? [] });
    }

    if (action === "validate") {
      const tenantId = String(body?.tenant_id ?? "");
      if (!tenantId) return json({ error: "tenant_id requerido" }, 400);
      const { data, error } = await admin.rpc("validate_business_readiness", { p_tenant: tenantId });
      if (error) return json({ error: error.message }, 400);
      return json({ validation: data });
    }

    // ---- action = create ----
    const templateCode = String(body?.template_code ?? "");
    const payload = body?.payload ?? {};
    const adminInput = body?.admin ?? null;
    const idempotencyKey = body?.idempotency_key ? String(body.idempotency_key) : null;

    if (!templateCode) return json({ error: "template_code requerido" }, 400);
    if (!payload?.name || String(payload.name).trim().length < 2) {
      return json({ error: "El nombre del negocio es obligatorio" }, 400);
    }

    // Administrador inicial: se crea (o reutiliza si ya existe con ese email)
    let adminUserId: string | null = null;
    if (adminInput?.email) {
      const email = String(adminInput.email).trim().toLowerCase();
      const password = String(adminInput.password ?? "").trim();
      if (password.length < 8) {
        return json({ error: "La contraseña del administrador debe tener al menos 8 caracteres" }, 400);
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: adminInput.full_name ?? email },
      });

      if (createErr || !created?.user) {
        return json({ error: createErr?.message ?? "No se pudo crear el administrador" }, 400);
      }
      createdUserId = created.user.id;
      adminUserId = created.user.id;

      await admin.from("profiles").upsert(
        { user_id: adminUserId, full_name: adminInput.full_name ?? email },
        { onConflict: "user_id" },
      );
    }

    const { data, error } = await admin.rpc("create_business_from_template", {
      p_template_code: templateCode,
      p_payload: payload,
      p_admin_user_id: adminUserId,
      p_actor_user_id: caller.id,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      // Compensación: sin negocio no debe quedar usuario huérfano
      if (createdUserId) {
        await admin.auth.admin.deleteUser(createdUserId).catch(() => {});
        await admin.from("profiles").delete().eq("user_id", createdUserId);
      }
      return json({ error: error.message }, 400);
    }

    return json({ ...(data as Record<string, unknown>), admin_user_id: adminUserId });
  } catch (e) {
    if (admin && createdUserId) {
      await admin.auth.admin.deleteUser(createdUserId).catch(() => {});
    }
    return json({ error: e instanceof Error ? e.message : "Error inesperado" }, 500);
  }
});
