# MarIA OS — Descripción funcional real del sistema

**Para clientes e inversionistas.** Todo lo descrito aquí existe en el código y opera sobre datos reales de las empresas demo del sistema. Lo que aún no está terminado se marca explícitamente.

Leyenda: 🟢 operativo · 🟡 parcial · ⚪ hoja de ruta

---

## 1. Qué es MarIA OS

Un sistema operativo de negocio (ERP + POS + marketplace + IA) multi-empresa, pensado para bares, restaurantes, retail y empresas multi-sucursal de Cuba y Latinoamérica. Una sola plataforma reemplaza el punto de venta, el inventario, las compras, la contabilidad, la facturación, RRHH, el delivery y la tienda online.

Diferencial: **la operación diaria tributa automáticamente a la contabilidad**. Cada venta, compra, movimiento de inventario y movimiento de caja genera su asiento en el libro diario a través de un maestro de cuentas configurable por empresa.

### Cifras verificadas de la plataforma

| Indicador | Valor |
|---|---|
| Tablas de negocio (todas con aislamiento por empresa) | 137 |
| Políticas de seguridad a nivel de fila (RLS) | 396 |
| Funciones de negocio en el servidor | 231 |
| Disparadores de integridad y auditoría | 228 |
| Funciones serverless (IA, fiscal, integraciones) | 17 |
| Líneas de código de aplicación | ~56.000 |
| Idiomas de interfaz | 3 (es, en, pt-BR) |
| Paridad débito = crédito en el libro diario | 100% |

---

## 2. Módulos por categoría

### Operaciones y ventas
- 🟢 **POS adaptable por rubro**: modo Bar (cuentas y consumiciones), Restaurante (mapa de mesas, comandas, división de cuentas) y Retail (SKU y código de barras). Turno obligatorio para vender, ventas aparcadas, atajos de teclado, mobile-first.
- 🟢 **Pagos**: efectivo, tarjeta, QR, transferencia, crédito y **pagos divididos**; multimoneda (CUP, USD, EUR) con tasa de cambio configurable. El crédito exige cliente o empleado asociado.
- 🟢 **Ticket térmico** e impresión de recibo desde la venta y desde la venta rápida.
- 🟢 **Mapa de mesas y KDS de cocina** sincronizados en tiempo real: comanda, estados, notas por ítem, modificaciones y cobro directo de la comanda.
- 🟢 **Turnos y caja**: un turno abierto por tienda, apertura/cierre con conteo, movimientos de caja categorizados y contabilizados, cierre auditado.
- 🟢 **Devoluciones** de venta con reintegro de stock y contra-asiento contable.

### Inventario y suministro
- 🟢 **Catálogo y stock por ubicación** (tienda y almacén), con almacenes asociables a una o varias tiendas.
- 🟢 **Kardex valorizado y movimientos auditables** (entradas, salidas, ajustes) con historial completo.
- 🟢 **Transferencias** entre almacenes y tiendas con envío, recepción, transportista y consola de integridad de existencias.
- 🟢 **Recetas / escandallo**: la receta es una mezcla de productos de stock; costo teórico, margen y descuento automático de ingredientes al vender.
- 🟢 **Conteos físicos**, lotes, series y variantes; alertas de stock bajo y sin stock.
- 🟢 **Compras**: órdenes, recepción de mercancía, generación de cuentas por pagar y pagos a proveedores.
- 🟡 **Inteligencia de inventario**: pronóstico de demanda y sugerencia de reposición asistida por IA.

### Finanzas y contabilidad
- 🟢 **Contabilidad de partida doble** con maestro de cuentas configurable, plantillas de plan contable, ejercicios y periodos fiscales con cierre.
- 🟢 **Mapeo operación → cuenta**: cada tipo de operación (venta, costo de venta, compra, caja, nómina, impuestos) se asigna a la cuenta que la empresa decida; la aplicación deja de estar "cableada".
- 🟢 **Libro diario y libro mayor** completos, con conciliación por operación.
- 🟢 **Reportes financieros calculados en el servidor**: Estado de Resultados, Balance General, Balance de Comprobación, Libro Diario y Libro Mayor, exportables.
- 🟢 **Consola de auditoría del motor financiero**: más de 30 verificaciones estructurales con explicación legible para el contador y acción correctiva sugerida.
- 🟡 **Tesorería**: caja, bancos, cuentas por cobrar y pagar, proyección de flujo (poco ejercitada aún con datos reales de banco).
- 🟡 **Motor fiscal genérico** multi-país con reglas fiscales configurables por empresa y cálculo de declaraciones.
- 🟡 **Facturación**: factura a partir de ventas realizadas, PDF profesional, envío por correo y transmisión electrónica UBL 2.1 / XML firmado (sin certificación ante una autoridad fiscal en vivo).
- ⚪ Conciliación bancaria automatizada a escala y facturación de suscripciones.

### Comercial: clientes, marketplace y delivery
- 🟢 **CRM**: clientes con saldo, crédito otorgado, deuda, fidelización por puntos y timeline de actividad.
- 🟢 **Marketplace público (PWA)**: catálogo multi-empresa con búsqueda, filtros, paginación, geolocalización, galería de imágenes por producto, entrega a domicilio o recogida en local y reseñas solo de usuarios registrados.
- 🟢 **Registro de compradores** con validación por correo; los usuarios de negocio los crea el superadmin o el administrador de cada empresa (sin auto-registro empresarial).
- 🟢 **Pedidos online y delivery**: captura del pedido, zonas, repartidores, sugerencia automática del mejor repartidor, historial de acciones y seguimiento en tiempo real; portales dedicados de cliente y repartidor.
- ⚪ Pago online dentro del marketplace (hoy es captura de pedido y cobro en entrega/local).

### Personas
- 🟢 **RRHH**: empleados, puestos, contratos, fichaje, horarios, vacaciones y horas extras.
- 🟢 **Nóminas** con ciclo Borrador → Aprobada → Pagada, generación por lotes, edición, documento PDF y registro de firma (física o digital), con asiento contable asociado.
- 🟢 **Portal del empleado**.

### Inteligencia y automatización
- 🟡 **Command Center de IA**: 7 agentes especializados por empresa (CFO, inventario, operaciones, marketplace, cumplimiento, compras, analítica) con acciones registradas y decisiones sugeridas al dueño.
- 🟡 **Digital Twin**: simulación de precio, costo, demanda y gastos fijos sobre datos reales, con P&L proyectado, punto de equilibrio y concentración de ventas.
- 🟡 **Motor de riesgo**: escaneo de descuadres contables, stock negativo, anomalías de caja y accesos inusuales.
- 🟡 **Memoria de negocio, grafo de conocimiento y event store** (registro de eventos de dominio en modo sombra).
- 🟡 **Workflows y webhooks**: motor implementado; sin flujos configurados en producción todavía.

### Plataforma y confianza
- 🟢 **Multi-empresa con aislamiento estricto** (Row-Level Security en todas las tablas) y selector de contexto para el superadmin.
- 🟢 **RBAC real**: matriz de permisos por módulo y acción resuelta en el servidor; el menú se adapta al tipo de negocio de cada empresa.
- 🟢 **Auditoría** de actividad de usuarios y operaciones.
- 🟢 **Operación offline y sincronización resiliente**: cola persistente de operaciones, idempotencia por identificador de cliente y resolución de conflictos multi-dispositivo, con Centro de Sincronización.
- 🟢 **PWA instalable**, tiempo real nativo (mesas, cocina, pedidos, dashboard), interfaz en 3 idiomas.
- 🟡 **API pública y MCP** para integraciones y agentes externos.
- ⚪ Auditoría de seguridad externa y certificaciones tipo SOC2/ISO.

---

## 3. Etapa de desarrollo

**Madurez global: 2.7 / 5 — plataforma completa en amplitud funcional, en fase de endurecimiento antes de la disponibilidad general pagada.**

- Núcleo operativo (POS, inventario, compras, turnos, cocina) y núcleo contable: **listos para piloto con clientes reales**.
- Finanzas avanzadas (bancos, conciliación, fiscalidad certificada) e inteligencia artificial: **funcionales pero poco ejercitadas**, requieren datos de clientes reales.
- Facturación de suscripciones, medición de consumo de IA y suite de pruebas de integración: **pendientes**.

**Estado comercial, sin adornos:** 0 clientes pagando, 0 ingresos, precios no publicados. Las tres empresas demo (Bar El Trópico, Restaurante La Mesa, TechStore Cuba) tienen operación real cargada y son la evidencia demostrable del producto.

---

## 4. Qué puede comprobar un cliente en 10 minutos

1. Entrar a la demo desde la página de inicio eligiendo rubro (bar, restaurante o retail) y rol (administrador, gerente o cajero) y comprobar que los permisos cambian de verdad.
2. Abrir turno, cobrar una venta con pago dividido e imprimir el ticket.
3. Enviar una comanda a cocina, verla aparecer en el KDS y cobrarla desde la comanda.
4. Revisar en Contabilidad el asiento generado por esa venta y verlo reflejado en el Estado de Resultados.
5. Ver el pedido online, asignar un repartidor sugerido por el sistema y seguir su estado en tiempo real.
