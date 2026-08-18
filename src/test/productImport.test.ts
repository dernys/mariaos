import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { autoMap, buildTemplateWorkbook, parseWorkbook, validateRow, IMPORT_FIELDS } from "@/lib/productImport";

const toArrayBuffer = (wb: XLSX.WorkBook): ArrayBuffer =>
  XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;

describe("plantilla de importación", () => {
  it("genera hojas Productos e Instrucciones con todas las columnas", () => {
    const wb = buildTemplateWorkbook();
    expect(wb.SheetNames).toContain("Productos");
    expect(wb.SheetNames).toContain("Instrucciones");
    const { headers, rows } = parseWorkbook(toArrayBuffer(wb));
    expect(headers).toEqual(IMPORT_FIELDS.map((f) => f.header));
    expect(rows.length).toBeGreaterThan(0);
  });

  it("mapea automáticamente los encabezados de la plantilla y alias comunes", () => {
    const map = autoMap(["SKU", "Nombre", "Precio de venta", "Codigo de barras", "Columna rara"]);
    expect(map["SKU"]).toBe("sku");
    expect(map["Nombre"]).toBe("name");
    expect(map["Precio de venta"]).toBe("price");
    expect(map["Codigo de barras"]).toBe("barcode");
    expect(map["Columna rara"]).toBeUndefined();
  });

  it("rechaza archivos que no son Excel real aunque tengan extensión válida", () => {
    const fake = new TextEncoder().encode("<html>no soy un excel</html>").buffer;
    expect(() => parseWorkbook(fake)).toThrow();
  });
});

describe("validación de filas", () => {
  const rows = [
    { sku: "A-1", name: "Producto", price: "10", cost: "4", stock: "5", barcode: "111" },
    { sku: "A-1", name: "Duplicado", price: "10", cost: "4", stock: "5", barcode: "222" },
    { sku: "A-2", name: "", price: "abc", cost: "20", stock: "-1", barcode: "111" },
  ] as any[];

  it("acepta una fila correcta", () => {
    expect(validateRow(rows[0], 0, rows)).toHaveLength(0);
  });

  it("detecta SKU duplicado en el archivo", () => {
    const issues = validateRow(rows[1], 1, rows);
    expect(issues.some((i) => i.field === "sku" && i.level === "error")).toBe(true);
  });

  it("detecta campos obligatorios, precios no numéricos y duplicados de código de barras", () => {
    const issues = validateRow(rows[2], 2, rows);
    expect(issues.some((i) => i.field === "name")).toBe(true);
    expect(issues.some((i) => i.field === "price" && i.level === "error")).toBe(true);
    expect(issues.some((i) => i.field === "barcode")).toBe(true);
  });
});
