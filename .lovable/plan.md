# Demos maestras + Demo Experience — Diagnóstico real y plan de ejecución

Inspección completada sobre la base de datos y el código actuales. **No he modificado nada**: hay dos puntos destructivos ambiguos que requieren tu decisión antes de ejecutar (regla de aborto que tú mismo fijaste).

## 1. Estado real encontrado

**Negocios existentes (9):**

| Negocio | Tipo | Activo | is_demo | Usuarios | Productos | Ventas | Veredicto |
|---|---|---|---|---|---|---|---|
| TechStore Cuba | empresa | sí | sí | 5 | 33 | 35 | Candidato a plantilla **TIENDA** |
| Bar El Trópico | bar | sí | sí | 3 | 27 | 25 | Candidato a plantilla **BAR** |
| Restaurante La Mesa | restaurant | sí | sí | 3 | 31 | 20 | Candidato a plantilla **RESTAURANTE** |
| Bar MarIA Demo | bar | no | no | 4 | 20 | 8 | Demo legado (slug `demo-bar`) |
| Restaurante MarIA Demo | restaurant | no | no | 4 | 24 | 8 | Demo legado |
| Retail MarIA Demo | empresa | no | no | 4 | 25 | 8 | Demo legado |
| La cubana | empresa | sí | no | 1 | 0 | 0 | **Ambiguo** |
| Yeni Paladar | empresa | sí | no | 1 | 0 | 0 | Real (cuenta Gmail) |
| EsPerez | empresa | sí | no | 0 | 0 | 0 | **Ambiguo** (huérfano sin usuarios) |

**Hallazgos de aislamiento / higiene:**
- Ningún usuario pertenece a dos negocios (0 cruzados). Correcto.
- Cuenta legado `demo-bar@gaia.app` está dada de alta como usuario de **TechStore Cuba** (nombre incoherente, residuo de sembrado antiguo).
- La cubana tiene como único usuario la cuenta legado `demo-empresa@gaia.app` → no puedo determinar si es un negocio real de un cliente o basura de pruebas.
- EsPerez existe activo y sin ningún usuario (huérfano).

**Mecanismo de demos actual:**
- No existe ninguna función de clonación (`clone_demo_template` no existe; solo `public_demo_stats` e `import_chart_template`).
- La landing entra a los demos con `ensure-demo-user` (edge function pública, contraseña fija `Demo2026!`), que **da acceso directo al negocio demo compartido** — es decir, hoy los visitantes escriben sobre lo que serán las plantillas maestras.
- `seed-demo` (615 líneas) es un sembrado ad-hoc paralelo con catálogos por vertical.
- `tenants` no tiene marca de plantilla ni de expiración: solo `is_demo`.

## 2. Puntos de aborto — necesito tu decisión

No ejecuto ninguna eliminación hasta que confirmes:

1. **La cubana / EsPerez**: ¿son negocios reales o basura? Si no lo confirmas, los dejo intactos y solo los reporto.
2. **Los 3 "MarIA Demo" legado** (inactivos, con 8 ventas y asientos cada uno): ¿archivar y eliminar, o solo quarantine (renombrar `LEGACY-…`, mantener inactivos)? Borrarlos implica cascada sobre ventas, pagos, inventario y asientos contables; mi recomendación es **quarantine**, no DELETE.

## 3. Plan de ejecución (una vez decidido)

### Fase 1 — Snapshot y marcado (migración)
- Tabla `demo_archive_snapshots` con volcado JSON verificable de los negocios afectados antes de cualquier cambio.
- Nuevas columnas en `tenants`: `is_master_template`, `template_type` (`tienda|bar|restaurante`), `cloned_from_template`, `demo_expires_at`, con índices.
- Marcar TechStore Cuba → TIENDA, Bar El Trópico → BAR, Restaurante La Mesa → RESTAURANTE como `is_master_template = true`.
- Higiene: retirar la membresía incoherente `demo-bar@gaia.app` de TechStore Cuba.

### Fase 2 — Inmutabilidad de las plantillas
- Trigger/guard `guard_master_template_write`: cualquier escritura en tablas operativas de un negocio marcado como plantilla se rechaza salvo superadmin en contexto de ese negocio. Fail-closed, sin relajar RLS existente.
- Las plantillas dejan de ser accesibles por los usuarios demo públicos.

### Fase 3 — Completar las 3 plantillas
Auditoría campo a campo por plantilla y relleno **solo de los huecos reales** (impuestos, mappings contables, almacén/local, mesas/áreas, recetas, proveedores, compras, CxC/CxP, turno con caja). Verificación: 0 stock negativo, DEBE=HABER, 0 asientos huérfanos.

### Fase 4 — Usuarios y roles por plantilla
Un usuario demo por rol y por plantilla, tenant-scoped y con mínimo privilegio: Admin, Gerente, Cajero, Inventario; Mesero/Cocina en bar y restaurante. Nunca se clona el SuperAdmin.

### Fase 5 — Clonación única server-side
- RPC `clone_demo_template(template_type)`: atómica, idempotente por clave de idempotencia, auditada, IDs nuevos, sin identidades privilegiadas, con validación final de aislamiento. Copia configuración, catálogo, stock, terceros, contabilidad y un set mínimo de operaciones (venta con pago mixto, compra, turno) para que las pantallas financieras tengan contenido.
- Edge function `clone-demo-template` que llama al RPC y crea los usuarios demo del clon.
- La landing pasa a usar **exclusivamente** esa vía; `seed-demo` y el acceso directo de `ensure-demo-user` a las plantillas quedan retirados.

### Fase 6 — Demo Experience
Recorrido guiado sobre las pantallas reales del clon: Dashboard → venta → pago mixto → inventario → turno/caja → CxC/CxP → compras → utilidad → contabilidad/auditoría → multi-local. Muestra siempre el nombre del demo, nunca IDs, tablas ni credenciales de otros negocios. Expiración por `demo_expires_at` con la limpieza existente.

### Fase 7 — Pruebas y evidencia
Batería A/B/C de aislamiento (Tienda no ve Bar ni Restaurante), manipulación de `tenant_id` desde el cliente, SuperAdmin global vs. dentro de negocio, dos demos simultáneos, clonación repetida, POS/inventario/pagos/CxC/CxP/contabilidad por demo, DEBE=HABER, y security scan (básico y profundo). Solo declaro PASS con salida real de cada prueba.

## 4. Detalles técnicos
- Sin segundo motor multi-tenant: reutilizo `sa_active_tenant()`, `assert_tenant_access()`, `resolve_account_strict`, `audit_trigger`, `data_backups` y el catálogo de mappings existentes.
- Cualquier función nueva será `SECURITY DEFINER` solo si es imprescindible, con `search_path` explícito y `EXECUTE` restringido a `authenticated`/`service_role`.
