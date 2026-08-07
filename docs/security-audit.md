# QW5 — Auditoría de seguridad de endpoints públicos

Fecha: 2026-08-07 · Alcance: las 5 edge functions declaradas con `verify_jwt = false` en `supabase/config.toml`, más el modelo multi-tenant y de roles.
Metodología: lectura del código de cada función, identificación de la superficie alcanzable sin JWT, y evaluación del peor caso explotable por un atacante anónimo que conoce la URL del proyecto y la clave publicable.

## Resumen

| Función | JWT | Guarda propia | Puede escribir con service_role | Veredicto | Acción |
|---|---|---|---|---|---|
| `check-superadmin` | no | exige `Authorization` y valida con `auth.getUser(token)` | solo lectura de `superadmins` | **Aceptable** | Ninguna. Es público por diseño, pero sin token válido no hace nada. |
| `register-superadmin` | no | compara `email` con el secreto `SUPERADMIN_EMAIL`; `createUser` falla si el usuario ya existe | sí (crea usuario + `superadmins` + rol admin) | **Medio** | Mantener. Solo explotable si el superadmin nunca fue creado **y** el atacante adivina su email. Recomendado: deshabilitar la función tras el bootstrap. |
| `api-v1` | no | exige `x-api-key` / `Bearer` validado contra `tenant_api_keys` | sí, acotado al tenant de la clave | **Aceptable** | Ninguna. Autenticación propia por API key; público por diseño (integraciones externas). |
| `webhook-dispatcher` | no | firma HMAC-SHA256 con el secreto del webhook al despachar | sí (marca entregas) | **Aceptable** | Ninguna funcional. Nota: el endpoint es interno; su superficie es una cola de entregas, no datos de negocio. |
| `ensure-demo-user` | no | ninguna sobre qué tenant se toca | sí: **crea un usuario con contraseña conocida y lo hace `is_owner` del tenant indicado** | **CRÍTICO** | **Corregido en esta auditoría** (ver abajo). |

## Hallazgo crítico — SEC-001 · Escalada de privilegios vía `ensure-demo-user`

**Antes:** la función aceptaba cualquier `tenant_id` de la tabla `tenants`. Un atacante anónimo podía llamarla con el id de un tenant **real** y el rol `admin`, y la función creaba (o reescribía la contraseña de) un usuario `admin.<slug>@demo.maria-os.app`, lo insertaba en `tenant_users` con `is_owner = true` y le asignaba el rol `admin`. Resultado: acceso administrativo completo a los datos de una empresa real, respetando las RLS (porque el atacante se convertía en miembro legítimo). La acción `list` además exponía el inventario completo de tenants activos.

Además existían tenants reales junto a los de demostración en la misma tabla: `Bar El Trópico`, `Restaurante La Mesa`, `TechStore Cuba` frente a `Bar MarIA Demo`, `Restaurante MarIA Demo`, `Retail MarIA Demo`.

**Corrección aplicada:** la función ahora solo opera sobre tenants de demostración (nombre que contiene `MarIA Demo`), tanto en `list` como en `ensure`. Cualquier otro `tenant_id` devuelve `403 not_a_demo_tenant`. No se cambió el contrato usado por `src/pages/Auth.tsx`, por lo que los 9 accesos rápidos de demo siguen funcionando.

**Verificación:** llamar la función con `tenant_id` de `TechStore Cuba` debe devolver 403; con `Retail MarIA Demo` debe devolver credenciales.

## Modelo de acceso — revisado, sin cambios

- Roles almacenados en tabla separada (`user_roles`) y leídos por la función `security definer` `has_role`. Correcto: no hay riesgo de escalada por columna de rol en `profiles`.
- Aislamiento multi-tenant vía RLS sobre `tenant_id` con `is_tenant_member` / `is_tenant_owner`. No se modificó ninguna política en esta auditoría.
- `SUPABASE_SERVICE_ROLE_KEY` se usa exclusivamente dentro de edge functions; ninguna referencia en `src/`.

## Deuda registrada (fuera del alcance del Sprint 0–30)

1. ~~`register-superadmin` debería deshabilitarse tras el bootstrap~~ · **Cerrado (SEC-002, Fase 5)**: si ya existe un superadmin, la función responde `403 bootstrap_already_completed`.
2. Las contraseñas de demo son fijas y conocidas: aceptable solo porque quedan confinadas a tenants de demostración tras SEC-001.
3. Falta rate limiting en `api-v1`. En `ensure-demo-user` **cerrado (SEC-003, Fase 5)**: 20 peticiones/minuto por IP, `429 rate_limited`.
4. Recomendado activar la comprobación de contraseñas filtradas (HIBP) en la configuración de autenticación.
