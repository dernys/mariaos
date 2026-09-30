# IA — Control Plane

Estado actual: `agent-runner`, `risk-scanner`, `inventory-intelligence` llaman al gateway de IA directamente. Tablas: `ai_agents`, `agent_actions` (status: pending/approved/rejected/executed/failed), `risk_alerts`, `business_decisions`.

Brecha frente al objetivo:
- Sin registro de uso (tokens, coste, modelo, tenant), presupuestos ni cuotas.
- Sin routing/fallback de modelos configurable.
- Estados faltantes: EXECUTING, VERIFIED, ROLLED_BACK.
- Las acciones son recomendaciones; ninguna ejecución autónoma debe activarse sin aprobación explícita.

Diseño propuesto (no implementado): tabla `ai_usage_events` + `ai_tenant_quotas`, wrapper único `_shared/aiClient.ts` usado por todas las funciones.
