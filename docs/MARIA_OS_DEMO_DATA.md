# MarIA OS — Demo Data

Los tres tenants demo contienen operaciones reales y trazables. No hay registros creados solo para llenar tablas: cada venta tiene cliente/empleado, líneas, pago, movimiento de inventario y asiento contable.

## Tenants

| Tenant | Tipo | Perfil | Verificación contable |
|--------|------|--------|----------------------|
| `a1000000-…-0001` Bar El Trópico | bar | CU-MIPYME | debe = haber (181.568,76); Activo −255 = Pasivo 24.033,76 + Resultado −24.288,76 |
| `a2000000-…-0002` Restaurante La Mesa | restaurante | CU-MIPYME | debe = haber (192.258); Activo 52.808 = Pasivo 16.543 + Resultado 36.265 |
| `a3000000-…-0003` TechStore Cuba | empresa | CU-MIPYME | debe = haber (1.889.827,64); Activo 574.944,50 = Pasivo 60.170,14 + Resultado 514.774,36 |

## Cobertura transaccional verificada

- Ventas `completed`: 22 / 17 / 15 (54 en total) — **todas con asiento contable** (0 sin asiento).
- Compras: 11 / 10 / 8 (29 en total; 17 en `received/partial/paid`) — las recibidas con asiento; las `pending/draft` sin asiento (correcto).
- Nóminas pagadas: 14 en total — **todas con asiento** (`series = 'NOM'`) tras la corrección de esta fase.
- Asientos contabilizados: 102 (`posted`: 40 bar / 29 restaurante / 33 empresa) + 2 en borrador.
- Turnos con movimientos de caja enlazados a su asiento.
- Marketplace: pedidos online que dan de alta al comprador como cliente del tenant vendedor.

## Datos por tipo de negocio

- **Bar**: bebidas y categorías propias, recetas de cóctel, consumo por turno, caja multimoneda (CUP/USD/EUR).
- **Restaurante**: mesas, comandas de cocina, recetas con descuento de insumos, delivery y zonas.
- **Empresa comercial**: SKU y variantes, almacenes y transferencias, ventas B2B a crédito con CxC y compras a crédito con CxP.

Además de los tres tenants con datos, existen tres tenants demo vacíos (`Bar MarIA Demo`, `Restaurante MarIA Demo`, `Retail MarIA Demo`) sin transacciones.

## Reglas de mantenimiento

1. Todo dato demo nuevo debe generar su cadena completa (documento → movimiento → asiento).
2. Ninguna fila puede quedarse sin `tenant_id`; los triggers `zz_purchases_tenant_from_supplier` y `zz_journal_entries_require_tenant` lo impiden en compras y asientos.
3. Tras cargar datos, ejecutar en Contabilidad → Reportes: **Auditoría contable**, **Certificación de Integridad Financiera** y **Smoke Test**. Los tres deben salir en verde.

Verificado el 2026-08-08 23:30 UTC con consultas SQL sobre la base real.
