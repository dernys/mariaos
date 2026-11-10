import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ is_superadmin: false, error: "No auth header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const superadminEmail = Deno.env.get("SUPERADMIN_EMAIL");
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !superadminEmail) {
      return new Response(JSON.stringify({ is_superadmin: false, error: "Authentication configuration unavailable" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = authHeader.slice(7);
    const { data, error } = await authClient.auth.getClaims(token);

    if (error || !data?.claims?.sub || data.claims.role !== "authenticated") {
      return new Response(
        JSON.stringify({ is_superadmin: false, error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const user = { id: data.claims.sub, email: data.claims.email };
    const isSuperadmin = typeof user.email === "string" && user.email === superadminEmail;
    // Privileged client is used only after cryptographic session validation.
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // If superadmin, ensure they're in the superadmins table
    if (isSuperadmin) {
      const { data: existing } = await supabase
        .from("superadmins")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!existing) {
        await supabase.from("superadmins").insert({ user_id: user.id });
      }

      // Also ensure they have admin role
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!existingRole) {
        await supabase.from("user_roles").insert({ user_id: user.id, role: "admin" });
      }
    }

    return new Response(
      JSON.stringify({ is_superadmin: isSuperadmin }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch {
    return new Response(
      JSON.stringify({ is_superadmin: false, error: "Unable to verify superadmin status" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
