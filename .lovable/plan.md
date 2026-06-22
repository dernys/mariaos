
# Rediseño profesional del Marketplace de MarIA OS

## 1. Diagnóstico del marketplace actual

**Funciona bien**
- Multi-tenant real (`tenants_public`, `stores_public`), checkout con RPC `place_online_order` (valida stock, multi-tenant).
- Geolocalización + cálculo Haversine por tenant.
- Carrito agrupado por negocio, deep link a `/auth` cuando no hay sesión.

**Debilidades**
1. **Diseño desalineado** con el sistema MarIA OS (verde plano emerald + gris, sin tokens semánticos, sin Space Grotesk/DM Sans).
2. **Buscador débil**: sin autosugerencias, sin búsquedas recientes, sin scope (producto/negocio/categoría).
3. **Filtros pobres**: solo categoría, negocio, delivery, distancia. Faltan: subcategoría, rango de precio, disponibilidad, sucursal, tipo de entrega, ofertas, rating, marca, tiempo de preparación.
4. **Sin ordenamiento explícito** (solo orden implícito por distancia).
5. **Cards básicas**: no muestran sucursal específica, tiempo estimado, badges (oferta/delivery), rating.
6. **Sin ficha de producto** — no hay galería, descripción extendida, relacionados, info del negocio, variantes.
7. **Mobile**: filtros viven en la barra superior y se vuelven inmanejables; falta drawer real.
8. **Sin chips de filtros activos**, sin "limpiar filtros", sin skeletons.

## 2. Arquitectura visual nueva

Adopta el sistema MarIA OS (memoria del proyecto):
- **Tema oscuro elegante** con superficie clara opcional para el marketplace público (modo "comercial premium"): bg `slate-950 / navy-deep`, superficies elevadas, acentos `emerald` semánticos vía tokens existentes en `index.css`.
- Tipografía: Space Grotesk (titulares), DM Sans (cuerpo).
- Tokens: usar `bg-background`, `text-foreground`, `bg-card`, `border-border`, `text-primary` (nunca `bg-emerald-600` hardcoded).
- Sombras suaves: nuevo token `--shadow-product`, `--shadow-elevated`.
- Radii consistentes (`rounded-2xl` para cards, `rounded-full` para chips).

## 3. Estructura de la nueva página

```text
┌─────────────────────────────────────────────────────────────┐
│ HEADER sticky: logo · buscador con autosugest · ubicación · │
│                 idioma · login · carrito                     │
├─────────────────────────────────────────────────────────────┤
│ HERO compacto + chips de categorías destacadas (scroll-x)   │
├─────────────────────────────────────────────────────────────┤
│ TOOLBAR sticky: [Filtros] · Ordenar por · Chips activos · X │
├─────────────────┬───────────────────────────────────────────┤
│ SIDEBAR FILTROS │ GRID PRODUCTOS (responsive 2/3/4/5)       │
│ (desktop)       │ Skeleton loaders                          │
│ Drawer (mobile) │ Estado vacío ilustrado                    │
└─────────────────┴───────────────────────────────────────────┘
   FAB carrito mobile · CTA flotante sticky
```

## 4. Filtros (sidebar desktop / drawer mobile)

Componente nuevo `MarketplaceFilters` con secciones colapsables:
- **Categoría / Subcategoría** (de `product_categories`, jerarquía padre→hijo).
- **Rango de precio** (slider doble min/max sobre el set visible).
- **Disponibilidad**: en stock, bajo stock, agotado.
- **Sucursal** (multi-select de `stores_public`).
- **Negocio** (multi-select de `tenants_public`).
- **Tipo de entrega**: delivery / pickup / ambos.
- **Distancia** (slider 1–25 km, requiere geolocalización).
- **Ofertas**: solo con descuento (tabla `promotions` activas).
- **Marca**: cuando exista (campo derivado del nombre/categoría; si no hay, se oculta).
- **Rating**: ≥3, ≥4, ≥5 (calculado vía agregado de reviews si existe; si no, oculto).
- **Tiempo estimado**: ≤15 / ≤30 / ≤60 min (usar `pos_settings.kitchen_prep_avg_min` por tenant cuando exista; fallback "—").

Comportamiento:
- Multi-selección, actualización en vivo (debounced 200 ms).
- Chips de filtros activos en la toolbar, con `×` individual y "Limpiar todo".
- Contadores por opción (`Bar (12)`).

## 5. Ordenamiento

Select compacto con: relevancia, más vendidos (orden por `total_sold` precomputado en vista pública o cálculo client-side), mejor valorados, menor precio, mayor precio, más cercanos, más nuevos, entrega más rápida, mayor descuento.

## 6. Buscador con autosugerencias

Componente nuevo `MarketplaceSearchBar`:
- Input grande sticky, `cmdk`-style popover.
- Sugerencias divididas en grupos: **Productos**, **Negocios**, **Categorías**.
- Coincidencia fuzzy client-side sobre el set ya cargado (rápido, sin RPC extra).
- Historial local (últimas 5 búsquedas) en `localStorage`.
- Atajos: `/` para enfocar, `Esc` para cerrar.

## 7. Product Card rediseñada

`MarketplaceProductCard` con:
- Imagen (lazy, aspect-square, placeholder por tipo de negocio).
- Badges top-left: **Oferta -%**, **Delivery**, **Nuevo**.
- Badge top-right: stock indicator (`En stock`/`Últimas X`/`Agotado` en color semántico).
- Nombre, descripción 1 línea.
- Precio + moneda local del tenant (CUP/USD).
- Footer: nombre del negocio + ícono · distancia · ⭐ rating (si hay) · 🕒 tiempo estimado.
- Botón `+` (añadir) o stepper si ya está en carrito.
- Click en card → ficha de producto.

## 8. Ficha de producto (`/marketplace/p/:id`)

Página nueva con:
- Galería (imagen principal + miniaturas, swipe en mobile).
- Header: nombre, badges, precio con tachado de antes si hay oferta.
- Selector de cantidad + CTA **Añadir al carrito** sticky en mobile.
- Pestañas: **Descripción** · **Negocio** (sucursal, dirección, horario, distancia, mapa estático) · **Entrega** (delivery/pickup, zonas, costo).
- **Productos relacionados** (misma categoría/tenant, 6 items).
- **Complementarios** (otros productos del mismo tenant, distinta categoría).
- Breadcrumbs y botón "Volver".

## 9. Checkout mejorado

- Mantener flujo actual (`place_online_order` RPC, login requerido para confirmar).
- Stepper visual: Carrito → Datos → Entrega → Confirmación.
- Pre-rellenar datos con `profiles` del usuario logueado.
- Mostrar **resumen por negocio** (cada tenant es un sub-pedido).
- **Pantalla de éxito** rediseñada con número de pedido, próximos pasos, link a "Mis pedidos".

## 10. Estados visuales

- **Skeletons**: 10 cards mientras carga.
- **Estado vacío de búsqueda**: ilustración + sugerencias para limpiar filtros.
- **Estado sin negocios en zona**: CTA para ampliar distancia.
- **Transiciones**: framer-motion fade+slide al cambiar filtros.

## 11. Mobile UX

- Header colapsable al hacer scroll (busca + carrito quedan visibles).
- Botón **Filtros** abre `Sheet` desde abajo (no lateral) en mobile, con CTA "Mostrar X resultados".
- Chips de categorías destacadas en scroll horizontal con snap.
- FAB de carrito + barra inferior con total y CTA siempre visible cuando hay items.

## 12. Integración real (sin datos ficticios)

Confirmaciones:
- Productos: `products` con `is_online=true`, `is_active=true`, `online_stock>0` (ya hecho).
- Stock real validado en checkout vía RPC (ya hecho).
- Sucursales reales: usar `stores_public` para sucursal por producto (warehouse_id→store opcional, fallback: primera sucursal del tenant).
- Moneda real: `tenants.default_currency` (añadir al `tenants_public` si falta).
- Tipo de negocio real: ya usado.
- Promociones reales: `promotions` activas joineadas al producto.

## 13. Validaciones técnicas

- ✅ Multi-tenant: filtros respetan `tenant_id`, checkout sigue creando un pedido por tenant.
- ✅ i18n: nuevas claves agregadas en `es.json` / `en.json` / `pt-BR.json` bajo `marketplace.*`.
- ✅ Moneda: usa `useLocale`/`formatCurrency` por tenant.
- ✅ Delivery: respeta `accepts_delivery` y `delivery_radius_km` de `stores_public`.
- ✅ Contabilidad / inventario: intacto, sigue pasando por `place_online_order`.
- ✅ Permisos: público para navegar; RLS de `online_orders` exige `auth.uid()`.
- ✅ Rendimiento: filtros client-side sobre set ya cargado, memoización con `useMemo`, virtualización solo si >200 items (no por ahora).

## 14. Plan de implementación

**Fase A — Fundaciones**
1. Crear hook `useMarketplaceData` (productos + tenants + stores + categorías + promos).
2. Definir tokens visuales del marketplace en `index.css` (variantes claras/oscuras del modo público).
3. Componentes nuevos en `src/components/marketplace/`:
   - `MarketplaceHeader.tsx`
   - `MarketplaceSearchBar.tsx` (con autosugest cmdk)
   - `MarketplaceFilters.tsx` (sidebar + drawer)
   - `MarketplaceSortSelect.tsx`
   - `ActiveFilterChips.tsx`
   - `MarketplaceProductCard.tsx`
   - `ProductCardSkeleton.tsx`
   - `EmptyState.tsx`

**Fase B — Página principal**
4. Reescribir `src/pages/Marketplace.tsx` componiendo lo anterior.

**Fase C — Detalle**
5. Crear `src/pages/MarketplaceProduct.tsx` y ruta `/marketplace/p/:id` en `App.tsx`.

**Fase D — Checkout & éxito**
6. Extraer carrito y checkout a `MarketplaceCartSheet.tsx` con stepper.
7. Pantalla de éxito rediseñada.

**Fase E — i18n y QA**
8. Añadir claves a los tres idiomas.
9. Smoke test con Playwright: navegación pública → filtro → detalle → añadir → login → checkout.

## Detalles técnicos

- Reusar `cmdk` ya disponible vía shadcn `Command`.
- `Slider` shadcn para rango de precio y distancia.
- `Sheet` shadcn lado `bottom` en mobile, `left` en desktop.
- Categorías jerárquicas: `product_categories` tiene `parent_id` (verificar con read_query antes de implementar).
- Promociones activas: filtro `is_active=true AND now() BETWEEN starts_at AND ends_at`.
- Tiempo de preparación: usar `pos_settings.avg_prep_minutes` si existe, sino ocultar el filtro y el campo.
- Rating: si `product_reviews` o similar no existe, se oculta el filtro y el badge — no se inventan estrellas.
- Marca: si no hay columna `brand`, derivar de la primera palabra del nombre solo si el tenant es `empresa`; si no, ocultar.

## Lista de cambios

**Aplicados (al finalizar)**
- Marketplace rediseñado mobile-first.
- 14 filtros + ordenamiento + autosugerencias + chips activos.
- Cards modernas con badges, stock, distancia, tiempo, sucursal.
- Ficha de producto con galería, relacionados, info del negocio.
- Checkout en stepper con resumen por negocio.
- Skeletons, estados vacíos, transiciones.
- i18n ES/EN/PT.

**Pendientes / requieren cambios de schema (informar al usuario)**
- Reviews/ratings (necesita tabla `product_reviews`).
- Marca (necesita columna `brand` en `products`).
- Tiempo de preparación por producto (hoy es por tenant).
- Sucursal exacta por producto (hoy `warehouse_id` → mapeo a sucursal opcional).

## Confirmación necesaria

¿Apruebas este plan tal cual, o quieres priorizar/recortar alguna fase (p.ej. dejar la ficha de producto para una segunda iteración)?
