// Centralized tenant scoping for edge functions.
// The tenant is NEVER trusted from the request body: it is validated against
// the caller's membership, or (for superadmins) against the server-side
// active tenant context (public.superadmin_context).
//
// GLOBAL MODE: only a superadmin that explicitly switched to mode='global'
// (Gestión de Empresas) may operate across tenants.

// deno-lint-ignore no-explicit-any
type Admin = any;

export interface TenantScope {
  tenantId: string | null;
  isSuperadmin: boolean;
  globalMode: boolean;
  /** Tenants the caller may legitimately touch (empty in global mode = all) */
  allowedTenantIds: string[];
  error?: { message: string; status: number };
}

export async function resolveTenantScope(
  admin: Admin,
  callerId: string,
  requested?: string | null,
): Promise<TenantScope> {
  const [{ data: isSA }, { data: memberships }] = await Promise.all([
    admin.rpc("is_superadmin", { _user_id: callerId }),
    admin.from("tenant_users").select("tenant_id").eq("user_id", callerId),
  ]);

  const myTenants: string[] = (memberships ?? []).map((m: { tenant_id: string }) => m.tenant_id);

  if (isSA) {
    const { data: ctx } = await admin
      .from("superadmin_context")
      .select("tenant_id, mode")
      .eq("user_id", callerId)
      .maybeSingle();

    const globalMode = ctx?.mode === "global";
    if (globalMode) {
      return { tenantId: requested ?? null, isSuperadmin: true, globalMode: true, allowedTenantIds: [] };
    }

    const active: string | null = ctx?.tenant_id ?? null;
    if (!active) {
      return {
        tenantId: null,
        isSuperadmin: true,
        globalMode: false,
        allowedTenantIds: [],
        error: { message: "Sin negocio activo seleccionado", status: 403 },
      };
    }
    if (requested && requested !== active) {
      return {
        tenantId: null,
        isSuperadmin: true,
        globalMode: false,
        allowedTenantIds: [active],
        error: { message: "Acceso denegado: negocio fuera del contexto activo", status: 403 },
      };
    }
    return { tenantId: active, isSuperadmin: true, globalMode: false, allowedTenantIds: [active] };
  }

  if (requested && !myTenants.includes(requested)) {
    return {
      tenantId: null,
      isSuperadmin: false,
      globalMode: false,
      allowedTenantIds: myTenants,
      error: { message: "Acceso denegado a este negocio", status: 403 },
    };
  }

  const tenantId = requested ?? myTenants[0] ?? null;
  if (!tenantId) {
    return {
      tenantId: null,
      isSuperadmin: false,
      globalMode: false,
      allowedTenantIds: myTenants,
      error: { message: "Sin negocio asignado", status: 403 },
    };
  }
  return { tenantId, isSuperadmin: false, globalMode: false, allowedTenantIds: myTenants };
}
