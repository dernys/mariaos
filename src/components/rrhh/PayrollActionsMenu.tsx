import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal, Eye, Edit2, Calculator, ShieldCheck, ShieldOff, CheckCircle2, Undo2,
  XCircle, Copy, Printer, Download, FileSignature, PenLine, History, Loader2,
} from "lucide-react";
import { printPayrollDocument, downloadPayrollDocument, type PayrollDocumentData } from "@/lib/payrollDocument";
import type { PayrollRow } from "./payrollTypes";

interface Props {
  payroll: PayrollRow;
  tenantName?: string | null;
  requireApproval?: boolean;
  signed?: boolean;
  onDetail: (p: PayrollRow) => void;
  onEdit: (p: PayrollRow) => void;
  onSign: (p: PayrollRow) => void;
  onRefresh: () => void;
}

export function buildDocData(p: PayrollRow, tenantName?: string | null, forSignature = false): PayrollDocumentData {
  const gross = Number(p.gross_salary ?? Number(p.base_salary) + Number(p.bonus));
  return {
    receiptNumber: p.receipt_number,
    tenantName: tenantName,
    employeeName: p.employees?.name || "Trabajador",
    employeeDocument: p.employees?.document_id ?? null,
    position: p.employees?.position ?? null,
    department: p.employees?.department ?? null,
    periodStart: p.period_start,
    periodEnd: p.period_end,
    hoursWorked: Number(p.hours_worked) || 0,
    overtimeAmount: p.overtime_amount ?? null,
    baseSalary: Number(p.base_salary) || 0,
    bonus: Number(p.bonus) || 0,
    deductions: Number(p.deductions) || 0,
    otherDeductions: p.other_deductions ?? null,
    grossPay: gross,
    netPay: Number(p.net_pay) || 0,
    generatedAt: p.created_at || new Date().toISOString(),
    paidAt: p.paid_at,
    status: p.status,
    notes: p.notes ?? null,
    forSignature,
  };
}

export function PayrollActionsMenu({ payroll: p, tenantName, requireApproval, signed, onDetail, onEdit, onSign, onRefresh }: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const run = async (fn: string, args: Record<string, any>, okTitle: string) => {
    setBusy(true);
    const { error } = await (supabase.rpc as any)(fn, args);
    setBusy(false);
    if (error) return toast({ title: "No se pudo completar la acción", description: error.message, variant: "destructive" });
    toast({ title: okTitle, description: `${p.employees?.name || "—"} · ${p.period_start} → ${p.period_end}` });
    onRefresh();
  };

  const isPending = p.status === "pending";
  const isApproved = p.status === "approved";
  const isPaid = p.status === "paid";
  const isCancelled = p.status === "cancelled";
  const canEdit = isPending || isApproved;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1" disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
          Acciones
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-[11px]">
          {p.employees?.name || "Trabajador"} · {Number(p.net_pay).toFixed(2)}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => onDetail(p)}>
          <Eye className="h-3.5 w-3.5 mr-2" /> Ver detalle
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDetail(p)}>
          <History className="h-3.5 w-3.5 mr-2" /> Historial y auditoría
        </DropdownMenuItem>

        {canEdit && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onEdit(p)}>
              <Edit2 className="h-3.5 w-3.5 mr-2" /> Editar importes
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => run("recompute_payroll_run", { p_payroll_id: p.id }, "Nómina recalculada")}>
              <Calculator className="h-3.5 w-3.5 mr-2" /> Recalcular con asistencia
            </DropdownMenuItem>
          </>
        )}

        {isPending && (
          <DropdownMenuItem onClick={() => run("approve_payroll_run", { p_payroll_id: p.id }, "Nómina aprobada")}>
            <ShieldCheck className="h-3.5 w-3.5 mr-2" /> Revisar y aprobar
          </DropdownMenuItem>
        )}
        {isApproved && (
          <DropdownMenuItem
            onClick={() => run("unapprove_payroll_run", { p_payroll_id: p.id, p_reason: "Revisión solicitada" }, "Aprobación retirada")}
          >
            <ShieldOff className="h-3.5 w-3.5 mr-2" /> Desaprobar
          </DropdownMenuItem>
        )}

        {!isPaid && !isCancelled && (
          <DropdownMenuItem
            disabled={!!requireApproval && !isApproved}
            onClick={() =>
              run("pay_payroll", { _payroll_id: p.id, _method: p.payment_method || "transfer", _notes: null }, "Pago registrado")
            }
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Registrar pago
          </DropdownMenuItem>
        )}
        {isPaid && (
          <DropdownMenuItem
            onClick={() => {
              if (!confirm("¿Revertir el pago de esta nómina? Se generará el movimiento de reverso.")) return;
              run("revert_payroll_payment", { p_payroll_id: p.id, p_reason: "Corrección de pago" }, "Pago revertido");
            }}
          >
            <Undo2 className="h-3.5 w-3.5 mr-2" /> Revertir pago
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => printPayrollDocument(buildDocData(p, tenantName))}>
          <Printer className="h-3.5 w-3.5 mr-2" /> Imprimir comprobante
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => downloadPayrollDocument(buildDocData(p, tenantName))}>
          <Download className="h-3.5 w-3.5 mr-2" /> Descargar nómina individual
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => printPayrollDocument(buildDocData(p, tenantName, true))}>
          <FileSignature className="h-3.5 w-3.5 mr-2" /> Exportar nómina para firma
        </DropdownMenuItem>
        {!isCancelled && (
          <DropdownMenuItem onClick={() => onSign(p)}>
            <PenLine className="h-3.5 w-3.5 mr-2" /> {signed ? "Añadir otra firma" : "Registrar firma del trabajador"}
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => run("duplicate_payroll_run", { p_payroll_id: p.id }, "Nómina duplicada")}>
          <Copy className="h-3.5 w-3.5 mr-2" /> Duplicar como nueva nómina
        </DropdownMenuItem>
        {!isPaid && !isCancelled && (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => {
              const reason = prompt("Motivo de la anulación:") || "";
              if (!reason) return;
              run("cancel_payroll_run", { p_payroll_id: p.id, p_reason: reason }, "Nómina anulada");
            }}
          >
            <XCircle className="h-3.5 w-3.5 mr-2" /> Anular nómina
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
