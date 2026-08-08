import { describe, it, expect } from "vitest";
import { journalIsBalanced, round2 } from "./invariants";

/**
 * Invariante de nómina (refleja post_payroll_journal_entry):
 *   Debe:  gasto salarial (bruto + SS empresa)
 *   Haber: SS por pagar + retenciones + neto pagado (+ residual de cuadre)
 */
function payrollEntry(p: {
  gross: number;
  net: number;
  ssCompany: number;
  ssWorker: number;
  tax: number;
}) {
  const lines = [
    { debit: p.gross },
    ...(p.ssCompany > 0 ? [{ debit: p.ssCompany }] : []),
    ...(p.ssCompany + p.ssWorker > 0 ? [{ credit: p.ssCompany + p.ssWorker }] : []),
    ...(p.tax > 0 ? [{ credit: p.tax }] : []),
    { credit: p.net },
  ];
  const debit = lines.reduce((s, l: any) => s + (l.debit ?? 0), 0);
  const credit = lines.reduce((s, l: any) => s + (l.credit ?? 0), 0);
  const diff = round2(debit - credit);
  if (diff > 0) lines.push({ credit: diff } as any);
  else if (diff < 0) lines.push({ debit: -diff } as any);
  return lines;
}

describe("invariante contable de nómina", () => {
  it("cuadra una nómina simple sin retenciones", () => {
    expect(journalIsBalanced(payrollEntry({ gross: 5000, net: 5000, ssCompany: 0, ssWorker: 0, tax: 0 }))).toBe(true);
  });

  it("cuadra con seguridad social y retención de impuesto", () => {
    const e = payrollEntry({ gross: 5250, net: 4725, ssCompany: 656.25, ssWorker: 262.5, tax: 262.5 });
    expect(journalIsBalanced(e)).toBe(true);
  });

  it("cuadra cuando existen otras deducciones (residual)", () => {
    const e = payrollEntry({ gross: 5000, net: 4000, ssCompany: 0, ssWorker: 0, tax: 500 });
    expect(journalIsBalanced(e)).toBe(true);
  });

  it("cuadra con importes con decimales", () => {
    const e = payrollEntry({ gross: 3675.33, net: 3307.5, ssCompany: 459.42, ssWorker: 183.77, tax: 184.06 });
    expect(journalIsBalanced(e)).toBe(true);
  });
});
