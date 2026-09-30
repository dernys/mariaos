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
