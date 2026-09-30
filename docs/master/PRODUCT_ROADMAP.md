# Roadmap

- [ ] **P1-TX-1** POS: disponible = stock de la tienda del turno; 0 si no hay fila (siguiente tarea)
- [ ] **P1-TX-2** `pos_checkout` valida stock por tienda server-side
- [ ] **P0-SEC-1** Test automatizado cross-tenant autenticado (usuario A no lee B en tablas críticas, RPC y storage)
- [ ] **P0-SEC-2** Rate limiting en `api-v1`
- [ ] P1-OFF-1 Snapshot offline con product_stock por tienda + conflicto de stock en sync
- [ ] P1-OFF-2 Pruebas multi-device (dos outbox, misma venta/stock)
- [ ] P1-AI-1 AI Control Plane: tabla de uso (provider, model, tokens, coste, tenant), cuotas por tenant
- [ ] P1-FIN-1 Nómina devengo en aprobación (CxP)
- [ ] P2 Estados IA PROPOSED→…→VERIFIED/ROLLED_BACK; compensación en workflows
- [ ] P2 Asientos de tránsito, comisión delivery, provisión fidelización
- [ ] P3 Consolidar `useTenant` en `useTenantContext`; E2E navegador
