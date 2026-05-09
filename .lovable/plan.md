## GaIA OS — Transformación Enterprise

Evolucionaremos GaIA ERP hacia **GaIA OS**, una plataforma autónoma de inteligencia empresarial con agentes de IA, motor de decisiones y gemelo digital. Mantendremos toda la base actual (POS, inventario, CRM, RRHH, etc.) y añadiremos una nueva capa "OS" encima.

Dado el alcance enorme, propongo ejecutarlo en **5 fases incrementales**. Cada fase es entregable y funcional por sí sola.

---

### FASE 1 — Fundación OS + Rebrand + Landing Premium
1. **Rebrand visual a GaIA OS**
   - Actualizar `AppSidebar` (logo, nombre "GaIA OS"), `index.css` (paleta enterprise: deep navy + electric violet/cyan accents, glassmorphism sutil), tipografía premium.
   - Componentes nuevos: `AIInsightCard`, `ActivityFeed`, `AgentStatusBadge`, `MetricSparkline`, `GlassPanel`.
2. **Landing Page nueva** (`src/pages/Landing.tsx`)
   - Hero: "GaIA OS — El sistema operativo autónomo para empresas inteligentes"
   - Secciones: Cómo funciona, Agentes especializados (7 agentes), Digital Twin, Decision Engine, Marketplace Inteligente, Seguridad, Multi-tenant, Integraciones, Pricing/CTA.
   - Demos visuales animadas (mockups del Command Center, colaboración de agentes, simulación).
3. **Schema base OS** (migración):
   - `ai_agents` (id, tenant_id, type, name, status, autonomy_level, config, metrics)
   - `agent_actions` (agent_id, action_type, target_entity, status, result, requires_approval)
   - `business_events` (event bus: tenant_id, source, type, payload, processed)
   - `business_decisions` (decision_id, agent_id, context, recommendation, outcome, effectiveness_score)
   - `business_memory` (tenant_id, topic, learnings, embeddings opcional)
   - `risk_alerts` (tenant_id, severity, category, entity, description, status)
   - `workflows` (tenant_id, name, definition, trigger, enabled)
   - RLS estricta por tenant + superadmin.

---

### FASE 2 — AI Command Center + Agent Management
1. **AI Command Center** (`/command-center`)
   - Dashboard ejecutivo con: agentes activos, decisiones recientes, alertas críticas, anomalías, KPIs globales, mapa de riesgos, feed de actividad realtime (Supabase Realtime sobre `agent_actions` + `business_events`).
2. **Agent Management** (`/agents`)
   - Lista de los 7 agentes (CFO, Inventory, Operations, Marketplace, Compliance, Procurement, Analytics).
   - Detalle por agente: propósito, herramientas, métricas, historial de acciones, slider de nivel de autonomía (manual → sugerir → auto-aprobar → autónomo).
   - Acción "Ejecutar análisis ahora" → llama edge function `agent-runner`.
3. **Edge function `agent-runner`** usando Lovable AI Gateway (`google/gemini-3-flash-preview`)
   - Recibe `agent_id`, lee contexto (datos del tenant relevantes al dominio), genera análisis + recomendaciones estructuradas (`Output.object` con Zod), persiste en `business_decisions` y `agent_actions`.
4. Sidebar: nueva sección "GaIA OS" con Command Center, Agentes, Decisiones, Riesgos, Workflows.

---

### FASE 3 — Decision Engine + Business Memory + Risk Engine
1. **Decision Engine** (`/decisions`)
   - Lista de decisiones (pendientes/aprobadas/ejecutadas/rechazadas).
   - Flujo de aprobación humana para acciones que requieren `requires_approval`.
   - Edge function `decision-execute` que aplica la acción al módulo correspondiente.
2. **Business Memory** (`/memory`)
   - Vista de aprendizajes acumulados, decisiones pasadas con efectividad, búsqueda semántica simple (texto).
3. **AI Risk Engine** (`/risk`)
   - Edge function `risk-scanner` que corre periódicamente (manual trigger por ahora) sobre ventas/inventario/cuentas detectando: fraude (cancelaciones excesivas), pérdidas (stock negativo), inconsistencias (precios fuera de rango).
   - UI con alertas categorizadas, severidad, acciones sugeridas.

---

### FASE 4 — Digital Twin + Workflow Builder
1. **Digital Twin** (`/digital-twin`)
   - Simulador "what-if": ajustar variables (precio, costo, demanda) → edge function `simulator` calcula impacto financiero/operacional con AI.
   - Visualización: comparativa escenario actual vs simulado.
2. **Autonomous Workflow Builder** (`/workflows`)
   - Constructor visual simple (nodes: Trigger → Condition → Action) con react-flow o lista guiada.
   - Triggers: evento de `business_events`. Actions: notificar, llamar agente, ejecutar acción del módulo.

---

### FASE 5 — Auditoría avanzada + Pulido enterprise
1. Extender módulo `Auditoría` existente para incluir agent_actions, decisiones, ejecuciones de workflow.
2. Trazabilidad end-to-end: evento → análisis de agente → decisión → aprobación → ejecución → resultado en memoria.
3. Animaciones, micro-interacciones, command palette extendido con acciones de agentes, polish visual.

---

### Stack técnico
- **Frontend**: React + Vite + Tailwind (paleta nueva), shadcn, recharts para visualizaciones, framer-motion para animaciones suaves.
- **Backend**: Lovable Cloud (Supabase) + edge functions con Vercel AI SDK + Lovable AI Gateway.
- **Realtime**: Supabase Realtime sobre `agent_actions`, `business_events`, `risk_alerts`.
- **Seguridad**: RLS por tenant, superadmin global, `requires_approval` para acciones destructivas, logs en `activity_log` existente.

---

### Recomendación
Dado el tamaño, **propongo empezar HOY por la Fase 1** (rebrand + landing + schema OS base) porque:
- Establece la identidad visual nueva.
- Crea la base de datos sobre la que se montan las siguientes fases.
- Es lo que el usuario verá inmediatamente.

¿Apruebas el plan global y arranco con la **Fase 1**? O prefieres que ajuste el orden / alcance de alguna fase antes de comenzar.
