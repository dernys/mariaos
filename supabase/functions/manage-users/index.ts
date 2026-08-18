import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is admin or superadmin
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
    if (!caller) {
      return new Response(JSON.stringify({ error: "No autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if caller is superadmin, admin, or tenant owner (any tenant)
    const { data: isSA } = await supabaseAdmin.rpc("is_superadmin", { _user_id: caller.id });
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    const { count: ownerCount } = await supabaseAdmin
      .from("tenant_users")
      .select("id", { count: "exact", head: true })
      .eq("user_id", caller.id)
      .eq("is_owner", true);
    const isTenantOwner = (ownerCount ?? 0) > 0;
    // Mutations (create/update role/delete) require admin, tenant owner or superadmin.
    // Read-only listing is allowed to any tenant member, always scoped to their tenants.
    const canMutate = isSA || isAdmin || isTenantOwner;
    // Tenant scope: non-superadmins only ever see/manage users of their own tenants.
    const { data: myTenants } = await supabaseAdmin
      .from("tenant_users")
      .select("tenant_id")
      .eq("user_id", caller.id);
    const tenantIds = (myTenants ?? []).map((t: any) => t.tenant_id);

    const scopedUserIds = async (): Promise<string[]> => {
      if (tenantIds.length === 0) return [caller.id];
      const { data } = await supabaseAdmin
        .from("tenant_users")
        .select("user_id")
        .in("tenant_id", tenantIds);
      const ids = new Set<string>((data ?? []).map((r: any) => r.user_id));
      ids.add(caller.id);
      return [...ids];
    };

    // A platform superadmin is a global identity: no tenant admin may ever
    // read-manage, mutate, delete or re-role them.
    const isTargetSuperadmin = async (targetId: string) => {
      const { data } = await supabaseAdmin
        .from("superadmins")
        .select("user_id")
        .eq("user_id", targetId)
        .maybeSingle();
      return !!data;
    };

    const assertInScope = async (targetId: string) => {
      if (isSA) return true;
      if (await isTargetSuperadmin(targetId)) return false;
      const ids = await scopedUserIds();
      return ids.includes(targetId);
    };

    const forbidden = (msg = "Usuario fuera de tu negocio") =>
      new Response(JSON.stringify({ error: msg }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const { action, ...body } = await req.json();

    // LIST USERS - get profiles with roles
    if (action === "list") {
      let profilesQuery = supabaseAdmin
        .from("profiles")
        .select("id, user_id, full_name, avatar_url, created_at")
        .order("created_at", { ascending: false });

      let allowedIds: string[] | null = null;
      if (!isSA) {
        const { data: sas } = await supabaseAdmin.from("superadmins").select("user_id");
        const saIds = new Set<string>((sas ?? []).map((s: any) => s.user_id));
        // Platform superadmins are invisible to tenant admins.
        allowedIds = (await scopedUserIds()).filter((id) => !saIds.has(id) || id === caller.id);
        profilesQuery = profilesQuery.in("user_id", allowedIds);
      }

      const { data: profiles } = await profilesQuery;

      let rolesQuery = supabaseAdmin.from("user_roles").select("user_id, role");
      if (allowedIds) rolesQuery = rolesQuery.in("user_id", allowedIds);
      const { data: allRoles } = await rolesQuery;

      // Get emails from auth
      const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      
      const enriched = (profiles ?? []).map((p) => ({
        ...p,
        email: authUsers?.find((u) => u.id === p.user_id)?.email ?? "",
        roles: (allRoles ?? []).filter((r) => r.user_id === p.user_id).map((r) => r.role),
      }));

      return new Response(JSON.stringify({ users: enriched, can_manage: canMutate }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CREATE USER
    if (action === "create") {
      if (!canMutate) {
        return new Response(JSON.stringify({ error: "Sin permisos" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { email, password, full_name, role } = body;
      if (!email || !password || !full_name) {
        return new Response(JSON.stringify({ error: "Faltan campos requeridos" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Assign role if provided
      if (role && newUser.user) {
        await supabaseAdmin.from("user_roles").insert({
          user_id: newUser.user.id,
          role,
        });
      }

      // Bind the new user to the caller's business so tenant isolation holds.
      const targetTenant: string | undefined = body?.tenant_id ?? tenantIds[0];
      if (newUser.user && targetTenant && (isSA || tenantIds.includes(targetTenant))) {
        await supabaseAdmin.from("tenant_users").upsert(
          { tenant_id: targetTenant, user_id: newUser.user.id, is_owner: false },
          { onConflict: "tenant_id,user_id" }
        );
      }

      return new Response(JSON.stringify({ success: true, user_id: newUser.user?.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // UPDATE ROLE
    if (action === "update_role") {
      if (!canMutate) {
        return new Response(JSON.stringify({ error: "Sin permisos" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { user_id, role, remove } = body;
      if (!user_id || !role) {
        return new Response(JSON.stringify({ error: "Faltan campos" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!(await assertInScope(user_id))) return forbidden();

      if (remove) {
        await supabaseAdmin
          .from("user_roles")
          .delete()
          .eq("user_id", user_id)
          .eq("role", role);
      } else {
        await supabaseAdmin.from("user_roles").upsert(
          { user_id, role },
          { onConflict: "user_id,role" }
        );
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DELETE USER
    if (action === "delete") {
      if (!canMutate) {
        return new Response(JSON.stringify({ error: "Sin permisos" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { user_id } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id requerido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Don't allow deleting yourself
      if (user_id === caller.id) {
        return new Response(JSON.stringify({ error: "No puedes eliminarte a ti mismo" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!(await assertInScope(user_id))) return forbidden();

      await supabaseAdmin.from("tenant_users").delete().eq("user_id", user_id);
      await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id);
      await supabaseAdmin.from("profiles").delete().eq("user_id", user_id);
      await supabaseAdmin.auth.admin.deleteUser(user_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Acción no válida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
