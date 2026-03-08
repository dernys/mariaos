import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    // Check if caller is superadmin or admin
    const { data: isSA } = await supabaseAdmin.rpc("is_superadmin", { _user_id: caller.id });
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!isSA && !isAdmin) {
      return new Response(JSON.stringify({ error: "Sin permisos" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, ...body } = await req.json();

    // LIST USERS - get profiles with roles
    if (action === "list") {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, user_id, full_name, avatar_url, created_at")
        .order("created_at", { ascending: false });

      const { data: allRoles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role");

      // Get emails from auth
      const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      
      const enriched = (profiles ?? []).map((p) => ({
        ...p,
        email: authUsers?.find((u) => u.id === p.user_id)?.email ?? "",
        roles: (allRoles ?? []).filter((r) => r.user_id === p.user_id).map((r) => r.role),
      }));

      return new Response(JSON.stringify({ users: enriched }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CREATE USER
    if (action === "create") {
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

      return new Response(JSON.stringify({ success: true, user_id: newUser.user?.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // UPDATE ROLE
    if (action === "update_role") {
      const { user_id, role, remove } = body;
      if (!user_id || !role) {
        return new Response(JSON.stringify({ error: "Faltan campos" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

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
