import { Bot, DollarSign, Boxes, Activity, Globe, ShieldCheck, Truck, BarChart3 } from "lucide-react";

export const AGENT_DEFINITIONS = [
  { type: "cfo", name: "CFO Agent", icon: DollarSign, color: "from-emerald-500 to-teal-500", description: "Vigila finanzas, márgenes, flujo de caja, CxC y CxP. Detecta riesgos financieros y propone decisiones." },
  { type: "inventory", name: "Inventory Agent", icon: Boxes, color: "from-blue-500 to-cyan-500", description: "Optimiza stock, rotación, transferencias y reposiciones automáticas." },
  { type: "operations", name: "Operations Agent", icon: Activity, color: "from-violet-500 to-purple-500", description: "Analiza ventas, turnos, productividad por tienda y empleados." },
  { type: "marketplace", name: "Marketplace Agent", icon: Globe, color: "from-pink-500 to-rose-500", description: "Optimiza catálogo público, precios, conversión y campañas." },
  { type: "compliance", name: "Compliance Agent", icon: ShieldCheck, color: "from-amber-500 to-orange-500", description: "Detecta inconsistencias contables, fraude, accesos sospechosos." },
  { type: "procurement", name: "Procurement Agent", icon: Truck, color: "from-indigo-500 to-blue-500", description: "Analiza proveedores, lead times y recomienda órdenes de compra." },
  { type: "analytics", name: "Analytics Agent", icon: BarChart3, color: "from-fuchsia-500 to-pink-500", description: "Detecta tendencias, anomalías y oportunidades de crecimiento." },
] as const;

export type AgentDef = typeof AGENT_DEFINITIONS[number];
export const AgentBotIcon = Bot;
