# MarIA OS — Demo Data

Los tres tenants demo contienen operaciones reales y trazables. No hay registros creados solo para llenar tablas: cada venta tiene cliente/empleado, líneas, pago, movimiento de inventario y asiento contable.

## Tenants

| Tenant | Tipo | Perfil | Verificación contable |
|--------|------|--------|----------------------|
| `a1000000-…-0001` Bar El Trópico | bar | CU-MIPYME | debe = haber; Activo 36.600 = Pasivo 14.820 + Resultado 21.780 |
| `a2000000-…-0002` Restaurante La Mesa | restaurante | CU-MIPYME | debe = haber; Activo 52.808 = Pasivo 16.543 + Resultado 36.265 |
| `a3000000-…-0003` TechStore Cuba | empresa | CU-MIPYME | debe = haber; Activo 620.777 = Pasivo 48.712 + Resultado 572.065 |

## Cobertura transaccional verificada

- Ventas `completed`: 22 / 17 / 15 — **todas con asiento contable**.
- Compras: 10 / 10 / 8 — las `received/partial` con asiento; las `pending/draft` sin asiento (correcto).
- Nóminas pagadas: 14 en total — **todas con asiento** (`series = 'NOM'`) tras la corrección de esta fase.
- Asientos contabilizados: 88 (`posted`) + 2 en borrador.
- Turnos con movimientos de caja enlazados a su asiento.
- Marketplace: pedidos online que dan de alta al comprador como cliente del tenant vendedor.

## Datos por tipo de negocio

- **Bar**: bebidas y categorías propias, recetas de cóctel, consumo por turno, caja multimoneda (CUP/USD/EUR).
- **Restaurante**: mesas, comandas de cocina, recetas con descuento de insumos, delivery y zonas.
- **Empresa comercial**: SKU y variantes, almacenes y transferencias, ventas B2B a crédito con CxC y compras a crédito con CxP.

## Reglas de mantenimiento

1. Todo dato demo nuevo debe generar su cadena completa (documento → movimiento → asiento).
2. Ninguna fila puede quedarse sin `tenant_id`; los triggers `zz_purchases_tenant_from_supplier` y `zz_journal_entries_require_tenant` lo impiden en compras y asientos.
3. Tras cargar datos, ejecutar en Contabilidad → Reportes: **Auditoría contable**, **Certificación de Integridad Financiera** y **Smoke Test**. Los tres deben salir en verde.
