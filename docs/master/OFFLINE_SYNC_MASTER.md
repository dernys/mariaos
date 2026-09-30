# Offline y sincronización

**No es offline-first completo.** Almacenamiento: Dexie 4 / IndexedDB (`maria_offline_v1`). No hay SQLite.

Cumple por operación (`PendingOp`): client_uuid (idempotencia), tenant_id, user_id, device_id, created_at, attempts/last_error, depends_on, status incl. `conflict`. Servidor: `sync_offline_operation` idempotente por client_uuid.

Falta:
- Snapshot de `product_stock` por tienda (el POS offline usa stock global).
- Reconciliación server de stock (conflicto solo detectado por texto de error).
- Pruebas multi-device y de corte a mitad de sync.
- Detección de conflictos por regex de mensajes (frágil) → migrar a códigos de error.
