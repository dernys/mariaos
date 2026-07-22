import { defineTool } from "@lovable.dev/mcp-js";
import { authError, dbError, jsonResult, supabaseForUser } from "./_supabase";

export default defineTool({
  name: "list_tenants",
  title: "List tenants",
  description: "List the MarIA OS companies/tenants available to the signed-in user.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    const supabase = supabaseForUser(ctx);
    if (!supabase) return authError();

    const { data, error } = await supabase
      .from("tenants")
      .select("id, name, slug, business_type, email, phone, is_active")
      .eq("is_active", true)
      .order("name");

    if (error) return dbError(error.message);

    return jsonResult(`Found ${data?.length ?? 0} accessible tenants.`, { tenants: data ?? [] });
  },
});