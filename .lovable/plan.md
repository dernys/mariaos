# Auditoría del Marketplace MarIA OS — Diagnóstico y Arquitectura Recomendada

Auditoría sin cambios de código. Base: `src/pages/Marketplace.tsx`, `MarketplaceProduct.tsx`, `MarketplaceAuth.tsx`, `MisPedidos.tsx`, `PedidosOnline.tsx`, `src/hooks/useMarketplaceCart.ts`, `useMarketplaceData.ts`, `MarketplaceCartSheet.tsx`, y en base de datos `place_online_order`, `confirm_online_order`, `set_online_order_status`, políticas RLS de `online_orders` / `online_order_items` / `customer_addresses` / `product_reviews`.

## 1. Qué ya existe y funciona

- **Descubrimiento**: buscador con historial local y sugerencias de productos/negocios/categorías, panel de filtros (categoría, subcategoría, negocio, precio, marca), orden configurable, tarjetas con rating público (`product_ratings_public`), skeletons y chips de filtros activos.
- **Ficha de producto**: página propia con reseñas (`product_reviews`, visibles públicamente sólo `is_visible = true`), indicador de recogida/entrega y reseñas restringidas a compradores autenticados.
- **Carrito multi-vendedor**: agrupa por negocio (`tenant_id`) y sobrevive al login (localStorage).
- **Checkout guiado en 4 pasos**: carrito → datos → entrega → revisión, con validación de nombre/teléfono/dirección.
- **Pedido server-side real**: `place_online_order` valida tenant activo (`assert_public_tenant`), sesión obligatoria, producto perteneciente al tenant, `is_online`/`is_active`, stock (`FOR UPDATE`), calcula subtotal en servidor, crea/actualiza el `customers` del negocio y descuenta `online_stock`.
- **Cuenta del comprador**: registro sólo-comprador con verificación por email, `MisPedidos` con pedidos, ítems, seguimiento de repartidor en realtime, valoraciones y libreta de direcciones (`customer_addresses`, RLS `user_id = auth.uid()`).
- **Backoffice**: `PedidosOnline` con estados, eventos de pedido (`online_order_events`) y conversión a venta con asiento contable e inventario (`confirm_online_order`).
- **Aislamiento multi-tenant**: pedidos, ítems y eventos scoping por `tenant_id` / propiedad `user_id`; superadmin limitado a `sa_active_tenant()`.

## 2. Diagnóstico priorizado

### P0 — Riesgo real de dinero, duplicados o inconsistencia

1. **Sin idempotencia en el pedido.** `online_orders` no tiene clave de idempotencia y `place_online_order` no la acepta. Doble clic, reintento de red o reenvío del sheet crean pedidos duplicados con descuento doble de `online_stock`. (Amazon/ML: token de checkout de un solo uso.)
2. **Checkout multi-vendedor no atómico ni transaccional.** El sheet llama la RPC en bucle, un pedido por negocio. Si el 2º falla, el 1º ya existe y descontó stock, el carrito no se limpia y el reintento duplica el primer negocio. No hay concepto de "orden padre" ni de fallo parcial visible al comprador.
3. **Total del pedido incompleto respecto a la UI.** `place_online_order` fija `tax = 0`, ignora promociones activas y cupones (`promotions`, `coupons` existen y se muestran/aplican en el catálogo), y sólo aplica `delivery_fee` si recibe `p_zone_id` — el checkout actual nunca lo envía, así que **toda entrega a domicilio queda con costo de envío 0**. El precio mostrado con promoción y el cobrado pueden divergir.
4. **Stock descontado sin reserva ni devolución garantizada.** El descuento ocurre al crear el pedido, pero al cancelar/rechazar no hay retorno de `online_stock` en un único camino (`set_online_order_status` / cancelación) verificado; riesgo de stock fantasma permanente.
5. **Políticas duplicadas/solapadas en `online_orders`.** Existen dos políticas INSERT equivalentes (`Authenticated users can create own orders` y `Users can insert their own online orders`) y el comprador puede insertar filas directamente por PostgREST con sus propios `subtotal`/`total`, saltándose la RPC. La frontera de precios no es fail-closed.

### P1 — Funcionalidad esperada por un comprador de Amazon/ML/Shopify

6. **Carrito sólo en localStorage.** No hay `carts` server-side: sin continuidad entre dispositivos, sin recuperación de carrito abandonado, y precios/stock del carrito no se revalidan hasta el submit final (el usuario descubre el error recién en el último paso).
7. **Direcciones desconectadas del checkout.** El comprador gestiona direcciones en "Mis pedidos" pero el checkout pide dirección como texto libre; no se puede elegir dirección guardada ni marcar predeterminada, ni se selecciona zona de reparto.
8. **Sin cancelación ni devoluciones del lado comprador.** `MisPedidos` solo muestra estados. No hay "cancelar mientras está pendiente" ni solicitud de devolución/reembolso conectada al motor existente (`create_sale_return` / `process_sale_return` sólo backoffice).
9. **Sin favoritos/wishlist ni "volver a comprar".** No existe tabla ni UI (eBay/Amazon lo tratan como básico de retención).
10. **Pagos simulados.** `payment_method` por defecto `cash_on_delivery`; no existe intención de pago, ni estados de pago del lado comprador, ni comprobante. Aceptable para Cuba, pero debe declararse explícitamente como "pago contra entrega / en tienda" en la UI y en el modelo.
11. **Catálogo cargado en cliente con `limit(500)`.** Búsqueda, filtros y orden se hacen en memoria: no escala, resultados incompletos y sin paginación/infinite scroll ni facetas reales del servidor.
12. **Estados sin línea de tiempo para el comprador.** `online_order_events` sólo es legible-útil en backoffice; el comprador no ve historial ni ETA claro.

### P2 — Pulido, confianza y UX

13. **Autenticación**: sólo email+contraseña. Falta OTP/magic link (soportado por la infraestructura actual) y Google. **Passkeys/WebAuthn no son soportados nativamente por la plataforma de auth actual** — no deben prometerse; la alternativa compatible es OTP por email + sesión persistente.
14. **Guest checkout**: hoy es imposible pedir sin cuenta (bloqueo total en el paso "continuar"). Decisión de producto pendiente: recomendado **guest con verificación OTP del teléfono/email y conversión posterior a cuenta**, no anónimo puro (rompería la propiedad del pedido y el vínculo cliente-negocio).
15. **Sin reseñas verificadas por compra**, sin fotos en reseñas, sin preguntas al vendedor, sin política de devoluciones visible en la ficha.
16. **UX móvil**: existe bottom-sheet de carrito, pero faltan barra inferior persistente, "sticky add to cart" en la ficha, imágenes optimizadas/lazy consistentes y estados vacíos por negocio.
17. **Categorías**: se derivan del texto libre `products.category` en lugar del árbol real `product_categories`, así que la taxonomía es inconsistente entre negocios.

## 3. Arquitectura de compra recomendada

```text
Catálogo (server-side search + facetas)
   |  add_to_cart(client_uuid)
   v
Carrito servidor  carts / cart_items  (owner: user_id o guest_token)
   |  start_checkout()  -> checkout_session (precios y stock congelados N min)
   v
Revisión: direcciones guardadas + zona de reparto + envío + impuestos + cupón
   |  place_order(session_id, idempotency_key)   [1 RPC, 1 transacción]
   v
order_group (compra del comprador)
   +-- online_orders  (uno por tenant, hijo del grupo)
        +-- online_order_items  (precio congelado del snapshot)
        +-- reserva de stock  (liberada al cancelar/expirar)
   v
Estados: pending -> confirmed -> preparing -> ready/en_route -> delivered
         cancel/return -> devolución de stock + nota de crédito contable
```

Principios:
- **Un único punto de escritura**: el comprador nunca escribe `online_orders` directamente; se revocan sus políticas INSERT y todo pasa por RPC `SECURITY DEFINER` con `assert_public_tenant`.
- **Precio y stock siempre del servidor**, tomados del snapshot de la sesión de checkout; el cliente sólo envía `product_id` + `qty`.
- **Idempotencia**: `idempotency_key` único por comprador; reintento devuelve el mismo `order_group_id`.
- **Aislamiento multi-tenant intacto**: cada `online_orders` conserva su `tenant_id`; el grupo padre nunca se expone a los negocios (cada negocio ve sólo su pedido). Ninguna política nueva usa bypass de superadmin: se mantiene `sa_active_tenant()`.

## 4. Arquitectura de autenticación recomendada

- **Comprador**: registro self-service exclusivo del marketplace (ya implementado), ampliado con **OTP/magic link por email** y **Google**; contraseña opcional. Staff y admins siguen creados por superadmin/admin de tenant.
- **Continuidad de sesión catálogo→carrito→checkout→pedido**: carrito servidor ligado a `guest_token` (cookie/localStorage firmado) y **fusionado con el carrito del usuario al iniciar sesión**, en lugar de depender de que localStorage sobreviva.
- **Guest checkout** (si se aprueba): pedido creado con `guest_token` + contacto verificado por OTP; al registrarse con el mismo email, los pedidos se reasignan a `user_id`. Sin esto, mantener el bloqueo actual con mensaje claro.
- **Propiedad**: `online_orders.user_id` (o `guest_token`) es la única fuente de propiedad; consulta del pedido por link público sólo con token opaco de un solo pedido, nunca por `id` adivinable.
- **Rate limiting** en registro/OTP/place_order vía Edge Function.

## 5. Plan de ejecución sugerido (cuando se apruebe implementar)

1. **P0-A**: `idempotency_key` + `order_group_id` en `online_orders`, `place_order_group` transaccional multi-tenant, revocar INSERT directo del comprador, incluir impuestos/promociones/cupón/`delivery_fee` con zona en el cálculo del servidor y devolución de stock al cancelar.
2. **P0-B**: limpiar políticas duplicadas y añadir pruebas de aislamiento A/B para pedidos, ítems, direcciones y reseñas.
3. **P1**: carrito servidor + fusión al login, checkout con direcciones guardadas y zonas, cancelación y devolución del comprador, favoritos/volver a comprar, búsqueda y paginación server-side sobre categorías reales, timeline de estados para el comprador.
4. **P2**: OTP/Google, decisión sobre guest checkout, reseñas verificadas, refinamiento de UX móvil y confianza (políticas, envíos, tiempos).

## Notas técnicas

- No se propone ninguna pasarela de pago online: el modelo actual es pago contra entrega / en tienda y así debe quedar reflejado en UI y datos.
- Passkeys quedan fuera de alcance por limitación de la plataforma de auth actual.
- Toda validación de precio/stock permanece en funciones `SECURITY DEFINER` con `search_path` fijo, respetando el modelo GLOBAL/TENANT ya endurecido.
