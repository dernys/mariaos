// Imprime un ticket de 80mm en una ventana nueva. PDF descargable vía window.print() → "Guardar como PDF".
export interface ReceiptItem {
  name: string;
  qty: number;
  price: number;
  total: number;
}

export interface ReceiptPayment {
  method: string;
  currency: string;
  amount: number;
}

export interface ReceiptData {
  ticketNumber: string;
  tenantName?: string;
  storeName?: string;
  cashier?: string;
  customer?: string;
  date: Date;
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
  change: number;
  payments: ReceiptPayment[];
  footer?: string;
}

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function printThermalReceipt(data: ReceiptData) {
  const win = window.open("", "_blank", "width=320,height=600");
  if (!win) return;

  const html = `<!doctype html>
<html><head><meta charset="utf-8"/><title>Ticket ${data.ticketNumber}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html,body { margin:0; padding:0; }
  body { width: 80mm; font-family: 'Courier New', monospace; font-size: 11px; color:#000; padding: 4mm; }
  .center { text-align:center; }
  .right { text-align:right; }
  .bold { font-weight: 700; }
  .lg { font-size: 14px; }
  .sm { font-size: 10px; }
  hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  table { width:100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 1px 0; }
  .row { display:flex; justify-content:space-between; }
  .item-name { word-break: break-word; }
  .actions { padding: 12px 4px; text-align:center; }
  .actions button { margin: 0 4px; padding: 6px 12px; font-size: 12px; cursor:pointer; }
  @media print { .actions { display:none; } }
</style></head><body>
  <div class="center bold lg">${escapeHtml(data.tenantName || "POS")}</div>
  ${data.storeName ? `<div class="center sm">${escapeHtml(data.storeName)}</div>` : ""}
  <hr/>
  <div class="row sm"><span>Ticket:</span><span class="bold">${escapeHtml(data.ticketNumber)}</span></div>
  <div class="row sm"><span>Fecha:</span><span>${data.date.toLocaleString()}</span></div>
  ${data.cashier ? `<div class="row sm"><span>Cajero:</span><span>${escapeHtml(data.cashier)}</span></div>` : ""}
  ${data.customer ? `<div class="row sm"><span>Cliente:</span><span>${escapeHtml(data.customer)}</span></div>` : ""}
  <hr/>
  <table>
    ${data.items
      .map(
        (it) => `
      <tr><td colspan="2" class="item-name">${escapeHtml(it.name)}</td></tr>
      <tr>
        <td class="sm">${it.qty} x ${fmt(it.price)}</td>
        <td class="right bold">${fmt(it.total)}</td>
      </tr>`
      )
      .join("")}
  </table>
  <hr/>
  <div class="row"><span>Subtotal</span><span>${fmt(data.subtotal)}</span></div>
  ${data.tax > 0 ? `<div class="row"><span>Impuesto</span><span>${fmt(data.tax)}</span></div>` : ""}
  <div class="row bold lg"><span>TOTAL</span><span>${fmt(data.total)}</span></div>
  <hr/>
  ${data.payments
    .map(
      (p) =>
        `<div class="row sm"><span>${escapeHtml(p.method)} (${escapeHtml(p.currency)})</span><span>${fmt(p.amount)}</span></div>`
    )
    .join("")}
  <div class="row"><span>Pagado</span><span>${fmt(data.paid)}</span></div>
  ${data.change > 0 ? `<div class="row bold"><span>Cambio</span><span>${fmt(data.change)}</span></div>` : ""}
  <hr/>
  <div class="center sm">${escapeHtml(data.footer || "¡Gracias por su compra!")}</div>
  <div class="actions">
    <button onclick="window.print()">Imprimir</button>
    <button onclick="window.close()">Cerrar</button>
  </div>
  <script>setTimeout(function(){ window.print(); }, 350);</script>
</body></html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
