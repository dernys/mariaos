import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

/** Human labels for every importable column, per entity. */
export interface FieldDef {
  key: string;
  header: string;
  required?: boolean;
  hint?: string;
  example?: string | number;
}

export interface EntityForm {
  key: string;
  label: string;
  description: string;
  fields: FieldDef[];
  /** Only relevant for these tenant business types (empty = all). */
  businessTypes?: string[];
  importable: boolean;
}

const f = (key: string, header: string, opts: Partial<FieldDef> = {}): FieldDef => ({ key, header, ...opts });

export const ENTITY_FORMS: EntityForm[] = [
  {
    key: "product_categories", label: "Categorías", importable: true,
    description: "Familias y agrupaciones del catálogo.",
    fields: [
      f("name", "Nombre", { required: true, example: "Bebidas" }),
      f("description", "Descripción", { example: "Refrescos y jugos" }),
      f("color", "Color", { example: "#10b981" }),
      f("is_active", "Activo", { hint: "si / no", example: "si" }),
    ],
  },
  {
    key: "products", label: "Productos", importable: true,
    description: "Catálogo completo con precios, costos y stock inicial.",
    fields: [
      f("sku", "SKU", { required: true, example: "SKU-001" }),
      f("name", "Nombre", { required: true, example: "Café molido 500g" }),
      f("description", "Descripción", { example: "Café arábica tostado" }),
      f("category", "Categoría", { example: "Bebidas" }),
      f("brand", "Marca", { example: "Cubita" }),
      f("price", "Precio de venta", { required: true, example: 6 }),
      f("cost", "Precio de compra", { example: 3.5 }),
      f("stock", "Stock inicial", { example: 20 }),
      f("min_stock", "Stock mínimo", { example: 5 }),
      f("unit_code", "Unidad", { hint: "Código de unidad (u, kg, l...)", example: "u" }),
      f("product_type", "Tipo", { hint: "simple / preparado / servicio", example: "simple" }),
      f("is_active", "Activo", { hint: "si / no", example: "si" }),
      f("is_online", "Visible en marketplace", { hint: "si / no", example: "no" }),
      f("image_url", "Imagen (URL)", { example: "" }),
    ],
  },
  {
    key: "product_variants", label: "Variantes", importable: true,
    description: "Tallas, colores y presentaciones de un producto existente.",
    fields: [
      f("product_id", "ID del producto", { required: true }),
      f("name", "Nombre de la variante", { required: true, example: "Talla M" }),
      f("sku", "SKU", { example: "SKU-001-M" }),
      f("price", "Precio", { example: 6.5 }),
      f("cost", "Costo", { example: 3.8 }),
      f("barcode", "Código de barras", { example: "8412345678905" }),
      f("is_active", "Activo", { example: "si" }),
    ],
  },
  {
    key: "product_stock", label: "Inventario por ubicación", importable: true,
    description: "Existencias por tienda o almacén.",
    fields: [
      f("product_id", "ID del producto", { required: true }),
      f("location_type", "Tipo de ubicación", { required: true, hint: "store / warehouse", example: "warehouse" }),
      f("location_id", "ID de la ubicación", { required: true }),
      f("stock", "Existencia", { example: 25 }),
      f("min_stock", "Mínimo", { example: 5 }),
      f("max_stock", "Máximo", { example: 100 }),
    ],
  },
  {
    key: "customers", label: "Clientes", importable: true,
    description: "Cartera de clientes con límite de crédito.",
    fields: [
      f("name", "Nombre", { required: true, example: "Ana Pérez" }),
      f("phone", "Teléfono", { example: "+53 5555 5555" }),
      f("email", "Correo", { example: "ana@correo.cu" }),
      f("address", "Dirección", { example: "Calle 23 #123" }),
      f("rfc", "Identificación fiscal", { example: "" }),
      f("credit_limit", "Límite de crédito", { example: 500 }),
      f("notes", "Notas", { example: "" }),
    ],
  },
  {
    key: "suppliers", label: "Proveedores", importable: true,
    description: "Proveedores y datos de contacto.",
    fields: [
      f("name", "Nombre", { required: true, example: "Distribuidora Habana" }),
      f("contact_name", "Persona de contacto", { example: "Luis Gómez" }),
      f("phone", "Teléfono", { example: "+53 7777 7777" }),
      f("email", "Correo", { example: "ventas@dist.cu" }),
      f("address", "Dirección", { example: "" }),
      f("notes", "Notas", { example: "" }),
      f("is_active", "Activo", { example: "si" }),
    ],
  },
  {
    key: "employees", label: "Empleados", importable: true,
    description: "Plantilla de personal y salarios base.",
    fields: [
      f("name", "Nombre", { required: true, example: "Carlos Díaz" }),
      f("position", "Cargo", { example: "Cajero" }),
      f("salary", "Salario", { example: 5000 }),
      f("document_id", "Documento de identidad", { example: "85010112345" }),
      f("phone", "Teléfono", { example: "" }),
      f("email", "Correo", { example: "" }),
      f("department", "Departamento", { example: "Ventas" }),
      f("hire_date", "Fecha de alta", { hint: "AAAA-MM-DD", example: "2025-01-15" }),
      f("is_active", "Activo", { example: "si" }),
      f("notes", "Notas", { example: "" }),
    ],
  },
  {
    key: "warehouses", label: "Almacenes", importable: true,
    description: "Depósitos y centros de distribución.",
    fields: [
      f("name", "Nombre", { required: true, example: "Almacén Central" }),
      f("location", "Ubicación", { example: "La Habana" }),
      f("capacity", "Capacidad", { example: 1000 }),
      f("warehouse_type", "Tipo", { example: "principal" }),
      f("is_active", "Activo", { example: "si" }),
    ],
  },
  {
    key: "stores", label: "Tiendas / Sucursales", importable: true,
    description: "Puntos de venta del negocio.",
    fields: [
      f("name", "Nombre", { required: true, example: "Sucursal Vedado" }),
      f("address", "Dirección", { example: "Línea y G" }),
      f("phone", "Teléfono", { example: "" }),
      f("email", "Correo", { example: "" }),
      f("is_active", "Activa", { example: "si" }),
    ],
  },
  {
    key: "tax_rates", label: "Impuestos", importable: true,
    description: "Tipos impositivos configurables.",
    fields: [
      f("name", "Nombre", { required: true, example: "IVA 10%" }),
      f("code", "Código", { example: "IVA10" }),
      f("rate", "Porcentaje", { required: true, example: 10 }),
      f("is_default", "Por defecto", { example: "no" }),
      f("is_active", "Activo", { example: "si" }),
    ],
  },
  {
    key: "payment_methods", label: "Métodos de pago", importable: true,
    description: "Formas de cobro admitidas.",
    fields: [
      f("name", "Nombre", { required: true, example: "Efectivo" }),
      f("type", "Tipo", { required: true, hint: "cash / card / transfer / other", example: "cash" }),
      f("requires_card_info", "Requiere datos de tarjeta", { example: "no" }),
      f("is_active", "Activo", { example: "si" }),
    ],
  },
  {
    key: "units_of_measure", label: "Unidades de medida", importable: true,
    description: "Unidades usadas en compras, ventas y traslados.",
    fields: [
      f("code", "Código", { required: true, example: "kg" }),
      f("name", "Nombre", { required: true, example: "Kilogramo" }),
      f("decimals", "Decimales", { example: 3 }),
      f("factor", "Factor", { example: 1 }),
      f("is_default", "Por defecto", { example: "no" }),
      f("is_active", "Activa", { example: "si" }),
    ],
  },
  {
    key: "currencies", label: "Monedas", importable: true,
    description: "Divisas y tasas de cambio.",
    fields: [
      f("code", "Código", { required: true, example: "CUP" }),
      f("name", "Nombre", { required: true, example: "Peso cubano" }),
      f("symbol", "Símbolo", { required: true, example: "$" }),
      f("exchange_rate", "Tasa de cambio", { example: 1 }),
      f("is_base", "Moneda base", { example: "si" }),
      f("is_active", "Activa", { example: "si" }),
    ],
  },
  {
    key: "restaurant_tables", label: "Mesas", importable: true,
    businessTypes: ["restaurante", "bar", "cafeteria"],
    description: "Mapa de mesas del salón.",
    fields: [
      f("name", "Nombre", { required: true, example: "Mesa 1" }),
      f("capacity", "Capacidad", { example: 4 }),
      f("shape", "Forma", { hint: "square / round", example: "square" }),
      f("position_x", "Posición X", { example: 100 }),
      f("position_y", "Posición Y", { example: 120 }),
      f("status", "Estado", { hint: "free / occupied", example: "free" }),
    ],
  },
  {
    key: "product_recipes", label: "Recetas / Ingredientes", importable: true,
    businessTypes: ["restaurante", "bar", "cafeteria"],
    description: "Escandallos: ingredientes y cantidades por producto elaborado.",
    fields: [
      f("product_id", "ID del producto elaborado", { required: true }),
      f("ingredient_id", "ID del ingrediente", { required: true }),
      f("quantity", "Cantidad", { required: true, example: 0.2 }),
      f("unit", "Unidad", { required: true, example: "kg" }),
      f("waste_pct", "% merma", { example: 5 }),
      f("note", "Nota", { example: "" }),
    ],
  },
  {
    key: "combo_items", label: "Combos", importable: true,
    description: "Composición de combos y menús.",
    fields: [
      f("combo_product_id", "ID del combo", { required: true }),
      f("child_product_id", "ID del producto incluido", { required: true }),
      f("quantity", "Cantidad", { required: true, example: 1 }),
      f("is_optional", "Opcional", { example: "no" }),
      f("note", "Nota", { example: "" }),
    ],
  },
  {
    key: "promotions", label: "Promociones", importable: true,
    description: "Descuentos y campañas.",
    fields: [
      f("name", "Nombre", { required: true, example: "2x1 Bebidas" }),
      f("description", "Descripción", { example: "" }),
      f("promo_type", "Tipo", { required: true, hint: "percent / amount / bogo", example: "percent" }),
      f("discount_value", "Valor del descuento", { required: true, example: 10 }),
      f("scope", "Alcance", { hint: "all / category / product", example: "all" }),
      f("scope_value", "Valor del alcance", { example: "" }),
      f("min_qty", "Cantidad mínima", { example: 1 }),
      f("valid_from", "Válida desde", { example: "2026-01-01" }),
      f("valid_until", "Válida hasta", { example: "2026-12-31" }),
      f("is_active", "Activa", { example: "si" }),
    ],
  },
];

/** Entities that can only be exported (operational history). */
export const EXPORT_ONLY_ENTITIES = [
  { key: "sales", label: "Ventas" },
  { key: "sale_items", label: "Líneas de venta" },
  { key: "purchases", label: "Compras" },
  { key: "purchase_items", label: "Líneas de compra" },
  { key: "inventory_movements", label: "Movimientos de inventario" },
  { key: "invoices", label: "Facturas" },
  { key: "sales_shifts", label: "Turnos de caja" },
  { key: "journal_entries", label: "Libro diario" },
  { key: "pos_settings", label: "Configuración POS" },
  { key: "activity_log", label: "Bitácora de actividad" },
];

export const getForm = (key: string) => ENTITY_FORMS.find((e) => e.key === key);

export function formsForBusiness(businessType: string) {
  return ENTITY_FORMS.filter((e) => !e.businessTypes || e.businessTypes.includes(businessType));
}

/** Normalises a header for fuzzy matching. */
export const normHeader = (s: string) =>
  String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

export function autoMapHeaders(form: EntityForm, headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  headers.forEach((h) => {
    const n = normHeader(h);
    const hit = form.fields.find((fd) => normHeader(fd.header) === n || normHeader(fd.key) === n);
    if (hit && !Object.values(map).includes(hit.key)) map[h] = hit.key;
  });
  return map;
}

/** Excel forbids : \ / ? * [ ] in sheet names and caps them at 31 chars. */
export const safeSheetName = (label: string) =>
  String(label).replace(/[:\\/?*[\]]/g, "-").replace(/\s+/g, " ").trim().slice(0, 31) || "Datos";

export const EXAMPLE_MARKER = "EJEMPLO - BORRA ESTA FILA";

const fieldFormat = (fd: FieldDef) => {
  if (typeof fd.example === "number") return "Número (punto decimal)";
  if (/^(si|sí|no)$/i.test(String(fd.example ?? "")) || /\bsi\s*\/\s*no\b/i.test(fd.hint ?? "")) return "si / no";
  if (/date|valid_from|valid_until/.test(fd.key)) return "Fecha AAAA-MM-DD";
  if (fd.key.endsWith("_id")) return "UUID existente";
  return "Texto";
};

function entitySheet(form: EntityForm) {
  const headers = [...form.fields.map((fd) => fd.header), "AYUDA"];
  const example = [...form.fields.map((fd) => fd.example ?? ""), EXAMPLE_MARKER];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(14, h.length + 4) }));
  return ws;
}

function instructionsSheet(forms: EntityForm[]) {
  const aoa: (string | number)[][] = [
    ["MarIA OS — PLANTILLA DE IMPORTACIÓN", "", "", "", "", ""],
    [],
    ["CÓMO USAR ESTA PLANTILLA", "", "", "", "", ""],
    ["1. Cada hoja corresponde a una entidad del sistema. Rellena solo las hojas que necesites.", "", "", "", "", ""],
    ["2. NO cambies los nombres de las columnas de la primera fila.", "", "", "", "", ""],
    [`3. La segunda fila es un ejemplo y contiene "${EXAMPLE_MARKER}" en la columna AYUDA: se ignora al importar.`, "", "", "", "", ""],
    ["4. Los números usan punto decimal (12.50) y no llevan símbolos de moneda.", "", "", "", "", ""],
    ["5. Las fechas se escriben AAAA-MM-DD (2026-01-31).", "", "", "", "", ""],
    ["6. Los campos si/no aceptan: si, sí, no, true, false, 1, 0.", "", "", "", "", ""],
    ["7. Los campos obligatorios están marcados como Sí en la tabla inferior.", "", "", "", "", ""],
    [],
    ["REFERENCIAS ENTRE HOJAS", "", "", "", "", ""],
    ["· Productos: el SKU es la clave única. Si el SKU ya existe, el producto se actualiza; si no, se crea.", "", "", "", "", ""],
    ["· Código de barras: escríbelo como texto para no perder los ceros iniciales.", "", "", "", "", ""],
    ["· Categorías: escribe el nombre en la hoja de Productos. Si no existe, el asistente te ofrecerá crearla.", "", "", "", "", ""],
    ["· Inventario: usa el ID del producto y el ID de la tienda o almacén (puedes obtenerlos exportando esas entidades).", "", "", "", "", ""],
    ["· Precios: 'Precio de venta' es el precio al público; 'Precio de compra' es el costo.", "", "", "", "", ""],
    ["· Recetas y combos: requieren que los productos existan primero.", "", "", "", "", ""],
    [],
    ["CÓMO CORREGIR ERRORES", "", "", "", "", ""],
    ["Al subir el archivo verás una tabla de revisión: puedes editar cada celda, aceptar sugerencias,", "", "", "", "", ""],
    ["excluir filas y volver a validar antes de confirmar. Nada se guarda hasta que confirmas.", "", "", "", "", ""],
    [],
    ["Hoja", "Columna", "Obligatoria", "Descripción", "Formato", "Ejemplo"],
  ];
  forms.forEach((form) => {
    form.fields.forEach((fd) => {
      aoa.push([safeSheetName(form.label), fd.header, fd.required ? "Sí" : "No", fd.hint ?? form.description, fieldFormat(fd), String(fd.example ?? "")]);
    });
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 26 }, { wch: 28 }, { wch: 12 }, { wch: 58 }, { wch: 22 }, { wch: 18 }];
  return ws;
}

export function buildTemplate(form: EntityForm): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, instructionsSheet([form]), "INSTRUCCIONES");
  XLSX.utils.book_append_sheet(wb, entitySheet(form), safeSheetName(form.label));
  return wb;
}

export function downloadEntityTemplate(form: EntityForm) {
  XLSX.writeFile(buildTemplate(form), `plantilla-${form.key}.xlsx`);
}

export function buildFullTemplate(forms: EntityForm[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, instructionsSheet(forms), "INSTRUCCIONES");
  const used = new Set<string>(["INSTRUCCIONES"]);
  forms.forEach((form) => {
    let name = safeSheetName(form.label);
    let i = 2;
    while (used.has(name)) name = `${safeSheetName(form.label).slice(0, 28)}-${i++}`;
    used.add(name);
    XLSX.utils.book_append_sheet(wb, entitySheet(form), name);
  });
  return wb;
}

export function downloadFullTemplate(forms: EntityForm[]) {
  XLSX.writeFile(buildFullTemplate(forms), `plantilla-negocio-completo-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** Best-effort mapping from a workbook sheet name back to an entity key. */
export function entityForSheet(forms: EntityForm[], sheet: string): EntityForm | null {
  const n = normHeader(sheet);
  if (!n || n === normHeader("INSTRUCCIONES")) return null;
  return forms.find((f) => normHeader(safeSheetName(f.label)) === n)
    ?? forms.find((f) => normHeader(f.label) === n || normHeader(f.key) === n)
    ?? null;
}


/** Parses a workbook buffer verifying it is a genuine Excel/CSV container. */
export function parseSheet(buffer: ArrayBuffer, sheetName?: string) {
  const bytes = new Uint8Array(buffer.slice(0, 8));
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf;
  const wb = XLSX.read(buffer, { type: "array", raw: false });
  if (!isZip && !isOle && wb.SheetNames.length === 0) throw new Error("El archivo no es un Excel/CSV válido.");
  const name = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0];
  const ws = wb.Sheets[name];
  if (!ws) throw new Error("El archivo no contiene hojas de datos.");
  const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: "" });
  if (aoa.length === 0) throw new Error("La hoja está vacía.");
  const headers = (aoa[0] ?? []).map((h) => String(h ?? "").trim()).filter(Boolean);
  const rows = aoa.slice(1).map((r, i) => {
    const o: Record<string, any> = { __row: i + 2 };
    headers.forEach((h, idx) => (o[h] = r[idx] ?? ""));
    return o;
  });
  return { sheets: wb.SheetNames, sheet: name, headers, rows: rows.filter((r) => Object.entries(r).some(([k, v]) => k !== "__row" && String(v ?? "").trim() !== "")) };
}

export async function sha256Hex(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Single bridge to the data-center edge function. */
export async function callDataCenter<T = any>(payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("data-center", { body: payload });
  if (error) {
    const detail = (data as any)?.error;
    throw new Error(detail || error.message || "Error en el Data Center");
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export function rowsToWorkbook(rows: Record<string, unknown>[], sheet = "Datos") {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 28));
  return wb;
}

export function downloadRows(rows: Record<string, unknown>[], filename: string, format: "xlsx" | "csv" | "json") {
  if (format === "json") {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    return;
  }
  const wb = rowsToWorkbook(rows, filename);
  XLSX.writeFile(wb, `${filename}.${format}`);
}

export function errorReportCsv(errors: { row: number; field?: string; value?: string; problem: string; fix: string }[]) {
  const head = "Fila,Campo,Valor,Problema,Cómo corregirlo\n";
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return head + errors.map((e) => [e.row, esc(e.field ?? ""), esc(e.value ?? ""), esc(e.problem), esc(e.fix)].join(",")).join("\n");
}
