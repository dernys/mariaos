/**
 * Canonical Data Center entity registry (server side).
 *
 * Every entity is scoped by `tenant_id`. The tenant is ALWAYS resolved from the
 * authenticated session on the server — never from the request body — and it is
 * forced onto every row that is written or read.
 */
export type EntityKey =
  | "product_categories"
  | "products"
  | "product_variants"
  | "product_stock"
  | "customers"
  | "suppliers"
  | "employees"
  | "warehouses"
  | "stores"
  | "tax_rates"
  | "payment_methods"
  | "units_of_measure"
  | "currencies"
  | "restaurant_tables"
  | "product_recipes"
  | "combo_items"
  | "promotions";

export interface EntityDef {
  key: EntityKey;
  table: string;
  label: string;
  /** Columns accepted on import (tenant_id is always injected server-side). */
  columns: string[];
  /** Required columns for a valid row. */
  required: string[];
  /** Natural keys used, in order, to detect an existing record. */
  naturalKeys: string[][];
  /** Numeric columns (validated + coerced). */
  numeric?: string[];
  /** Boolean columns (validated + coerced). */
  bool?: string[];
  /** Column used for date-range export filters. */
  dateColumn?: string;
  /** Safe to copy when cloning a business (master data only). */
  cloneable?: boolean;
}

export const ENTITIES: Record<EntityKey, EntityDef> = {
  product_categories: {
    key: "product_categories", table: "product_categories", label: "Categorías",
    columns: ["name", "description", "color", "is_active"],
    required: ["name"], naturalKeys: [["name"]], bool: ["is_active"],
    dateColumn: "created_at", cloneable: true,
  },
  products: {
    key: "products", table: "products", label: "Productos",
    columns: ["sku", "name", "description", "category", "brand", "price", "cost", "stock", "min_stock", "unit_code", "product_type", "is_active", "is_online", "image_url"],
    required: ["sku", "name", "price"],
    naturalKeys: [["sku"]],
    numeric: ["price", "cost", "stock", "min_stock"],
    bool: ["is_active", "is_online"],
    dateColumn: "created_at", cloneable: true,
  },
  product_variants: {
    key: "product_variants", table: "product_variants", label: "Variantes",
    columns: ["product_id", "sku", "name", "price", "cost", "barcode", "is_active"],
    required: ["product_id", "name"], naturalKeys: [["sku"], ["product_id", "name"]],
    numeric: ["price", "cost"], bool: ["is_active"], dateColumn: "created_at", cloneable: true,
  },
  product_stock: {
    key: "product_stock", table: "product_stock", label: "Inventario",
    columns: ["product_id", "location_type", "location_id", "stock", "min_stock", "max_stock"],
    required: ["product_id", "location_type", "location_id"],
    naturalKeys: [["product_id", "location_type", "location_id"]],
    numeric: ["stock", "min_stock", "max_stock"], dateColumn: "created_at",
  },
  customers: {
    key: "customers", table: "customers", label: "Clientes",
    columns: ["name", "phone", "email", "address", "rfc", "credit_limit", "notes"],
    required: ["name"], naturalKeys: [["email"], ["phone"], ["name"]],
    numeric: ["credit_limit"], dateColumn: "created_at",
  },
  suppliers: {
    key: "suppliers", table: "suppliers", label: "Proveedores",
    columns: ["name", "phone", "email", "address", "contact_name", "notes", "is_active"],
    required: ["name"], naturalKeys: [["email"], ["name"]], bool: ["is_active"],
    dateColumn: "created_at",
  },
  employees: {
    key: "employees", table: "employees", label: "Empleados",
    columns: ["name", "position", "salary", "phone", "email", "document_id", "department", "hire_date", "is_active", "notes"],
    required: ["name"], naturalKeys: [["document_id"], ["email"], ["name"]],
    numeric: ["salary"], bool: ["is_active"], dateColumn: "created_at",
  },
  warehouses: {
    key: "warehouses", table: "warehouses", label: "Almacenes",
    columns: ["name", "location", "capacity", "warehouse_type", "is_active"],
    required: ["name"], naturalKeys: [["name"]], numeric: ["capacity"], bool: ["is_active"],
    dateColumn: "created_at", cloneable: true,
  },
  stores: {
    key: "stores", table: "stores", label: "Tiendas / Sucursales",
    columns: ["name", "address", "phone", "email", "is_active"],
    required: ["name"], naturalKeys: [["name"]], bool: ["is_active"],
    dateColumn: "created_at", cloneable: true,
  },
  tax_rates: {
    key: "tax_rates", table: "tax_rates", label: "Impuestos",
    columns: ["name", "code", "rate", "is_default", "is_active"],
    required: ["name", "rate"], naturalKeys: [["code"], ["name"]],
    numeric: ["rate"], bool: ["is_default", "is_active"], dateColumn: "created_at", cloneable: true,
  },
  payment_methods: {
    key: "payment_methods", table: "payment_methods", label: "Métodos de pago",
    columns: ["name", "type", "requires_card_info", "is_active"],
    required: ["name", "type"], naturalKeys: [["name"]],
    bool: ["requires_card_info", "is_active"], dateColumn: "created_at", cloneable: true,
  },
  units_of_measure: {
    key: "units_of_measure", table: "units_of_measure", label: "Unidades de medida",
    columns: ["code", "name", "decimals", "factor", "is_default", "is_active"],
    required: ["code", "name"], naturalKeys: [["code"]],
    numeric: ["decimals", "factor"], bool: ["is_default", "is_active"],
    dateColumn: "created_at", cloneable: true,
  },
  currencies: {
    key: "currencies", table: "currencies", label: "Monedas",
    columns: ["code", "name", "symbol", "exchange_rate", "is_base", "is_active"],
    required: ["code", "name", "symbol"], naturalKeys: [["code"]],
    numeric: ["exchange_rate"], bool: ["is_base", "is_active"], dateColumn: "created_at", cloneable: true,
  },
  restaurant_tables: {
    key: "restaurant_tables", table: "restaurant_tables", label: "Mesas",
    columns: ["name", "capacity", "shape", "position_x", "position_y", "status"],
    required: ["name"], naturalKeys: [["name"]],
    numeric: ["capacity", "position_x", "position_y"], dateColumn: "created_at", cloneable: true,
  },
  product_recipes: {
    key: "product_recipes", table: "product_recipes", label: "Recetas / Ingredientes",
    columns: ["product_id", "ingredient_id", "quantity", "unit", "waste_pct", "note"],
    required: ["product_id", "ingredient_id", "quantity", "unit"],
    naturalKeys: [["product_id", "ingredient_id"]],
    numeric: ["quantity", "waste_pct"], dateColumn: "created_at", cloneable: true,
  },
  combo_items: {
    key: "combo_items", table: "combo_items", label: "Combos",
    columns: ["combo_product_id", "child_product_id", "quantity", "is_optional", "note"],
    required: ["combo_product_id", "child_product_id", "quantity"],
    naturalKeys: [["combo_product_id", "child_product_id"]],
    numeric: ["quantity"], bool: ["is_optional"], dateColumn: "created_at", cloneable: true,
  },
  promotions: {
    key: "promotions", table: "promotions", label: "Promociones",
    columns: ["name", "description", "promo_type", "discount_value", "scope", "scope_value", "min_qty", "valid_from", "valid_until", "is_active"],
    required: ["name", "promo_type", "discount_value"], naturalKeys: [["name"]],
    numeric: ["discount_value", "min_qty"], bool: ["is_active"], dateColumn: "created_at", cloneable: true,
  },
};

/** Read-only entities that can also be exported but never imported. */
export const EXPORT_ONLY: Record<string, { table: string; label: string; dateColumn?: string }> = {
  sales: { table: "sales", label: "Ventas", dateColumn: "created_at" },
  sale_items: { table: "sale_items", label: "Líneas de venta", dateColumn: "created_at" },
  purchases: { table: "purchases", label: "Compras", dateColumn: "created_at" },
  purchase_items: { table: "purchase_items", label: "Líneas de compra", dateColumn: "created_at" },
  inventory_movements: { table: "inventory_movements", label: "Movimientos de inventario", dateColumn: "created_at" },
  invoices: { table: "invoices", label: "Facturas", dateColumn: "created_at" },
  sales_shifts: { table: "sales_shifts", label: "Turnos de caja", dateColumn: "created_at" },
  journal_entries: { table: "journal_entries", label: "Libro diario", dateColumn: "created_at" },
  pos_settings: { table: "pos_settings", label: "Configuración POS" },
  activity_log: { table: "activity_log", label: "Bitácora de actividad", dateColumn: "created_at" },
};

export const BACKUP_ENTITIES: EntityKey[] = Object.keys(ENTITIES) as EntityKey[];

export const CLONEABLE_ENTITIES: EntityKey[] = BACKUP_ENTITIES.filter((k) => ENTITIES[k].cloneable);

export function coerce(def: EntityDef, row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const col of def.columns) {
    if (!(col in row)) continue;
    let v = row[col];
    if (typeof v === "string") v = v.trim();
    if (v === "" || v === undefined) v = null;
    if (v !== null && def.numeric?.includes(col)) {
      const n = Number(String(v).replace(",", "."));
      v = Number.isFinite(n) ? n : null;
    }
    if (v !== null && def.bool?.includes(col)) {
      v = ["si", "sí", "yes", "true", "1", "x", "activo"].includes(String(v).toLowerCase());
    }
    out[col] = v;
  }
  return out;
}

export function validate(def: EntityDef, row: Record<string, unknown>): string[] {
  const issues: string[] = [];
  for (const col of def.required) {
    const v = row[col];
    if (v === null || v === undefined || String(v).trim() === "") issues.push(`Campo obligatorio vacío: ${col}`);
  }
  for (const col of def.numeric ?? []) {
    if (row[col] !== null && row[col] !== undefined && !Number.isFinite(Number(row[col]))) {
      issues.push(`Valor no numérico en ${col}`);
    }
    if (["price", "cost", "quantity", "stock", "rate"].includes(col) && Number(row[col]) < 0) {
      issues.push(`Valor negativo no permitido en ${col}`);
    }
  }
  return issues;
}
