import * as XLSX from "xlsx";

/** Canonical import columns. `key` is the internal field name. */
export type ImportField = {
  key: string;
  header: string;
  required?: boolean;
  hint: string;
  example: string | number;
};

export const IMPORT_FIELDS: ImportField[] = [
  { key: "sku", header: "SKU", required: true, hint: "Código único del producto", example: "SKU-001" },
  { key: "name", header: "Nombre", required: true, hint: "Nombre comercial", example: "Café Molido 500g" },
  { key: "description", header: "Descripción", hint: "Texto libre", example: "Café arábica tostado" },
  { key: "category", header: "Categoría", hint: "Debe existir o se creará como texto", example: "Bebidas" },
  { key: "brand", header: "Marca", hint: "Marca o fabricante", example: "Cubita" },
  { key: "unit_code", header: "Unidad", hint: "Código de unidad de medida (u, kg, l...)", example: "u" },
  { key: "barcode", header: "Código de barras", hint: "EAN/UPC opcional", example: "8412345678905" },
  { key: "cost", header: "Precio de compra", hint: "Costo unitario, número", example: 3.5 },
  { key: "price", header: "Precio de venta", required: true, hint: "Precio de venta, número", example: 6 },
  { key: "tax", header: "Impuesto", hint: "Nombre del impuesto configurado o % (ej: 10)", example: "IVA 10%" },
  { key: "currency", header: "Moneda", hint: "Código de moneda configurada", example: "CUP" },
  { key: "stock", header: "Stock inicial", hint: "Cantidad entera", example: 20 },
  { key: "min_stock", header: "Stock mínimo", hint: "Cantidad entera", example: 5 },
  { key: "supplier", header: "Proveedor", hint: "Nombre del proveedor existente", example: "Distribuidora Habana" },
  { key: "location", header: "Almacén/Tienda", hint: "Nombre del almacén o tienda existente", example: "Almacén Central" },
  { key: "is_active", header: "Activo", hint: "si / no", example: "si" },
  { key: "variants", header: "Variantes", hint: 'Formato: Nombre|SKU|precio ; separadas por ";"', example: "Talla M|SKU-001-M|6.5; Talla L|SKU-001-L|7" },
];

export const REQUIRED_KEYS = IMPORT_FIELDS.filter((f) => f.required).map((f) => f.key);

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type ImportRow = Record<string, string | number | boolean | null>;

export type RowIssue = { level: "error" | "warning"; field?: string; message: string };

export function buildTemplateWorkbook(): XLSX.WorkBook {
  const headers = IMPORT_FIELDS.map((f) => f.header);
  const example = IMPORT_FIELDS.map((f) => f.example);
  const second = IMPORT_FIELDS.map((f) =>
    f.key === "sku" ? "SKU-002" : f.key === "name" ? "Té Verde 250g" : f.key === "variants" ? "" : f.example,
  );
  const ws = XLSX.utils.aoa_to_sheet([headers, example, second]);
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(14, h.length + 4) }));

  const guide = XLSX.utils.aoa_to_sheet([
    ["Columna", "Obligatoria", "Descripción"],
    ...IMPORT_FIELDS.map((f) => [f.header, f.required ? "Sí" : "No", f.hint]),
    [],
    ["Notas", "", ""],
    ["No cambies los nombres de las columnas de la hoja Productos.", "", ""],
    [`Máximo ${MAX_IMPORT_ROWS} filas por archivo.`, "", ""],
    ["Los números deben usar punto decimal.", "", ""],
  ]);
  guide["!cols"] = [{ wch: 24 }, { wch: 12 }, { wch: 70 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Productos");
  XLSX.utils.book_append_sheet(wb, guide, "Instrucciones");
  return wb;
}

export function downloadTemplate(filename = "plantilla-productos.xlsx") {
  XLSX.writeFile(buildTemplateWorkbook(), filename);
}

/** Best-effort automatic header → field mapping. */
const norm = (s: string) =>
  s
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

const ALIASES: Record<string, string> = {
  codigo: "sku", code: "sku", sku: "sku", codigoproducto: "sku",
  nombre: "name", name: "name", producto: "name", descripcion: "description",
  categoria: "category", marca: "brand", unidad: "unit_code", unidaddemedida: "unit_code",
  codigodebarras: "barcode", barcode: "barcode", ean: "barcode",
  preciodecompra: "cost", costo: "cost", cost: "cost",
  preciodeventa: "price", precio: "price", price: "price",
  impuesto: "tax", tax: "tax", iva: "tax",
  moneda: "currency", currency: "currency",
  stockinicial: "stock", stock: "stock", existencia: "stock",
  stockminimo: "min_stock", minimo: "min_stock",
  proveedor: "supplier", supplier: "supplier",
  almacentienda: "location", almacen: "location", tienda: "location", location: "location",
  activo: "is_active", productoactivo: "is_active", active: "is_active",
  variantes: "variants", variants: "variants",
};

export function autoMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  headers.forEach((h) => {
    const n = norm(h);
    const direct = IMPORT_FIELDS.find((f) => norm(f.header) === n);
    const key = direct?.key ?? ALIASES[n];
    if (key && !Object.values(map).includes(key)) map[h] = key;
  });
  return map;
}

/** Reads a workbook buffer, verifying it is a real XLSX/XLS container. */
export function parseWorkbook(buffer: ArrayBuffer): { headers: string[]; rows: Record<string, any>[] } {
  const bytes = new Uint8Array(buffer.slice(0, 8));
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // xlsx (zip)
  const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf; // legacy xls
  if (!isZip && !isOle) throw new Error("El archivo no es un Excel válido (contenido no reconocido).");
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames.find((n) => norm(n) === "productos") ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error("El archivo no contiene hojas de datos.");
  const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: "" });
  if (aoa.length === 0) throw new Error("La hoja está vacía.");
  const headers = (aoa[0] ?? []).map((h) => String(h ?? "").trim()).filter(Boolean);
  const rows = aoa.slice(1).map((r) => {
    const o: Record<string, any> = {};
    headers.forEach((h, i) => (o[h] = r[i] ?? ""));
    return o;
  });
  return { headers, rows: rows.filter((r) => Object.values(r).some((v) => String(v ?? "").trim() !== "")) };
}

export function toBool(v: unknown, fallback = true): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return fallback;
  return ["si", "sí", "yes", "true", "1", "x", "activo"].includes(s);
}

export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Client-side validation used for preview; the server re-validates everything. */
export function validateRow(row: ImportRow, index: number, allRows: ImportRow[]): RowIssue[] {
  const issues: RowIssue[] = [];
  REQUIRED_KEYS.forEach((k) => {
    if (String(row[k] ?? "").trim() === "") issues.push({ level: "error", field: k, message: `Campo obligatorio vacío` });
  });
  const price = toNumber(row.price);
  if (row.price !== "" && price === null) issues.push({ level: "error", field: "price", message: "Precio no numérico" });
  if (price !== null && price < 0) issues.push({ level: "error", field: "price", message: "Precio negativo" });
  const cost = toNumber(row.cost);
  if (String(row.cost ?? "") !== "" && cost === null) issues.push({ level: "error", field: "cost", message: "Costo no numérico" });
  if (price !== null && cost !== null && cost > price) issues.push({ level: "warning", field: "price", message: "El costo es mayor que el precio de venta" });
  const stock = toNumber(row.stock);
  if (String(row.stock ?? "") !== "" && stock === null) issues.push({ level: "error", field: "stock", message: "Stock no numérico" });

  const sku = String(row.sku ?? "").trim().toLowerCase();
  if (sku) {
    const dup = allRows.findIndex((r, i) => i !== index && String(r.sku ?? "").trim().toLowerCase() === sku);
    if (dup > -1 && dup < index) issues.push({ level: "error", field: "sku", message: `SKU duplicado en el archivo (fila ${dup + 2})` });
  }
  const bc = String(row.barcode ?? "").trim();
  if (bc) {
    const dup = allRows.findIndex((r, i) => i !== index && String(r.barcode ?? "").trim() === bc);
    if (dup > -1 && dup < index) issues.push({ level: "error", field: "barcode", message: `Código de barras duplicado (fila ${dup + 2})` });
  }
  return issues;
}

export function errorReportCsv(rows: { row: number; sku: string; messages: string[] }[]): string {
  const head = "Fila,SKU,Problemas\n";
  return head + rows.map((r) => `${r.row},"${r.sku.replace(/"/g, '""')}","${r.messages.join(" | ").replace(/"/g, '""')}"`).join("\n");
}
