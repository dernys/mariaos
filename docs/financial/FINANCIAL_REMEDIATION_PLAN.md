# FINANCIAL REMEDIATION PLAN

## P0 — Critical (ejecutado en esta fase)

| # | Acción | Estado |
|---|--------|--------|
| 1 | Inmutabilidad del asiento contabilizado (fecha, empresa, número, serie; sin DELETE) | DONE |
| 2 | Inmutabilidad de las líneas de un asiento contabilizado | DONE |
| 3 | Garantía de partida doble en base de datos, no solo en la RPC de posteo (constraint trigger diferido) | DONE — probado: asiento `posted` desbalanceado rechazado al COMMIT |
| 4 | Bloqueo de asientos con fecha en período cerrado | DONE |
| 5 | Diagnóstico transversal `financial_health_check(p_tenant)` con severidad PASS/WARNING/CRITICAL por área | DONE |
| 6 | Centro de Control Financiero en la UI de Contabilidad | DONE |

## P1 — High

| # | Acción | Estado |
|---|--------|--------|
| 7 | Capa de mapeo contable configurable por empresa (`accounting_mappings` + `resolve_mapped_account`) | DONE (12 claves por empresa) |
| 8 | Moneda, tipo de cambio, módulo de origen, correlación y metadatos en cabecera y líneas del asiento | DONE (esquema); PARTIAL: las funciones de posteo aún no rellenan `currency` / `source_module` en todos los casos |
| 9 | Migrar las funciones de posteo de `find_account_by_codes` a `resolve_mapped_account` | NOT STARTED |
| 10 | Emitir `financial_events` desde nómina, bancos, delivery y fidelización, retirando el trigger legacy equivalente en la misma migración (Strangler) | NOT STARTED — riesgo de asiento duplicado si se activan las dos vías |
| 11 | Devengo de nómina (`accounts_payable` + asiento en la aprobación, no al pagar) | NOT STARTED |
| 12 | Crear cuentas de impuesto repercutido (2106) y acreditable (2107) en los planes y completar su mapeo | NOT STARTED |

## P2 — Medium

| # | Acción | Estado |
|---|--------|--------|
| 13 | Poblar `posting_rules.profile_code` (hoy NULL en las 19 reglas) para permitir reglas por perfil de país | NOT STARTED |
| 14 | Asiento propio para mercancía en tránsito (transferencias entre almacenes) | NOT STARTED |
| 15 | Estado de Flujo de Efectivo formal derivado del mayor | NOT STARTED |
| 16 | Drill-down uniforme asiento → documento origen para todos los `reference_type` | NOT STARTED |
| 17 | Editar en la UI los nuevos atributos del plan de cuentas (subtipo, control, categoría fiscal) | NOT STARTED |
| 18 | Normalizar la migración histórica `20260620193555` (`journal_entry_id`/`debit_amount`) | NOT STARTED |

## P3 — Enhancement

| # | Acción | Estado |
|---|--------|--------|
| 19 | E2E determinista compra → inventario → venta → cobro → contabilidad → reportes | NOT STARTED |
| 20 | Rentabilidad por tienda/almacén/cliente usando las nuevas dimensiones de la línea | NOT STARTED |
| 21 | Consolidar `useTenant` en `useTenantContext` | NOT STARTED |

## Método

Strangler en todos los casos: cada cambio se aplica por migración aditiva, con verificación SQL antes y después, y sin destruir información financiera. Nunca se activan dos vías de posteo para el mismo evento.
