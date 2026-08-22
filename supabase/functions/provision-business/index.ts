// Provisiona un negocio completo desde una plantilla de negocio.
// Orden seguro y fail-closed:
//   1) validar superadmin (server-side, con el JWT del llamante)
//   2) resolver idempotencia ANTES de crear cualquier usuario Auth
//   3) crear el usuario administrador vía Admin API (nunca en frontend)
//   4) create_business_from_template() -> tenant seguro (el cliente NO decide el tenant)
//   5) validar server-side: admin + perfil + membresía + rol admin + is_owner + aislamiento
//   6) si algo falla: rollback total (tenant + usuario Auth creado por esta operación)
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

  // deno-lint-ignore no-explicit-any
  let admin: any = null;
  let createdUserId: string | null = null;
  let createdTenantId: string | null = null;
  let idempotencyKey: string | null = null;

  const rollback = async (reason: string) => {
    if (!admin) return;
    if (createdTenantId) {
      await admin.rpc("rollback_business_provisioning", {
        p_tenant: createdTenantId,
        p_idempotency_key: idempotencyKey,
        p_reason: reason,
      });
    }
    if (createdUserId) {
      await admin.from("profiles").delete().eq("user_id", createdUserId);
      await admin.from("user_roles").delete().eq("user_id", createdUserId);
      await admin.auth.admin.deleteUser(createdUserId).catch(() => {});
    }
    console.error("provision-business rollback", { reason, createdTenantId, createdUserId });
  };

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

    if (action === "check_admin") {
      const email = String(body?.email ?? "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return json({ error: "Email inválido" }, 400);
      }
      const { data, error } = await admin.rpc("lookup_business_admin_candidate", { _email: email });
      if (error) return json({ error: error.message }, 400);
      return json({ candidate: data });
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
    idempotencyKey = body?.idempotency_key ? String(body.idempotency_key) : null;

    if (!templateCode) return json({ error: "template_code requerido" }, 400);
    if (!payload?.name || String(payload.name).trim().length < 2) {
      return json({ error: "El nombre del negocio es obligatorio" }, 400);
    }

    // 2) IDEMPOTENCIA: si esta misma operación ya creó un negocio, devolverlo sin crear nada más
    if (idempotencyKey) {
      const { data: prev } = await admin
        .from("operation_idempotency")
        .select("result_id")
        .eq("operation", "create_business")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (prev?.result_id) {
        const { data: validation } = await admin.rpc("validate_business_readiness", { p_tenant: prev.result_id });
        const { data: t } = await admin.from("tenants").select("slug").eq("id", prev.result_id).maybeSingle();
        const adminCheck = (validation?.checks ?? []).find((c: { key: string }) => c.key === "admin");
        return json({
          tenant_id: prev.result_id,
          slug: t?.slug ?? null,
          idempotent: true,
          validation,
          admin_user_id: adminCheck?.admin?.user_id ?? null,
          admin_email: adminInput?.email ? String(adminInput.email).trim().toLowerCase() : null,
        });
      }
    }

    // 3) Administrador inicial: creado SOLO server-side con Admin API
    let adminUserId: string | null = null;
    let adminEmail: string | null = null;
    if (adminInput?.email) {
      adminEmail = String(adminInput.email).trim().toLowerCase();
      const password = String(adminInput.password ?? "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) {
        return json({ error: "Email del administrador inválido" }, 400);
      }
      if (password.length < 8) {
        return json({ error: "La contraseña del administrador debe tener al menos 8 caracteres" }, 400);
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: adminEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: adminInput.full_name ?? adminEmail },
      });

      if (createErr || !created?.user) {
        const msg = String(createErr?.message ?? "");
        if (/already|registered|exists/i.test(msg)) {
          return json({ error: `El email ${adminEmail} ya está registrado. Usa otro email.` }, 409);
        }
        return json({ error: msg || "No se pudo crear el administrador" }, 400);
      }
      createdUserId = created.user.id;
      adminUserId = created.user.id;

      const { error: profErr } = await admin.from("profiles").upsert(
        { user_id: adminUserId, full_name: adminInput.full_name ?? adminEmail },
        { onConflict: "user_id" },
      );
      if (profErr) {
        await rollback(`profile: ${profErr.message}`);
        return json({ error: `No se pudo crear el perfil del administrador: ${profErr.message}` }, 400);
      }
    }

    // 4) Provisionamiento transaccional. El tenant proviene SOLO de aquí.
    const { data, error } = await admin.rpc("create_business_from_template", {
      p_template_code: templateCode,
      p_payload: payload,
      p_admin_user_id: adminUserId,
      p_actor_user_id: caller.id,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      await rollback(`create_business_from_template: ${error.message}`);
      return json({ error: error.message }, 400);
    }

    const result = (data ?? {}) as Record<string, unknown>;
    createdTenantId = (result.tenant_id as string) ?? null;
    if (!createdTenantId) {
      await rollback("sin tenant_id devuelto");
      return json({ error: "El provisionamiento no devolvió un negocio válido" }, 500);
    }

    // 5) Verificación final server-side del administrador
    if (adminUserId) {
      const { data: check, error: checkErr } = await admin.rpc("validate_business_admin", {
        p_tenant: createdTenantId,
        p_user: adminUserId,
      });
      if (checkErr || !check?.ok) {
        await rollback(`admin_validation: ${checkErr?.message ?? JSON.stringify(check)}`);
        return json({
          error: "El administrador no quedó correctamente configurado; se revirtió el negocio.",
          admin_validation: check ?? null,
        }, 400);
      }
      result.admin_validation = check;
    }

    const validation = result.validation as { ready?: boolean } | undefined;
    if (validation && validation.ready === false) {
      await rollback("readiness_failed");
      return json({ error: "El negocio no superó la validación final; se revirtió por completo.", validation }, 400);
    }

    return json({ ...result, admin_user_id: adminUserId, admin_email: adminEmail });
  } catch (e) {
    await rollback(e instanceof Error ? e.message : "excepción inesperada");
    return json({ error: e instanceof Error ? e.message : "Error inesperado" }, 500);
  }
});
