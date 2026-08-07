// Fase 5 — Dominio puro del grafo de conocimiento empresarial.
// Sin I/O: recibe nodos y aristas ya materializados y deriva señales de negocio.

export type KgNodeType =
  | "product"
  | "category"
  | "customer"
  | "supplier"
  | "store"
  | "employee";

export type KgRelation = "in_category" | "bought" | "sold" | "supplies" | "operates";

export interface KgNode {
  id: string;
  type: KgNodeType | string;
  key: string;
  label: string;
  attributes: Record<string, unknown>;
  importance: number;
}

export interface KgEdge {
  id: string;
  srcId: string;
  dstId: string;
  relation: KgRelation | string;
  weight: number;
  attributes: Record<string, unknown>;
}

export interface KnowledgeGraph {
  nodes: KgNode[];
  edges: KgEdge[];
}

export const EMPTY_GRAPH: KnowledgeGraph = { nodes: [], edges: [] };

export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  density: number;
  byType: Array<{ type: string; count: number }>;
  byRelation: Array<{ relation: string; count: number }>;
  isolatedNodes: number;
}

export function graphStats(graph: KnowledgeGraph): GraphStats {
  const { nodes, edges } = graph;
  const connected = new Set<string>();
  edges.forEach((e) => {
    connected.add(e.srcId);
    connected.add(e.dstId);
  });

  const countBy = <T extends string>(items: T[]) => {
    const map = new Map<string, number>();
    items.forEach((i) => map.set(i, (map.get(i) ?? 0) + 1));
    return [...map.entries()]
      .map(([k, count]) => ({ k, count }))
      .sort((a, b) => b.count - a.count);
  };

  const maxEdges = nodes.length > 1 ? nodes.length * (nodes.length - 1) : 0;

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    density: maxEdges > 0 ? Math.round((edges.length / maxEdges) * 10000) / 10000 : 0,
    byType: countBy(nodes.map((n) => String(n.type))).map(({ k, count }) => ({ type: k, count })),
    byRelation: countBy(edges.map((e) => String(e.relation))).map(({ k, count }) => ({
      relation: k,
      count,
    })),
    isolatedNodes: nodes.filter((n) => !connected.has(n.id)).length,
  };
}

/** Nodos más influyentes por grado ponderado (centralidad simple). */
export function topNodes(graph: KnowledgeGraph, type?: string, limit = 5): KgNode[] {
  return graph.nodes
    .filter((n) => (type ? String(n.type) === type : true))
    .slice()
    .sort((a, b) => b.importance - a.importance)
    .slice(0, limit);
}

/** Vecinos directos de un nodo, con la relación y el peso. */
export function neighbors(
  graph: KnowledgeGraph,
  nodeId: string,
): Array<{ node: KgNode; relation: string; weight: number; direction: "out" | "in" }> {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const result: Array<{ node: KgNode; relation: string; weight: number; direction: "out" | "in" }> = [];
  graph.edges.forEach((e) => {
    if (e.srcId === nodeId) {
      const node = byId.get(e.dstId);
      if (node) result.push({ node, relation: String(e.relation), weight: e.weight, direction: "out" });
    } else if (e.dstId === nodeId) {
      const node = byId.get(e.srcId);
      if (node) result.push({ node, relation: String(e.relation), weight: e.weight, direction: "in" });
    }
  });
  return result.sort((a, b) => b.weight - a.weight);
}

export interface GraphInsight {
  code: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
}

/**
 * Señales derivadas del grafo, no de consultas ad-hoc:
 * dependencia de proveedor único, concentración de clientes y productos huérfanos.
 */
export function graphInsights(graph: KnowledgeGraph): GraphInsight[] {
  const insights: GraphInsight[] = [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  // Productos sin proveedor conocido
  const suppliedProducts = new Set(
    graph.edges.filter((e) => e.relation === "supplies").map((e) => e.dstId),
  );
  const products = graph.nodes.filter((n) => n.type === "product");
  const unsupplied = products.filter((p) => !suppliedProducts.has(p.id));
  if (products.length > 0 && unsupplied.length > 0) {
    insights.push({
      code: "KG-001",
      severity: unsupplied.length > products.length / 2 ? "warning" : "info",
      title: "Productos sin proveedor trazado",
      detail: `${unsupplied.length} de ${products.length} productos no tienen ninguna compra registrada que los vincule a un proveedor.`,
    });
  }

  // Dependencia de proveedor único
  const supplierWeight = new Map<string, number>();
  graph.edges
    .filter((e) => e.relation === "supplies")
    .forEach((e) => supplierWeight.set(e.srcId, (supplierWeight.get(e.srcId) ?? 0) + e.weight));
  const totalSupply = [...supplierWeight.values()].reduce((s, w) => s + w, 0);
  if (totalSupply > 0) {
    const [topSupplierId, topWeight] = [...supplierWeight.entries()].sort((a, b) => b[1] - a[1])[0];
    const share = (topWeight / totalSupply) * 100;
    if (share >= 60) {
      insights.push({
        code: "KG-002",
        severity: share >= 80 ? "critical" : "warning",
        title: "Dependencia de un proveedor",
        detail: `${byId.get(topSupplierId)?.label ?? "Proveedor"} concentra el ${share.toFixed(1)}% del suministro.`,
      });
    }
  }

  // Concentración de clientes
  const customerWeight = new Map<string, number>();
  graph.edges
    .filter((e) => e.relation === "bought")
    .forEach((e) => {
      const amount = Number((e.attributes as { amount?: number }).amount ?? e.weight);
      customerWeight.set(e.srcId, (customerWeight.get(e.srcId) ?? 0) + amount);
    });
  const totalCustomer = [...customerWeight.values()].reduce((s, w) => s + w, 0);
  if (totalCustomer > 0) {
    const [topCustomerId, topAmount] = [...customerWeight.entries()].sort((a, b) => b[1] - a[1])[0];
    const share = (topAmount / totalCustomer) * 100;
    if (share >= 40) {
      insights.push({
        code: "KG-003",
        severity: share >= 70 ? "critical" : "warning",
        title: "Concentración de ingresos en un cliente",
        detail: `${byId.get(topCustomerId)?.label ?? "Cliente"} representa el ${share.toFixed(1)}% de las ventas identificadas.`,
      });
    }
  }

  // Grafo vacío o sin relaciones
  if (graph.nodes.length === 0) {
    insights.push({
      code: "KG-000",
      severity: "info",
      title: "Grafo no construido",
      detail: "Reconstruye el grafo para derivar relaciones entre clientes, productos y proveedores.",
    });
  } else if (graph.edges.length === 0) {
    insights.push({
      code: "KG-004",
      severity: "warning",
      title: "Grafo sin relaciones",
      detail: "Hay entidades cargadas pero ninguna operación las conecta todavía.",
    });
  }

  return insights;
}
