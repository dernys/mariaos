// Fase 5 — Puertos (aplicación): única forma de pedir datos al exterior.

import type { KnowledgeGraph } from "../domain/knowledgeGraph";
import type { TwinBaseline } from "../domain/twin";

export interface IntelligenceRepository {
  loadGraph(tenantId: string): Promise<KnowledgeGraph>;
  rebuildGraph(tenantId: string): Promise<{ nodes: number; edges: number }>;
  loadBaseline(tenantId: string, currency: string): Promise<TwinBaseline>;
}
