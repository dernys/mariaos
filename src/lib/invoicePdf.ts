import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface InvoiceItem {
  product_name: string;
  sku?: string | null;
  qty: number;
  price: number;
  total: number;
}

export interface InvoiceData {
  series_code: string;
  invoice_number: string;
  issue_date: string;
  status: string;
  issuer_name: string;
  issuer_tax_id?: string | null;
  issuer_address?: string | null;
  issuer_phone?: string | null;
  issuer_email?: string | null;
  customer_name: string;
  customer_tax_id?: string | null;
  customer_address?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  amount_paid: number;
  items: InvoiceItem[];
  notes?: string | null;
}

const fmt = (n: number, cur: string) =>
  new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2 }).format(Number(n || 0)) + " " + cur;

export function generateInvoicePdf(inv: InvoiceData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  let y = 15;

  // Encabezado
  doc.setFontSize(20).setFont("helvetica", "bold");
  doc.text("FACTURA", 15, y);
  doc.setFontSize(10).setFont("helvetica", "normal");
  doc.text(`Nº ${inv.invoice_number}`, W - 15, y, { align: "right" });
  y += 6;
  doc.setFontSize(9);
  doc.text(`Serie: ${inv.series_code}    Fecha: ${inv.issue_date}`, W - 15, y, { align: "right" });
  y += 4;
  if (inv.status === "cancelled") {
    doc.setTextColor(200, 0, 0).setFont("helvetica", "bold").setFontSize(14);
    doc.text("ANULADA", W - 15, y + 6, { align: "right" });
    doc.setTextColor(0, 0, 0).setFont("helvetica", "normal").setFontSize(9);
  }

  y += 8;
  // Emisor
  doc.setFont("helvetica", "bold").setFontSize(11);
  doc.text(inv.issuer_name, 15, y);
  doc.setFont("helvetica", "normal").setFontSize(9);
  y += 5;
  if (inv.issuer_tax_id) { doc.text(`ID Fiscal: ${inv.issuer_tax_id}`, 15, y); y += 4; }
  if (inv.issuer_address) { doc.text(inv.issuer_address, 15, y); y += 4; }
  const contact = [inv.issuer_phone, inv.issuer_email].filter(Boolean).join("  ·  ");
  if (contact) { doc.text(contact, 15, y); y += 4; }

  y += 4;
  // Cliente
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text("Facturar a:", 15, y);
  y += 5;
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(inv.customer_name, 15, y); y += 4;
  if (inv.customer_tax_id) { doc.text(`ID Fiscal: ${inv.customer_tax_id}`, 15, y); y += 4; }
  if (inv.customer_address) { doc.text(inv.customer_address, 15, y); y += 4; }
  const cContact = [inv.customer_phone, inv.customer_email].filter(Boolean).join("  ·  ");
  if (cContact) { doc.text(cContact, 15, y); y += 4; }

  y += 4;
  // Tabla de items
  autoTable(doc, {
    startY: y,
    head: [["#", "Descripción", "Cant.", "Precio", "Total"]],
    body: inv.items.map((it, i) => [
      String(i + 1),
      it.product_name + (it.sku ? `\n${it.sku}` : ""),
      String(it.qty),
      fmt(it.price, inv.currency),
      fmt(it.total, inv.currency),
    ]),
    headStyles: { fillColor: [16, 185, 129], textColor: 255 },
    styles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 10 }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    margin: { left: 15, right: 15 },
  });

  // @ts-ignore
  let endY = (doc as any).lastAutoTable.finalY + 6;

  // Totales
  const tx = W - 15;
  doc.setFontSize(10);
  doc.text("Subtotal:", tx - 50, endY);
  doc.text(fmt(inv.subtotal, inv.currency), tx, endY, { align: "right" });
  endY += 5;
  doc.text("Impuestos:", tx - 50, endY);
  doc.text(fmt(inv.tax, inv.currency), tx, endY, { align: "right" });
  endY += 5;
  doc.setFont("helvetica", "bold").setFontSize(12);
  doc.text("TOTAL:", tx - 50, endY);
  doc.text(fmt(inv.total, inv.currency), tx, endY, { align: "right" });
  endY += 6;
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text("Pagado:", tx - 50, endY);
  doc.text(fmt(inv.amount_paid, inv.currency), tx, endY, { align: "right" });
  endY += 5;
  const pending = Number(inv.total) - Number(inv.amount_paid);
  if (pending > 0.01) {
    doc.setTextColor(200, 0, 0);
    doc.text("Pendiente:", tx - 50, endY);
    doc.text(fmt(pending, inv.currency), tx, endY, { align: "right" });
    doc.setTextColor(0, 0, 0);
    endY += 5;
  }

  if (inv.notes) {
    endY += 6;
    doc.setFontSize(8).setFont("helvetica", "italic");
    doc.text("Notas: " + inv.notes, 15, endY, { maxWidth: W - 30 });
  }

  return doc;
}

export function downloadInvoicePdf(inv: InvoiceData) {
  const doc = generateInvoicePdf(inv);
  doc.save(`Factura_${inv.invoice_number}.pdf`);
}

export function getInvoicePdfBlob(inv: InvoiceData): Blob {
  return generateInvoicePdf(inv).output("blob");
}

export function getInvoicePdfBase64(inv: InvoiceData): string {
  return generateInvoicePdf(inv).output("datauristring").split(",")[1];
}
