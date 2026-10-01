/**
 * Regla única de existencia disponible en el POS (espejo de pos_checkout).
 * - Producto con receta → sin límite (null): se descuentan ingredientes.
 * - Turno con tienda → existencia de product_stock de esa tienda; sin fila = 0.
 * - Sin tienda (nivel negocio) → fila de nivel negocio o, si falta, products.stock.
 */
export function availableStock(opts: {
  hasRecipe: boolean;
  storeScoped: boolean;
  locationStock: number | undefined;
  globalStock: number | null | undefined;
}): number | null {
  if (opts.hasRecipe) return null;
  if (opts.locationStock !== undefined) return Number(opts.locationStock);
  return opts.storeScoped ? 0 : Number(opts.globalStock ?? 0);
}
