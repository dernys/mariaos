// Fase 3 — Casos de uso de Inventario. Sin React, sin supabase-js.

import { beginOperation, type OperationContext } from "@/lib/context/operationContext";
import { observability } from "@/lib/observability";
import { logActivity } from "@/hooks/useActivityLog";
import {
  normalizeProductDraft,
  planMovement,
  validateProductDraft,
  type MovementType,
  type Product,
  type ProductDraft,
} from "../domain/product";
import type { InventoryRepository, InventorySnapshot } from "./inventoryRepository";

export interface InventoryDeps {
  repo: InventoryRepository;
  tenantId: string | null;
  userId?: string | null;
}

export class InventoryUseCaseError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

function ctxFor(deps: InventoryDeps, operation: string): OperationContext {
  return beginOperation({ module: "inventory", operation, tenant_id: deps.tenantId, user_id: deps.userId });
}

export function loadInventory(deps: InventoryDeps): Promise<InventorySnapshot> {
  return deps.repo.loadSnapshot();
}

export async function createProduct(deps: InventoryDeps, input: ProductDraft): Promise<string> {
  const draft = normalizeProductDraft(input);
  const invalid = validateProductDraft(draft);
  if (invalid) throw new InventoryUseCaseError(invalid);

  const ctx = ctxFor(deps, "create_product");
  const id = await deps.repo.createProduct(draft, deps.tenantId);

  if (draft.stock > 0) {
    await deps.repo.recordMovement(
      {
        product_id: id,
        warehouse_id: draft.warehouse_id ?? null,
        movement_type: "entry",
        quantity: draft.stock,
        previous_stock: 0,
        new_stock: draft.stock,
        reason: "initial_stock",
      },
      deps.tenantId,
      deps.userId,
    );
  }

  await logActivity({
    entity_type: "product",
    entity_id: id,
    action: "product.created",
    description: `${draft.name} (${draft.sku})`,
    ctx,
  });
  observability.info("product created", { module: "inventory", operation: "create_product", correlation_id: ctx.correlation_id });
  return id;
}

export async function updateProduct(deps: InventoryDeps, id: string, input: ProductDraft): Promise<void> {
  const draft = normalizeProductDraft(input);
  const invalid = validateProductDraft(draft);
  if (invalid) throw new InventoryUseCaseError(invalid);

  const ctx = ctxFor(deps, "update_product");
  await deps.repo.updateProduct(id, draft, deps.tenantId);
  await logActivity({
    entity_type: "product",
    entity_id: id,
    action: "product.updated",
    description: draft.name,
    ctx,
  });
}

export async function deleteProduct(deps: InventoryDeps, product: Product): Promise<void> {
  const ctx = ctxFor(deps, "delete_product");
  await deps.repo.deleteProduct(product.id);
  await logActivity({
    entity_type: "product",
    entity_id: product.id,
    action: "product.deleted",
    description: product.name,
    ctx,
  });
}

export interface RegisterMovementInput {
  product: Product;
  type: MovementType;
  quantity: number;
  reason?: string | null;
}

export async function registerMovement(deps: InventoryDeps, input: RegisterMovementInput) {
  const plan = planMovement({ type: input.type, quantity: input.quantity, currentStock: input.product.stock });
  if (!plan.ok) throw new InventoryUseCaseError(plan.error!);

  const ctx = ctxFor(deps, "register_movement");
  await deps.repo.recordMovement(
    {
      product_id: input.product.id,
      warehouse_id: input.product.warehouse_id,
      movement_type: input.type,
      quantity: Math.abs(plan.delta),
      previous_stock: plan.previousStock,
      new_stock: plan.newStock,
      reason: input.reason?.trim() || null,
    },
    deps.tenantId,
    deps.userId,
  );
  await deps.repo.setProductStock(input.product.id, plan.newStock);

  await logActivity({
    entity_type: "product",
    entity_id: input.product.id,
    action: input.type === "exit" ? "inventory.exit" : "inventory.entry",
    description: `${plan.delta > 0 ? "+" : ""}${plan.delta} — ${input.reason || ""}`.trim(),
    ctx,
  });

  return plan;
}

export async function uploadProductImage(deps: InventoryDeps, file: File): Promise<string> {
  if (!deps.tenantId) throw new InventoryUseCaseError("noTenant");
  return deps.repo.uploadProductImage(file, deps.tenantId);
}
