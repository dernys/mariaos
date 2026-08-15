# Auditoría y optimización de RRHH/Nóminas y Delivery

## Hallazgos verificados (lectura de código y base de datos)

**Nóminas**
- Las acciones existen pero están mal expuestas: en `RRHH.tsx` (pestaña Nóminas) la columna de acciones sólo pinta 4 botones *icono sin etiqueta* (editar, aprobar, pagar, eliminar) al final de una tabla de 11 columnas con scroll horizontal, por lo que en pantallas medianas quedan fuera de vista. Los diálogos `PayrollEditDialog` y `PayrollBatchDialog` ya están conectados.
- No existe duplicación de implementación. Faltan por completo: detalle, recálculo, desaprobar, anular/revertir, duplicar, comprobante/PDF, exportar, imprimir, documento para firma y registro de firma.
- `payroll_runs` ya tiene `receipt_number`, `payslip_url`, `approved_at/by`, importes de bruto/neto/horas extra/IRPF/SS. No hay tabla de firmas.
- No hay historial con filtros/paginación real: la tabla carga todas las nóminas del tenant sin filtros ni paginación.

**Delivery — causa raíz del error "Preparada"**
- `profiles` **no tiene columna `email`** (columnas: id, user_id, full_name, avatar_url, locale, created_at, updated_at).
- `log_online_order_event`, `trg_online_order_event` y `trg_delivery_assignment_event` ejecutan `SELECT COALESCE(full_name, email) FROM profiles WHERE id = auth.uid()`. Cualquier cambio de estado (incluido `ready`) dispara el trigger y falla.
- Segundo defecto en la misma consulta: filtra `profiles WHERE id = auth.uid()` cuando la clave de usuario es `profiles.user_id`, así que la etiqueta del actor quedaría nula incluso sin el error.
- Corrección: leer `full_name` por `user_id` y obtener el correo de `auth.users` (dentro de funciones SECURITY DEFINER) como respaldo. Sin columnas artificiales.

**Ciclo de delivery y flota**
- Ya existen: `online_orders`, `online_order_events` (con triggers), `delivery_assignments` (pickup/dropoff, lat/lng, recomendación y motivos), `rider_profiles` (ubicación, disponibilidad, métricas), `driver_locations` (heading, speed, accuracy, battery), `delivery_commissions`, `delivery_ratings`, `delivery_zones`, y RPCs `recommend_riders_for_order`, `request_delivery_assignment`, `auto_assign_best_rider`, `reassign_delivery`, `cancel_delivery_assignment`.
- Faltan: prueba de entrega (firma/foto/PIN/receptor), rutas con paradas ordenadas y optimización, incidencias de delivery (sólo hay `store_incidents` de tienda), estados extendidos del repartidor (descanso/fuera de servicio), KPIs y rentabilidad, y consolidación multi-negocio.
- `DeliveryMap` ya usa ubicaciones reales de `driver_last_location`; se conservará el mensaje "Ubicación no disponible" en vez de inventar posiciones.

## Plan de ejecución por fases

### Fase 1 — Corrección crítica (bloqueante)
1. Migración que corrige las tres funciones/triggers del actor (`profiles.user_id` + respaldo de correo desde `auth.users`), y revisión del resto de funciones con el mismo patrón.
2. Prueba del ciclo completo `pending → confirmed → preparing → ready → asignación → aceptado → recogido → en ruta → entregado` con datos reales del tenant demo, verificando que cada transición registre fecha, usuario, estado anterior/nuevo y evento.
3. Nóminas: rediseño de la columna de acciones a un menú de acciones (dropdown) siempre visible, con etiquetas y filtrado por estado.

### Fase 2 — Nóminas de extremo a extremo
- Máquina de estados: `draft → generated → approved → paid` más `cancelled`, con acciones válidas por estado (editar/calcular/generar, revisar/aprobar/exportar/imprimir/firmar, pagar, anular/revertir, duplicar).
- RPCs nuevas: recalcular, desaprobar, anular con reverso contable, duplicar como nueva nómina.
- Página de detalle de nómina con importes desglosados, incidencias, historial y auditoría.
- Documento oficial imprimible/descargable (recibo de nómina y versión "para firma") con negocio, trabajador, período, cargo, base, horas, extras, bonos, comisiones, deducciones, anticipos, bruto, neto, moneda, fechas y estado.
- Tabla `payroll_signatures` (trabajador, fecha/hora, documento, evidencia, observaciones) con estado firmada/no firmada trazable.
- Historial con filtros (período, trabajador, departamento, estado, pagada, firmada), búsqueda, orden, paginación de servidor y exportación.

### Fase 3 — Torre de control de despacho
- `PedidosOnline` evoluciona a centro de despacho: número, cliente, dirección, negocio, origen, fecha/hora, prioridad, estado, importe, preparación, repartidor, ruta, ETA, distancia y estado de entrega, con filtros y paginación.
- Panel de recomendación enriquecido: puntuación explicada (distancia, carga, ruta compatible, puntualidad, valoración, zona, capacidad, horario), asignación manual siempre disponible y asignación inteligente por lotes.
- Vista inversa: "¿qué pedidos puede llevar este repartidor?" con impacto sobre su ruta.

### Fase 4 — Rutas, GPS y tracking
- Tablas `delivery_routes` y `delivery_route_stops` (orden, distancia, tiempo estimado, estado por parada).
- Optimización y reoptimización de ruta con motivo del cambio registrado.
- Mapa operacional con estados por color, panel del repartidor seleccionado (estado, ubicación, ruta, pedidos, ETA, última actualización) y ETA calculado desde ubicación real.
- Tracking por entrega para el negocio y para el cliente (progreso, repartidor, ETA, ubicación aproximada).

### Fase 5 — Prueba de entrega, incidencias y perfil del repartidor
- `delivery_proofs` (firma, foto, PIN, nombre del receptor, GPS, hora, observaciones); no se cierra una entrega sin evidencia cuando la configuración lo exija.
- `delivery_incidents` con motivo, usuario, repartidor, pedido, evidencia y resolución, más cola de excepciones.
- Perfil operacional del repartidor con documentos, métricas, ingresos e historial; estados extendidos de disponibilidad y exclusión de no disponibles en las recomendaciones.

### Fase 6 — Distribución, KPIs y rentabilidad
- Soporte de flota propia/externa/mixta y pedidos de varios negocios consolidados en rutas.
- KPIs de delivery y panel de rentabilidad (ingresos por entrega menos pagos al repartidor y costes) por ruta y por repartidor.
- Puente Delivery→Nóminas: entregas, kilómetros, comisiones e incentivos disponibles para el cálculo de nómina.

### Fase 7 — Offline y auditoría
- Estados, eventos, entregas, evidencias y ubicación del repartidor encolados en la cola offline existente (`pending_ops` + `sync_offline_operation`) con idempotencia por `client_uuid`.
- Auditoría completa de acciones críticas (asignación, reasignación, cancelación, recogida, entrega, devolución, cambio de ruta).

## Notas técnicas
- Sin módulos paralelos: todo se implementa sobre `RRHH.tsx`, `PedidosOnline.tsx`, `Delivery.tsx`, `Repartidor.tsx`, `MisPedidos.tsx` y los componentes de `src/components/rrhh` y `src/components/delivery` existentes.
- Toda tabla nueva se crea con GRANTs explícitos, RLS por tenant y políticas separadas para repartidor/negocio/superadmin.
- Sin datos simulados: si no hay ubicación real, se muestra "Ubicación no disponible" y no se calcula ETA.
- Validación final ejecutando los flujos reales en el preview (nómina completa hasta firma; pedido completo hasta prueba de entrega).

## Entrega
Empezaría por la Fase 1 (error bloqueante + acciones de nóminas visibles) y continuaría en orden; cada fase se valida en el preview antes de pasar a la siguiente.
