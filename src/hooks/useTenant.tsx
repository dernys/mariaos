import { useTenantContext } from "./useTenantContext";

/**
 * Negocio activo (única fuente de verdad).
 *
 * Antes resolvía la primera membresía del usuario en `tenant_users`, lo que para
 * un superadministrador devolvía un negocio distinto al seleccionado en el
 * selector de contexto (fuga cross-tenant visual en Turnos, Contabilidad, etc.).
 * Ahora delega en el contexto de tenant, sincronizado con el contexto server-side.
 */
export function useTenant(): string | null {
  const { tenantId } = useTenantContext();
  return tenantId;
}
