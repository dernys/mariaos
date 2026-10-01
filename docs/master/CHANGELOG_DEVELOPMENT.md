# Changelog de desarrollo

## 2026-09-30 — Sistema MASTER
- Objetivo: crear control maestro del desarrollo desde el estado real.
- Estado anterior: documentación dispersa en `/docs`, parte obsoleta.
- Cambios: 14 ficheros en `/docs/master/`. Sin cambios de código, BD ni Edge Functions.
- Riesgos: ninguno. Tests: no aplica.
- Deuda generada: ninguna.
- Siguiente tarea: P1-TX-1 / P1-TX-2 (stock por tienda en POS y checkout).

## Anterior (resumen)
- Trigger de sincronización `products.stock` ← `product_stock` y corrección de totales (sesión previa, sin prueba de venta completa).
- Corrección de clave de idempotencia en el asistente de crear negocio.

## 2026-09-30 — P1-TX-1/2 Stock por tienda
- `pos_checkout`: en tienda, sin fila `product_stock` ⇒ disponible 0; respeta `pos_settings.allow_negative_stock`.
- Frontend: regla única `src/lib/pos/stockRule.ts` usada por `usePOSStock` (Tienda/Bar/Restaurante); hasta cargar, 0.
- Tests: `stockRule.test.ts` 4/4. Pendiente: venta E2E real y snapshot offline por tienda.
- Siguiente: P1-OFF-1 snapshot `product_stock` por tienda; luego P0 test cross-tenant autenticado.
