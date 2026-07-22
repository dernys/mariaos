import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

type ToolError = {
  content: [{ type: "text"; text: string }];
  isError: true;
};

export function authError(): ToolError {
  return {
    content: [{ type: "text", text: "Authentication is required to use MarIA OS MCP tools." }],
    isError: true,
  };
}

export function supabaseForUser(ctx: ToolContext) {
  const token = ctx.getToken();
  if (!token) return null;

  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function assertTenantAccess(ctx: ToolContext, tenantId: string) {
  const supabase = supabaseForUser(ctx);
  if (!supabase) return { ok: false as const, error: authError() };

  const { data, error } = await supabase
    .from("tenant_users")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("user_id", ctx.getUserId())
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      error: { content: [{ type: "text" as const, text: error.message }], isError: true as const },
    };
  }

  if (!data) {
    return {
      ok: false as const,
      error: {
        content: [{ type: "text" as const, text: "You do not have access to this tenant." }],
        isError: true as const,
      },
    };
  }

  return { ok: true as const, supabase };
}

export function jsonResult(text: string, structuredContent: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent,
  };
}

export function dbError(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}