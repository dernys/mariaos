# Internacionalización completa de MarIA OS

Sistema multilenguaje profesional, escalable y separado claramente de **locale**, **moneda funcional** y **perfil fiscal/contable**.

## Arquitectura

```text
Usuario  ─┐
Tenant   ─┼─►  resolver(prioridad)  ─►  i18next  ─►  UI + emails + reportes
Browser  ─┤                              │
es (fallback)                            └─► Intl (fechas/números/moneda)
```

- **Librería**: `i18next` + `react-i18next` + `i18next-browser-languagedetector` (estándar, soporta plurales, interpolación, lazy load por namespace).
- **Locales soportados**: `es` (default), `es-CU`, `pt-BR`, `en`, `en-US`.
- **Namespaces** (carga perezosa por módulo): `common`, `auth`, `nav`, `pos`, `inventory`, `purchases`, `suppliers`, `customers`, `hr`, `payroll`, `accounting`, `treasury`, `marketplace`, `delivery`, `reports`, `ai`, `audit`, `settings`, `emails`, `enums`.
- **Resolución** (en orden): `profiles.locale` → `tenants.default_locale` → `navigator.language` → `es`.
- **Persistencia**:
  - Columna nueva `profiles.locale text` (preferencia del usuario).
  - Columna nueva `tenants.default_locale text` (preferencia de la empresa).
  - `localStorage` como caché para arranque sin parpadeo.

## Locale ≠ Idioma ≠ Fiscal

Tres ejes independientes en `tenants`:

| Eje               | Columna                         | Ejemplo            | Uso                                    |
| ----------------- | ------------------------------- | ------------------ | -------------------------------------- |
| Idioma UI         | `default_locale`                | `pt-BR`            | `i18next.language`                     |
| Formato regional  | `default_locale` (mismo)        | `pt-BR`            | `Intl.NumberFormat`, `Intl.DateTimeFormat` |
| Moneda funcional  | `base_currency` (ya existe)     | `BRL`              | reportes contables, totales            |
| Perfil contable   | `accounting_profile_code` (ya)  | `BR-LucroPresumido`| plan de cuentas + impuestos            |
| País              | `country_code` (ya)             | `BR`               | impuestos por región (ICMS/ISS/ONAT)   |

Un tenant cubano puede operar en **pt-BR** mostrando precios en **CUP** y declarando en **DJ-09 ONAT** sin contradicciones.

## Datos traducibles (lookups con clave estable)

Los catálogos no se almacenan traducidos; se guardan por **código** y se traducen vía `enums` namespace:

- Estados de pedido / delivery / venta / pago
- Tipos de documento
- Roles, permisos
- Categorías por defecto
- Etiquetas de dashboard
- Mensajes del motor IA / agentes

Para datos del tenant (categorías custom, productos, etc.) se respeta el texto que el usuario escribió — no se traducen automáticamente.

## Fases de ejecución (incrementales)

### Fase 1 — Cimientos (este turno)
1. Instalar `i18next`, `react-i18next`, `i18next-browser-languagedetector`.
2. Crear `src/i18n/index.ts` (config), `src/i18n/locales/{es,pt-BR,en}/{common,nav,auth,enums,settings}.json` con strings base.
3. Migración: `profiles.locale`, `tenants.default_locale`.
4. Hook `useLocale()` que resuelve prioridad y cambia idioma en runtime.
5. Helpers `formatMoney(value, currency, locale)`, `formatDate(date, locale)`, `formatNumber(n, locale)`.
6. Selector de idioma global en el sidebar/topbar (persiste en `profiles.locale`).
7. Sección "Idioma de la empresa" en `ConfigGeneral.tsx` (persiste `default_locale`).
8. Traducir: AppSidebar, NavLink, Auth, ConfigGeneral, NotFound, header común.

### Fase 2 — Módulos operativos
POS, Inventario, Compras, Proveedores, Clientes, Ventas/Facturas.
Cada módulo extrae strings a su namespace, sustituye literales por `t('key')`, fechas/montos usan helpers.

### Fase 3 — Módulos financieros y RH
Contabilidad, Tesorería, Nómina, RRHH, Reportes.

### Fase 4 — Marketplace, Delivery, IA, Auditoría

### Fase 5 — Plantillas de email y PDF
Auth emails (scaffold con plantilla por locale), facturas PDF (`invoicePdf.ts`), tickets de impresión.

### Fase 6 — QA y limpieza
- Linter para detectar strings sin `t()`: `npx i18next-parser` integrado a CI.
- Inventario final de cobertura por módulo (% strings traducidos).

## Salida esperada al terminar Fase 1

- App arranca en idioma resuelto (usuario > tenant > navegador > es).
- Cambio de idioma desde la UI funciona en caliente.
- Sidebar/Auth/Config en 3 idiomas.
- Base lista para que las fases 2–6 sean repetitivas y rápidas (sustitución mecánica).

## Notas

- Plan de cuentas, nombres de impuestos legales (ICMS, ISS, ONAT-DJ08): **no traducir** — son nombres propios fiscales.
- Mensajes de error técnicos del backend (Postgres): se traducen en el catch del cliente vía `enums`.
- Plurales con `{count}` y `i18next` pluralization rules nativas.

---

**Confirma para arrancar la Fase 1** (instalación + cimientos + sidebar/auth/config en 3 idiomas). Las fases 2-6 las haremos por módulo en mensajes siguientes para mantener cada cambio revisable.