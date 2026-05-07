import * as XLSX from "xlsx";
import Papa from "papaparse";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type ExportColumn<T> = {
  key: keyof T | string;
  label: string;
  format?: (row: T) => string | number;
};

function getValue<T>(row: T, col: ExportColumn<T>): any {
  if (col.format) return col.format(row);
  const v = (row as any)[col.key as string];
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

function buildRows<T>(rows: T[], cols: ExportColumn<T>[]) {
  return rows.map((r) => {
    const o: Record<string, any> = {};
    cols.forEach((c) => (o[c.label] = getValue(r, c)));
    return o;
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCsv<T>(rows: T[], cols: ExportColumn<T>[], filename: string) {
  const csv = Papa.unparse(buildRows(rows, cols));
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `${filename}.csv`);
}

export function exportExcel<T>(rows: T[], cols: ExportColumn<T>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(buildRows(rows, cols));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Datos");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportPdf<T>(rows: T[], cols: ExportColumn<T>[], filename: string, title?: string) {
  const doc = new jsPDF({ orientation: "landscape" });
  if (title) {
    doc.setFontSize(14);
    doc.text(title, 14, 15);
  }
  autoTable(doc, {
    startY: title ? 22 : 14,
    head: [cols.map((c) => c.label)],
    body: rows.map((r) => cols.map((c) => String(getValue(r, c)))),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [16, 185, 129] },
  });
  doc.save(`${filename}.pdf`);
}
