# MarIA OS — Auditoría Funcional

Fecha: 2026-08-08. Método: consultas SQL sobre la base real (147 tablas), lectura de código y ejecución de la suite de tests. No se marca nada como COMPLETA por la mera existencia de la pantalla.

Leyenda: COMPLETA · FUNCIONAL CON DEFECTOS · PARCIAL · MOCK · NO IMPLEMENTADA · ROTA

| Módulo | Funcionalidad | UI | Lógica | Persistencia | Contabilidad | Estado |
|---|---|---|---|---|---|---|
| POS (bar/rest/empresa) | Venta, pagos múltiples, fiado, ticket | ✓ | ✓ | ✓ | ✓ | COMPLETA |
| POS | Fiado sin cliente/empleado | ✓ | bloqueado | — | — | COMPLETA |
| Ventas | Detalle, impresión térmica, cancelación | ✓ | ✓ | ✓ | ✓ | COMPLETA |
| Devoluciones | `process_sale_return` + reverso contable | ✓ | ✓ | ✓ | ✓ | COMPLETA |
| Compras | Recepción, parcial, CxP | ✓ | ✓ | ✓ | ✓ | COMPLETA |
| Inventario | Kardex, ajustes, recetas, lotes, seriales | ✓ | ✓ | ✓ | ✓ | COMPLETA |
| Almacenes / Transferencias | Multi-tienda, portes, timeline | ✓ | ✓ | ✓ | parcial | FUNCIONAL CON DEFECTOS (valoración de tránsito sin asiento) |
| Clientes / Proveedores | Saldos, historial, server-side table | ✓ | ✓ | ✓ | ✓ | COMPLETA |
| Turnos y caja | Apertura única por tienda, PIN, cierre Z, waterfall | ✓ | ✓ | ✓ | ✓ | COMPLETA |
| Tesorería / Bancos | Conciliación, forecast | ✓ | ✓ | ✓ | parcial | PARCIAL (reglas `bank_*` sin emisor de eventos) |
| Nómina | Cálculo, pago, asiento | ✓ | ✓ | ✓ | ✓ | COMPLETA (corregido en esta fase) |
| Nómina | Devengo como CxP en aprobación | ✓ | — | — | — | NO IMPLEMENTADA |
| RRHH | Asistencia, horarios, vacaciones | ✓ | ✓ | ✓ | n/a | COMPLETA |
| Contabilidad | Plan de cuentas, asientos, períodos, cierre | ✓ | ✓ | ✓ | ✓ | COMPLETA |
| Reportes financieros | ER, BG, BC, Diario, Mayor | ✓ | ✓ | ✓ | ✓ | COMPLETA |
| Fiscalidad | Reglas por país/jurisdicción, declaraciones | ✓ | ✓ | ✓ | ✓ | COMPLETA (genérica) |
| Marketplace | Catálogo, pedidos, alta automática de cliente, reseñas | ✓ | ✓ | ✓ | ✓ | COMPLETA |
| Delivery | Zonas, repartidores, asignación realtime | ✓ | ✓ | ✓ | parcial | PARCIAL (comisión sin asiento automático) |
| Fidelización | Puntos, redenciones | ✓ | ✓ | ✓ | parcial | PARCIAL (regla `loyalty_accrual` sin emisor) |
| RBAC | Roles, permisos por módulo/acción | ✓ | ✓ | ✓ | n/a | COMPLETA |
| Multi-tenant | Aislamiento, superadmin, selector | ✓ | ✓ | ✓ | n/a | COMPLETA |
| IA / Agentes | Agent runner, riesgos, inventario, logística | ✓ | ✓ | ✓ | n/a | COMPLETA |
| Gemelo Digital / KG | Simulación, nodos y aristas | ✓ | ✓ | ✓ | n/a | COMPLETA |
| Event Store | `domain_events` en modo sombra | ✓ | ✓ | ✓ | n/a | COMPLETA (shadow) |
| `financial_events` | Motor de posteo por reglas | — | ✓ | ✓ | ✓ | PARCIAL (0 eventos emitidos) |
| MCP / API / Webhooks | Servidor MCP, API v1, dispatcher | ✓ | ✓ | ✓ | n/a | COMPLETA |
| PWA / offline | Cola offline, service worker | ✓ | ✓ | ✓ | n/a | COMPLETA |

## Errores de runtime revisados

- `column "tenant_id" does not exist` → `post_payroll_journal_entry` (corregido).
- `column "journal_entry_id" does not exist` → nomenclatura divergente en la migración `20260620193555`; el esquema real usa `journal_entry_lines.entry_id`. Las funciones vivas ya son correctas (documentado como deuda).
- `Failed to connect to MetaMask` → extensión del navegador del usuario, ajeno a la aplicación.

## Verificaciones estructurales

- 0 líneas contables huérfanas, 0 cuentas sin tipo, 0 cuentas huérfanas de padre.
- Compras `pending/draft` sin asiento: comportamiento correcto (solo se postea a partir de la recepción).
