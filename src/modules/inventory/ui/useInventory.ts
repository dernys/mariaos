// Fase 3 — Capa UI del módulo: hooks de React Query.
// Regla de arquitectura: este directorio NO puede importar supabase-js
// (enforced por eslint: no-restricted-imports en src/modules/**/ui).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import {
  createProduct,
  deleteProduct,
  loadInventory,
  registerMovement,
  uploadProductImage,
  updateProduct,
  type InventoryDeps,
  type RegisterMovementInput,
} from "../application/inventoryUseCases";
import { supabaseInventoryRepository } from "../infrastructure/supabaseInventoryRepository";
import { inventoryStats, type Product, type ProductDraft } from "../domain/product";

const EMPTY = { products: [], warehouses: [], stores: [], locationStocks: [], movements: [] };

export function useInventoryDeps(): InventoryDeps {
  const tenantId = useTenant();
  const { user } = useAuth();
  return useMemo(
    () => ({ repo: supabaseInventoryRepository, tenantId, userId: user?.id ?? null }),
    [tenantId, user?.id],
  );
}

export function useInventory() {
  const deps = useInventoryDeps();
  const query = useQuery({
    queryKey: ["inventory", "snapshot", deps.tenantId],
    queryFn: () => loadInventory(deps),
    staleTime: 30_000,
  });

  const snapshot = query.data ?? EMPTY;
  const stats = useMemo(() => inventoryStats(snapshot.products), [snapshot.products]);

  return { ...query, ...snapshot, stats, loading: query.isLoading };
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["inventory"] });
}

export function useSaveProduct() {
  const deps = useInventoryDeps();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (vars: { id?: string | null; draft: ProductDraft }) =>
      vars.id ? updateProduct(deps, vars.id, vars.draft) : createProduct(deps, vars.draft),
    onSuccess: invalidate,
  });
}

export function useDeleteProduct() {
  const deps = useInventoryDeps();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (product: Product) => deleteProduct(deps, product),
    onSuccess: invalidate,
  });
}

export function useRegisterMovement() {
  const deps = useInventoryDeps();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: RegisterMovementInput) => registerMovement(deps, input),
    onSuccess: invalidate,
  });
}

export function useUploadProductImage() {
  const deps = useInventoryDeps();
  return useMutation({ mutationFn: (file: File) => uploadProductImage(deps, file) });
}

// --- Edición y auditoría de movimientos ---
import { inventoryMovementAudit } from "../infrastructure/supabaseInventoryRepository";

export interface MovementPatch {
  reason?: string | null;
  notes?: string | null;
  reference_type?: string | null;
}

export function useUpdateMovement() {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; patch: MovementPatch }) =>
      inventoryMovementAudit.updateMovement(vars.id, vars.patch),
    onSuccess: (_d, vars) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["inventory", "movement-history", vars.id] });
      qc.invalidateQueries({ queryKey: ["inventory", "movement-trace", vars.id] });
    },
  });
}

export function useMovementTrace(movementId: string | null) {
  return useQuery({
    queryKey: ["inventory", "movement-trace", movementId],
    enabled: !!movementId,
    queryFn: () => inventoryMovementAudit.loadTrace(movementId!),
  });
}

export function useMovementHistory(movementId: string | null) {
  return useQuery({
    queryKey: ["inventory", "movement-history", movementId],
    enabled: !!movementId,
    queryFn: () => inventoryMovementAudit.loadHistory(movementId!),
  });
}
