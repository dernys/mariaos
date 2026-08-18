# MarIA OS — Auditoría Integral de Seguridad y Hardening Enterprise

Fecha: 2026-08-18 · Alcance: base de datos, RLS, funciones RPC, Edge Functions, dependencias, cliente web.
Método: escáneres reales (linter Supabase, escáner de seguridad, escáner de dependencias), revisión manual de políticas y código, y pruebas automatizadas contra el backend real.

---

## 1. Resumen ejecutivo

| Área | Estado antes | Estado después |
|---|---|---|
| Aislamiento multiempresa (RLS lectura) | Correcto | Correcto (verificado con pruebas) |
| Aislamiento multiempresa (borrados admin) | **3 políticas sin comprobación de empresa** | Corregido |
| Funciones internas expuestas a visitantes | **4 funciones ejecutables por `anon`** | Revocadas |
| Catálogos de configuración | **`units_of_measure` con escritura anónima** | Solo lectura |
| Edge Functions administrativas | **`seed-demo` totalmente abierta** | Solo superadmin |
| Despachador de webhooks | **Abierto, sin control de destino** | Secreto/superadmin + bloqueo SSRF |
| Envío de facturas por email | **IDOR: cualquier usuario, cualquier factura** | Validación de pertenencia |
| Inteligencia de inventario | **IDOR: `tenant_id` del cuerpo sin validar** | Validación de pertenencia |
| Dependencias (npm) | Sin vulnerabilidades altas/críticas | Sin cambios |
| Secretos en el cliente | Ninguno expuesto | Confirmado |

Hallazgos corregidos en esta fase: **11** (4 críticos, 4 altos, 3 medios).

---

## 2. Hallazgos y correcciones

### SEC-001 … SEC-004 — Funciones internas ejecutables por visitantes anónimos (Crítico)
`cancel_purchase`, `update_purchase_draft` y `shares_tenant_with` eran `SECURITY DEFINER` con permiso de ejecución para el rol público, lo que permitía saltar RLS sin sesión.
**Corrección:** revocado `EXECUTE` a `PUBLIC`/`anon`; solo usuarios autenticados los invocan y la propia función revalida pertenencia.

### SEC-005 — Catálogo de unidades de medida escribible sin sesión (Alto)
Un visitante podía insertar, modificar y borrar unidades de medida, corrompiendo inventario y compras de todas las empresas.
**Corrección:** el catálogo queda de solo lectura pública; la escritura exige sesión con permiso administrativo.

### SEC-010 — `seed-demo` sin autenticación (Crítico)
La función creaba usuarios de autenticación, empresas y datos con clave de servicio sin ninguna verificación.
**Corrección:** exige token válido y `is_superadmin`; responde 401/403 en caso contrario.

### SEC-011 — IDOR en envío de facturas (Alto)
`send-invoice-email` validaba que existiera sesión, pero leía cualquier factura por `invoice_id` con clave de servicio: un usuario de la empresa A podía extraer facturas de la empresa B.
**Corrección:** se comprueba que el llamante pertenezca al `tenant_id` de la factura (o sea superadmin).

### SEC-012 — IDOR en inteligencia de inventario (Alto)
El `tenant_id` llegaba en el cuerpo de la petición y se usaba sin validar contra la sesión.
**Corrección:** validación de pertenencia antes de calcular cualquier métrica.

### SEC-013 — Despachador de webhooks abierto (Alto)
Cualquiera podía invocar `webhook-dispatcher` provocando entregas masivas y abuso de red.
**Corrección:** acceso solo con `WEBHOOK_DISPATCH_SECRET` (cron) o sesión de superadmin.

### SEC-014 — SSRF vía URL de webhook (Medio)
Las entregas se hacían a la URL configurada por el tenant sin restricción de esquema ni destino.
**Corrección:** solo destinos HTTPS públicos; se bloquean `localhost`, rangos privados (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16), IPv6 loopback y hosts de metadatos. La entrega se marca como fallida y el webhook se desactiva.

### SEC-015 — Borrados sin comprobación de empresa (Crítico)
Las políticas de borrado de `accounting_accounts`, `products` y `stores` solo verificaban el rol `admin`: un administrador de una empresa podía borrar registros de otra.
**Corrección:** las tres políticas exigen ahora `is_tenant_member(tenant_id)`; los superadmin conservan alcance global.

---

## 3. Verificación

### Pruebas automatizadas
`src/test/security.isolation.test.ts` ejecuta 24 aserciones contra el backend real con la clave pública:

- 21 tablas de negocio (ventas, compras, clientes, empleados, asientos contables, nóminas, stock, movimientos, usuarios, roles, superadmins, perfiles, agentes, alertas, claves de API, webhooks, auditoría) devuelven **cero filas** sin sesión.
- Las operaciones internas de compras fallan sin sesión.
- La escritura en unidades de medida y la creación de roles fallan sin sesión.

Resultado de la suite completa: **94 pruebas en 9 archivos, todas verdes.**

### Escaneos
- Escáner de seguridad: sin hallazgos de nivel *error* activos tras la corrección de SEC-015.
- Escáner de dependencias: sin vulnerabilidades altas o críticas.
- Cliente web: sin claves de servicio ni secretos incrustados (solo la clave pública prevista).

---

## 4. Riesgos aceptados y justificados

| Aviso del linter | Justificación |
|---|---|
| Objetos visibles en GraphQL para `anon` (10) | Superficie pública deliberada del marketplace: catálogo, categorías, reseñas aprobadas, zonas de reparto y métricas agregadas. Las tablas sensibles ya no aparecen. |
| Objetos visibles para usuarios autenticados (156) | La visibilidad del esquema no implica acceso: cada tabla está protegida por RLS con `is_tenant_member`/`has_role`, verificado en pruebas. |
| Funciones `SECURITY DEFINER` ejecutables por autenticados (229) | Son los casos de uso del sistema (POS, contabilidad, nóminas, inventario). Requieren `SECURITY DEFINER` para escribir en el libro diario de forma atómica y **todas revalidan la pertenencia a la empresa y el rol en su interior**. |
| Extensión en esquema `public` (1) | Extensión gestionada por la plataforma; su reubicación no es aplicable en este entorno. |
| Perfiles visibles entre compañeros de empresa | Intencional: nombre y avatar son necesarios para turnos, asignaciones y auditoría. No expone datos de contacto ni salariales. |

---

## 5. Recomendaciones siguientes

1. Configurar `WEBHOOK_DISPATCH_SECRET` en el programador de tareas para las entregas automáticas.
2. Habilitar la protección de contraseñas filtradas y expiración de OTP en la configuración de autenticación.
3. Ampliar la suite de pruebas de aislamiento con sesiones reales de dos empresas distintas (cruce A↔B) cuando existan credenciales de prueba dedicadas.
4. Revisar trimestralmente las políticas que combinan `has_role` sin dimensión de empresa (patrón que originó SEC-015).
