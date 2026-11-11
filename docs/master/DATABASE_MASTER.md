# Base de datos

- ~140 tablas `public`, 185 migraciones, enums: app_role (admin, gerente, supervisor, cajero, inventarista, contador, empleado), agent_*, risk_severity.
- Stock: `product_stock` (por store/warehouse) es la **fuente**; `products.stock` es agregado mantenido por trigger. Regla: nunca escribir `products.stock` directamente.
- Movimientos: `inventory_movements` inmutable; `process_sale_stock` idempotente.
- Finanzas: `journal_entries` / `journal_entry_lines` (`entry_id`, `debit`, `credit`), `accounting_mappings`, `resolve_account_strict()`.
- Idempotencia: `operation_idempotency`, `client_uuid` en sync offline.
- Auditoría: `audit_trigger`, `activity_log`, `domain_events` (append-only).

Obsoleto/deuda: migración `20260620193555` usa nombres de columnas antiguos (no afecta runtime). 645+ avisos de linter preexistentes documentados.
- Regla de stock POS: tienda sin fila = 0 (online y servidor). Offline pendiente.
- 2026-11-10: auditados los 91 productos demo; totales coherentes con ubicaciones. Redistribución de 593 unidades existentes de Restaurante Terraza a Principal, 31 pares de movimientos `demo_pos_rebalance_20261110`, sin aumentar totales ni tocar negocios no demo. Las sucursales sin existencias no heredan stock de almacenes/global.
