# 🗺️ Blueprint — Roadmap hacia un ERP Profesional

Este documento describe los módulos y mejoras pendientes para convertir **VentaPro** en un ERP completo y competitivo, con foco en **almacenes profesionales, transferencias entre ubicaciones, contabilidad avanzada, compras, CRM, RRHH y BI**.

> Convención: 🔴 Crítico · 🟠 Alto · 🟡 Medio · 🟢 Mejora

---

## 1. 📦 Inventario Avanzado 🔴

### 1.1 Stock multi-ubicación profesional
- Stock por **almacén + ubicación interna** (pasillo / estante / bin location).
- **Lotes y números de serie** (trazabilidad completa).
- Fechas de **caducidad** con alertas FEFO (First-Expired-First-Out).
- Control **FIFO / LIFO / Coste medio ponderado** (configurable por producto).
- **Unidades de medida múltiples** (caja, palet, unidad) con factores de conversión.

### 1.2 Transferencias entre almacenes/tiendas 🔴
- Documento de **Transferencia** con estados: borrador → enviado → en tránsito → recibido → discrepancias.
- Picking list y packing list imprimibles.
- Confirmación de recepción con escaneo de código de barras.
- Diferencias de transferencia → ajuste automático y notificación.
- Tabla nueva: `stock_transfers`, `stock_transfer_items`, `stock_transfer_history`.

### 1.3 Inventarios físicos / conteos cíclicos
- Plantillas de conteo (total, parcial, ABC).
- Hojas de conteo con app móvil / escáner.
- Reconciliación automática y generación de ajustes.

### 1.4 Reservas de stock
- Stock **disponible** vs **reservado** vs **comprometido**.
- Reservas para pedidos online, pre-ventas, presupuestos confirmados.

### 1.5 Valoración y kardex
- **Kardex** por producto (entradas/salidas valoradas).
- Reporte de valoración de inventario a fecha.
- Coste medio recalculado automáticamente en cada compra.

---

## 2. 🛒 Compras y Proveedores 🔴

- CRUD de **Proveedores** (datos fiscales, condiciones de pago, descuentos, lead time).
- **Solicitudes de compra** internas (departamento → compras).
- **Órdenes de compra (PO)** con aprobaciones multinivel.
- Recepción de mercancía con check de cantidades + control de calidad.
- **Facturas de compra** ligadas a PO; conciliación 3-way (PO ↔ recepción ↔ factura).
- Historial de precios por proveedor, comparativa de ofertas.
- Devoluciones a proveedor (RMA).
- Sugerencias automáticas de reposición (punto de pedido + stock mín/máx).

---

## 3. 💰 Contabilidad Profesional 🔴

### 3.1 Plan contable
- **Plan General Contable** configurable (ES/LATAM/IFRS).
- Cuentas analíticas / centros de coste.
- Ejercicios fiscales con apertura/cierre y asientos de regularización.

### 3.2 Asientos automáticos
- Generación automática desde: ventas POS, compras, nóminas, transferencias, ajustes inventario.
- **Asientos manuales** con validación de partida doble.
- Plantillas de asientos recurrentes.

### 3.3 Libros y reportes oficiales
- Diario, Mayor, Sumas y saldos.
- **Balance de situación** y **Pérdidas y Ganancias** parametrizables.
- Libro de IVA repercutido / soportado.
- Modelo 303, 347, 390 (España) — exportables.

### 3.4 Tesorería
- Cuentas bancarias y caja.
- **Conciliación bancaria** (importación CSV / OFX / API bancaria).
- Previsión de cobros y pagos.
- Remesas SEPA.

### 3.5 Activos fijos
- Registro de activos, amortizaciones automáticas, bajas.

---

## 4. 💵 Facturación Avanzada 🟠

- Numeración configurable por serie y tienda.
- **Facturación electrónica** (Facturae, FacturaE, Verifactu, SII en España).
- **TicketBAI** (País Vasco) y normativas regionales.
- Facturas rectificativas, abonos, anticipos.
- Plantillas PDF personalizables por tenant.
- Envío automático por email + portal del cliente.
- Facturación recurrente (suscripciones).

---

## 5. 👥 CRM 🟠

- Pipeline de **oportunidades** (kanban: lead → contacto → propuesta → ganada/perdida).
- Presupuestos / cotizaciones con conversión a pedido/factura.
- Historial 360° del cliente (ventas, tickets, comunicaciones).
- Segmentación y campañas de email marketing.
- **Programa de fidelización**: puntos, niveles, cupones.
- Integración con WhatsApp Business / SMS.

---

## 6. 👨‍💼 Recursos Humanos y Nóminas 🟠

- Expediente de empleado completo (contrato, documentación, formación).
- **Control horario** (fichaje con QR / biometría / app).
- Calendario laboral, vacaciones, ausencias, permisos.
- **Nóminas** con cálculo de IRPF, SS, conceptos variables.
- Generación de recibos PDF y SEPA de pago.
- Evaluaciones de desempeño y objetivos.

---

## 7. 🍽️ Restaurante / Bar — Avanzado 🟡

- **Reservas online** con calendario + confirmación por email/SMS.
- Gestión de **lista de espera** y mesas combinables.
- **Comandas en sala** con tablet/móvil del camarero.
- Modificadores y variantes (sin gluten, extra queso…).
- **Menú QR** público para clientes en mesa.
- Propinas, división por comensal, transferencia de cuenta entre mesas.
- Gestión de **eventos y catering**.

---

## 8. 🚚 Logística y Delivery 🟡

- **Rutas de reparto** optimizadas (integración con OpenRouteService / Google Maps).
- Asignación de pedidos a repartidores.
- App / vista para repartidor con estado en tiempo real.
- Tracking público para el cliente final.
- Integración con couriers (DHL, GLS, SEUR, MRW).

---

## 9. 🏭 Producción / MRP 🟡

- Órdenes de fabricación basadas en BOM (recetas).
- Planificación de necesidades de material (MRP).
- Centros de trabajo y rutas de producción.
- Trazabilidad de lotes producidos.

---

## 10. 🛍️ E-commerce / Marketplace — Mejoras 🟠

- **Pasarelas de pago** (Stripe, Redsys, Bizum, PayPal).
- Cuentas de cliente con direcciones múltiples y wishlist.
- Reviews y valoraciones de productos.
- Cupones de descuento y promociones (2x1, % por categoría, BOGO).
- SEO avanzado: sitemap, schema.org, Open Graph, slugs.
- Multi-idioma y multi-moneda en el storefront.
- Integración con marketplaces externos (Amazon, eBay, Glovo, Uber Eats).

---

## 11. 📊 Business Intelligence 🟠

- Dashboard configurable por usuario (drag & drop widgets).
- **Cubos OLAP** para ventas, márgenes, rotación.
- Reportes programados (envío diario/semanal por email).
- Exportación a Excel/PDF/CSV en todos los listados.
- Comparativas multi-tienda y multi-período.
- Pronósticos de demanda con IA (Lovable AI Gateway).

---

## 12. 🤖 Automatización e IA 🟢

- Asistente IA para consultas en lenguaje natural ("ventas de azul el mes pasado").
- Sugerencias automáticas de reposición basadas en histórico + estacionalidad.
- Detección de anomalías en ventas/inventario.
- OCR de facturas de compra → alta automática.
- Chatbot de atención al cliente para el marketplace.

---

## 13. 🔔 Notificaciones y Comunicación 🟡

- Sistema de notificaciones in-app (campana).
- Push notifications (PWA / móvil).
- **Email transaccional** (pedido recibido, factura, recordatorios).
- WhatsApp / SMS para confirmaciones y recordatorios.
- Webhooks salientes configurables por evento.

---

## 14. 🔐 Seguridad y Cumplimiento 🟠

- **Auditoría completa** de acciones (quién, qué, cuándo) en todas las tablas críticas.
- 2FA / MFA por usuario.
- SSO con Google / Microsoft / SAML.
- **Políticas RGPD**: exportación y borrado de datos del cliente.
- Backups programados y restauración punto en el tiempo.
- Cifrado de datos sensibles en reposo.

---

## 15. 📱 App Móvil 🟡

- App PWA instalable (offline-first para POS y comandas).
- App nativa con Capacitor para escáner de código de barras y impresión Bluetooth.

---

## 16. 🔌 Integraciones 🟢

- API REST pública documentada (OpenAPI).
- Webhooks entrantes/salientes.
- Conectores: Holded, Sage, A3, Contasol, ContaPlus.
- TPV físicos: cajón, impresora térmica ESC/POS, balanzas, lectores.
- Plataformas: Shopify, WooCommerce, PrestaShop.

---

## 17. 🌍 Multi-empresa / Multi-país 🟡

- Consolidación de cuentas multi-tenant para grupos empresariales.
- Multi-moneda con conversión a fecha y diferencias de cambio.
- Multi-idioma en interfaz (i18n) y en datos (productos).
- Localizaciones fiscales (España, México, Colombia, Argentina, Chile…).

---

## 18. 🛠️ Calidad Técnica 🟠

- Refactor de archivos > 200 LOC (`AppSidebar.tsx`, páginas grandes) en componentes pequeños.
- Cobertura de tests con Vitest + Playwright (E2E).
- CI/CD con preview por PR.
- Storybook para el design system.
- Logs estructurados y observabilidad (Sentry).
- Migración de hooks de datos a TanStack Query con caché optimista.

---

## 🎯 Roadmap sugerido por fases

### **Fase 1 — Núcleo ERP** (3 meses) 🔴
1. Stock multi-ubicación + lotes + caducidades.
2. **Transferencias profesionales entre almacenes/tiendas**.
3. Compras (proveedores + PO + recepciones + facturas).
4. Contabilidad: plan contable + asientos automáticos + libros oficiales.

### **Fase 2 — Operativa avanzada** (2 meses) 🟠
5. Facturación electrónica + Verifactu/TicketBAI.
6. CRM + presupuestos + fidelización.
7. Tesorería + conciliación bancaria.
8. BI: dashboards configurables + reportes programados.

### **Fase 3 — Crecimiento** (2 meses) 🟡
9. RRHH + nóminas básicas.
10. E-commerce con pasarela de pago + cupones.
11. Reservas y comandas en sala (restaurante).
12. App móvil PWA + escáner.

### **Fase 4 — Diferenciación** (continuo) 🟢
13. IA: pronósticos, OCR facturas, asistente NLP.
14. Producción / MRP.
15. Integraciones con couriers y marketplaces externos.
16. Localizaciones internacionales.

---

## 📐 Decisiones técnicas pendientes

- **Motor de reportes**: ¿generación PDF server-side (edge function + Puppeteer) o client-side (jsPDF/react-pdf)?
- **Búsqueda**: ¿pgvector para búsqueda semántica de productos? ¿Meilisearch para búsqueda full-text rápida?
- **Colas / jobs**: pg_cron + edge functions para tareas programadas (cierres, reportes, sincronizaciones).
- **Storage de documentos**: Supabase Storage con buckets por tenant + políticas RLS.
- **Realtime**: ya en uso para pedidos online; extender a inventario, KDS y notificaciones.

---

> Este blueprint es vivo. Priorizar según feedback de los primeros tenants reales y el vertical objetivo (restauración vs retail vs servicios).
