# Changelog de desarrollo

## 2026-11-10 — Existencias de los tres demos y POS
- Revisados 91 productos: Bar 27 (3208 unidades), Restaurante 31 (4074), TechStore 33 (4320). Totales iguales a la suma por ubicación, sin negativos ni ubicaciones cruzadas; no se reemplazaron por cantidades inventadas.
- Hallazgo: turno restaurante en Principal sin stock disponible; Terraza tenía 1206 unidades. Redistribuidas 593 unidades existentes (mitad entera por producto) de Terraza a Principal, conservando cada total; 62 movimientos `demo_pos_rebalance_20261110`, 31 pares balanceados e idempotencia por producto. Principal queda con 31 filas; Terraza conserva 613 unidades. Datos corregidos por herramienta de escritura, sin cambios de esquema.
- Huellas sin cambios: existencias de negocios no demo `44629a4d6aea57ad8cef9e8f511a72fe`; campos de catálogo ajenos a stock/updated_at `e51f785bf0bd7b1ede060abd9243e19d`. Bar y TechStore ya coherentes: sin reasignación arbitraria; Pan, Pan Boom 40g y Aceite (L) siguen agotados.
- `usePOSStock` invalida contexto anterior, descarta respuestas tardías y falla cerrado al cargar con error; refresca al recuperar conexión. Cantidades de tienda visibles en Bar y ambos listados Restaurante; recetas mantienen la regla existente sin cifra de producto final.
- Verificados los tres demos desde selector público hasta POS con consultas autenticadas: cantidades de muestra coinciden. Restaurante permite 8 Arroz Congri y bloquea el noveno clic. Sin venta/cobro ni consumo de recetas ejecutados; offline y venta final siguen sin certificar.

## 2026-11-10 — Error 401 de check-superadmin
- Seguimiento: el cambio de secuencia interna del hook podía conservar estado incompatible durante Fast Refresh (`Should have a queue` en el siguiente hook, `usePermissions`). Añadido `@refresh reset` y tres tests del ciclo de sesión; verificación nueva con sesión real sin excepciones runtime y todas las comprobaciones HTTP 200 (10/10 tests).
- Reproducido HTTP 401 con sesión real antes de la corrección. Validación actualizada a `getClaims()` compatible con signing keys y cliente de autenticación separado del cliente privilegiado; identidad de superadmin sigue determinada por configuración server-side.
- Comprobación cliente centralizada: sesión hidratada explícita, renovación preventiva y un único reintento tras 401. Redirección y hook dejan de derivar privilegios de sessionStorage; resultados de sesiones anteriores se descartan.
- Función desplegada y verificada: sesión real HTTP 200 (`false`, usuario normal), token inválido HTTP 401; 7 tests pasan y `/auth` conduce a dashboard visible en `/app`. Cuenta superadmin no probada. Sin migraciones ni cambios de reglas multi-tenant.

## 2026-11-10 — Nombres del restaurante demo
- Hallazgo: los 31 productos de Restaurante La Mesa tenían `name = sku`; el POS mostraba directamente esos valores. El historial de auditoría conservaba los nombres originales y cambios con el valor `hijacked`.
- Corrección de datos: restaurados los 31 nombres originales, por SKU y exclusivamente en el tenant demo restaurante. Sin cambios de código, esquema, precios, stock, recetas ni documentos históricos.
- Validación: 31 productos, 0 nombres vacíos o iguales al SKU. Huella de todos los campos excepto nombre/fecha de actualización idéntica antes y después (`c3089d162a8effc56db729cdee41e8bf`).
- Verificación autenticada: acceso desde el selector público de demos → `/app` → `/pos`; nombres recuperados visibles en escritorio y móvil. Registro en `TESTING_MASTER.md`.
- Alcance: se recuperó el catálogo actual; no se reescribió el historial de ventas/cocina ni se atribuyó la causa de los cambios a un actor sin evidencia adicional.

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
