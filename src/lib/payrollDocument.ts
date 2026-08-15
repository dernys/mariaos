// Documento oficial de nómina (recibo y versión para firma).
// Se genera como HTML imprimible en una ventana nueva → imprimir o "Guardar como PDF".

export interface PayrollDocumentData {
  receiptNumber?: string | null;
  tenantName?: string | null;
  employeeName: string;
  employeeDocument?: string | null;
  position?: string | null;
  department?: string | null;
  periodStart: string;
  periodEnd: string;
  daysWorked?: number | null;
  hoursWorked: number;
  overtimeAmount?: number | null;
  baseSalary: number;
  bonus: number;
  commissions?: number | null;
  advances?: number | null;
  deductions: number;
  otherDeductions?: number | null;
  grossPay: number;
  netPay: number;
  currency?: string;
  generatedAt: string;
  paidAt?: string | null;
  status: string;
  notes?: string | null;
  /** Añade el bloque de firma del trabajador y del responsable. */
  forSignature?: boolean;
  signedBy?: string | null;
  signedAt?: string | null;
}

const money = (n: number, currency = "CUP") =>
  `${(Number(n) || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

const STATUS_LABEL: Record<string, string> = {
  pending: "Generada",
  approved: "Aprobada",
  paid: "Pagada",
  cancelled: "Anulada",
};

export function buildPayrollDocumentHtml(d: PayrollDocumentData): string {
  const cur = d.currency || "CUP";
  const row = (label: string, value: string, strong = false, negative = false) => `
    <tr>
      <td class="lbl">${label}</td>
      <td class="val ${strong ? "strong" : ""} ${negative ? "neg" : ""}">${value}</td>
    </tr>`;

  const optional = (label: string, v: number | null | undefined, negative = false) =>
    v === null || v === undefined || Number(v) === 0 ? "" : row(label, money(Number(v), cur), false, negative);

  const signature = d.forSignature
    ? `
    <div class="sign">
      <div class="sign-box">
        <p class="sign-line"></p>
        <p class="sign-name">${d.employeeName}</p>
        <p class="sign-role">Firma del trabajador · Fecha: ______________</p>
      </div>
      <div class="sign-box">
        <p class="sign-line"></p>
        <p class="sign-name">${d.tenantName || "Responsable"}</p>
        <p class="sign-role">Firma del responsable · Fecha: ______________</p>
      </div>
    </div>
    <p class="declare">Declaro haber recibido el importe neto indicado en este documento correspondiente al período señalado.</p>`
    : d.signedBy
    ? `<p class="signed">Firmado por <b>${d.signedBy}</b>${d.signedAt ? ` el ${new Date(d.signedAt).toLocaleString("es-ES")}` : ""}.</p>`
    : "";

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<title>Nómina ${d.receiptNumber || ""} · ${d.employeeName}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "DejaVu Sans", Arial, Helvetica, sans-serif; color: #101828; margin: 0; padding: 24px; font-size: 12px; }
  .doc { max-width: 720px; margin: 0 auto; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #101828; padding-bottom: 10px; }
  h1 { font-size: 18px; margin: 0 0 2px; letter-spacing: .5px; }
  .muted { color: #667085; font-size: 11px; }
  .badge { border: 1px solid #101828; border-radius: 999px; padding: 3px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: .8px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin: 16px 0; }
  .grid div span { display: block; }
  .k { color: #667085; font-size: 10px; text-transform: uppercase; letter-spacing: .6px; }
  .v { font-weight: 600; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  td { padding: 6px 4px; border-bottom: 1px solid #eaecf0; }
  td.val { text-align: right; font-variant-numeric: tabular-nums; }
  td.strong, tr.total td { font-weight: 700; }
  td.neg { color: #b42318; }
  tr.total td { border-top: 2px solid #101828; border-bottom: none; font-size: 14px; padding-top: 10px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .8px; margin: 18px 0 0; color: #667085; }
  .sign { display: flex; gap: 32px; margin-top: 48px; }
  .sign-box { flex: 1; }
  .sign-line { border-top: 1px solid #101828; margin: 0 0 6px; }
  .sign-name { margin: 0; font-weight: 600; }
  .sign-role { margin: 2px 0 0; color: #667085; font-size: 10px; }
  .declare { margin-top: 24px; font-size: 10px; color: #667085; }
  .signed { margin-top: 32px; padding: 10px; background: #f2f4f7; border-radius: 6px; }
  footer { margin-top: 32px; border-top: 1px solid #eaecf0; padding-top: 8px; color: #98a2b3; font-size: 10px; display: flex; justify-content: space-between; }
  @media print { body { padding: 0; } }
</style></head>
<body><div class="doc">
  <header>
    <div>
      <h1>${d.tenantName || "Negocio"}</h1>
      <p class="muted">${d.forSignature ? "Nómina para firma del trabajador" : "Recibo de nómina"}${d.receiptNumber ? ` · Nº ${d.receiptNumber}` : ""}</p>
    </div>
    <span class="badge">${STATUS_LABEL[d.status] || d.status}</span>
  </header>

  <div class="grid">
    <div><span class="k">Trabajador</span><span class="v">${d.employeeName}</span></div>
    <div><span class="k">Identificación</span><span class="v">${d.employeeDocument || "—"}</span></div>
    <div><span class="k">Cargo</span><span class="v">${d.position || "—"}</span></div>
    <div><span class="k">Departamento</span><span class="v">${d.department || "—"}</span></div>
    <div><span class="k">Período</span><span class="v">${d.periodStart} → ${d.periodEnd}</span></div>
    <div><span class="k">Moneda</span><span class="v">${cur}</span></div>
    <div><span class="k">Horas trabajadas</span><span class="v">${(Number(d.hoursWorked) || 0).toFixed(2)} h</span></div>
    <div><span class="k">Días trabajados</span><span class="v">${d.daysWorked ?? "—"}</span></div>
    <div><span class="k">Fecha de generación</span><span class="v">${new Date(d.generatedAt).toLocaleDateString("es-ES")}</span></div>
    <div><span class="k">Fecha de pago</span><span class="v">${d.paidAt ? new Date(d.paidAt).toLocaleDateString("es-ES") : "Pendiente"}</span></div>
  </div>

  <h2>Devengos</h2>
  <table>
    ${row("Salario base del período", money(d.baseSalary, cur))}
    ${optional("Horas extra", d.overtimeAmount)}
    ${optional("Bonificaciones", d.bonus)}
    ${optional("Comisiones", d.commissions)}
    <tr class="total"><td>Total bruto</td><td class="val">${money(d.grossPay, cur)}</td></tr>
  </table>

  <h2>Deducciones</h2>
  <table>
    ${row("Deducciones", money(d.deductions, cur), false, true)}
    ${optional("Otras deducciones", d.otherDeductions, true)}
    ${optional("Anticipos", d.advances, true)}
    <tr class="total"><td>Total neto a percibir</td><td class="val">${money(d.netPay, cur)}</td></tr>
  </table>

  ${d.notes ? `<h2>Observaciones</h2><p>${d.notes}</p>` : ""}
  ${signature}

  <footer>
    <span>${d.tenantName || ""} · MarIA OS</span>
    <span>Generado el ${new Date().toLocaleString("es-ES")}</span>
  </footer>
</div></body></html>`;
}

function openDocumentWindow(html: string, autoPrint: boolean) {
  const w = window.open("", "_blank", "width=860,height=1000");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  if (autoPrint) {
    w.onload = () => {
      w.focus();
      w.print();
    };
    setTimeout(() => {
      try {
        w.focus();
        w.print();
      } catch {
        /* ignore */
      }
    }, 400);
  }
  return true;
}

/** Abre el documento e inicia la impresión (permite "Guardar como PDF"). */
export function printPayrollDocument(d: PayrollDocumentData) {
  return openDocumentWindow(buildPayrollDocumentHtml(d), true);
}

/** Descarga el documento como archivo HTML autocontenido. */
export function downloadPayrollDocument(d: PayrollDocumentData) {
  const html = buildPayrollDocumentHtml(d);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const slug = `${d.employeeName}-${d.periodStart}`.replace(/[^\w.-]+/g, "_");
  a.href = url;
  a.download = `nomina-${slug}${d.forSignature ? "-firma" : ""}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Abre el documento sin imprimir (vista previa / compartir). */
export function previewPayrollDocument(d: PayrollDocumentData) {
  return openDocumentWindow(buildPayrollDocumentHtml(d), false);
}
