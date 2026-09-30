# Multi-tenant y seguridad

Cadena: USER → tenant_users → user_roles/role_permissions → RLS (`is_tenant_member`, fail-closed para superadmin) → RPC (valida tenant) → Edge (`_shared/tenantScope.ts`).

Hecho:
- `sa_active_tenant()` y `superadmin_context` (modo tenant/global) en ~185 policies y 64 funciones.
- Turnos con triggers `enforce_shift_tenant_scope`.
- `EXECUTE` revocado a `anon` en RPC sensibles; vistas `security_invoker`.
- Policies migradas a `TO authenticated`; `ensure-demo-user` limitado a tenants demo + rate limit; `register-superadmin` bloqueado tras bootstrap.

Riesgos abiertos:
- Sin test automatizado de aislamiento entre dos usuarios autenticados de tenants distintos.
- `api-v1` sin rate limiting.
- Contraseñas demo fijas (aceptado, confinado a demos).
- HIBP no activado.
- Realtime y Storage: revisar canal por canal en P0-SEC-1.
