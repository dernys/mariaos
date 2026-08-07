export * from "./domain/product";
export type { InventoryRepository, InventorySnapshot, MovementRecord } from "./application/inventoryRepository";
export * from "./application/inventoryUseCases";
export { supabaseInventoryRepository } from "./infrastructure/supabaseInventoryRepository";
export * from "./ui/useInventory";
