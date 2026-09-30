# Decisiones (ADR breves)

1. Offline con Dexie/IndexedDB, no SQLite — nativo en navegador/PWA.
2. `product_stock` es fuente de stock; `products.stock` es agregado por trigger — evita dos verdades.
3. Superadmin opera con contexto de tenant server-side (`superadmin_context`); modo global explícito — evita fugas.
4. Cuentas contables solo por `resolve_account_strict()` fail-closed — el maestro gobierna.
5. Operaciones económicas por RPC atómicas e idempotentes — invariantes en BD, no en React.
6. Marketplace público con vistas `security_invoker` y grants por columna — exposición mínima.
7. `/docs/master/` prevalece sobre documentación histórica de `/docs`.
