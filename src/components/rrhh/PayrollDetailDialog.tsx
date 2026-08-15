import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Printer, FileSignature, Download, PenLine, Loader2, History, Receipt, ShieldCheck } from "lucide-react";
import { printPayrollDocument, downloadPayrollDocument } from "@/lib/payrollDocument";
import { buildDocData } from "./PayrollActionsMenu";
import {
  PAYROLL_EVENT_LABEL, PAYROLL_STATUS_LABEL,
  type PayrollEvent, type PayrollRow, type PayrollSignature,
} from "./payrollTypes";

interface Props {
  payroll: PayrollRow | null;
  tenantName?: string | null;
  onOpenChange: (open: boolean) => void;
  onSign: (p: PayrollRow) => void;
  refreshKey?: number;
}

const money = (n: number) => (Number(n) || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const statusVariant = (s: string) =>
  s === "paid" ? "bg-emerald-500/15 text-emerald-500"
  : s === "approved" ? "bg-primary/15 text-primary"
  : s === "cancelled" ? "bg-destructive/15 text-destructive"
  : "bg-amber-500/15 text-amber-600";

export function PayrollDetailDialog({ payroll: p, tenantName, onOpenChange, onSign, refreshKey = 0 }: Props) {
  const [events, setEvents] = useState<PayrollEvent[]>([]);
  const [signatures, setSignatures] = useState<PayrollSignature[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!p) return;
    setLoading(true);
    Promise.all([
      supabase.from("payroll_events" as any).select("*").eq("payroll_id", p.id).order("created_at", { ascending: false }),
      supabase.from("payroll_signatures" as any).select("*").eq("payroll_id", p.id).order("signed_at", { ascending: false }),
    ]).then(([e, s]) => {
      setEvents(((e.data as any) || []) as PayrollEvent[]);
      setSignatures(((s.data as any) || []) as PayrollSignature[]);
      setLoading(false);
    });
  }, [p, refreshKey]);

  if (!p) return null;
  const gross = Number(p.gross_salary ?? Number(p.base_salary) + Number(p.bonus));
  const line = (k: string, v: string, negative = false) => (
    <div className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className={`font-medium tabular-nums ${negative ? "text-destructive" : ""}`}>{v}</span>
    </div>
  );

  return (
    <Dialog open={!!p} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" /> {p.employees?.name || "Trabajador"}
            <Badge className={`text-[10px] ${statusVariant(p.status)}`}>{PAYROLL_STATUS_LABEL[p.status] || p.status}</Badge>
          </DialogTitle>
          <DialogDescription>
            Período {p.period_start} → {p.period_end}
            {p.receipt_number ? ` · Comprobante Nº ${p.receipt_number}` : ""}
            {p.employees?.position ? ` · ${p.employees.position}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1" onClick={() => printPayrollDocument(buildDocData(p, tenantName))}>
            <Printer className="h-3.5 w-3.5" /> Imprimir
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => downloadPayrollDocument(buildDocData(p, tenantName))}>
            <Download className="h-3.5 w-3.5" /> Descargar
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => printPayrollDocument(buildDocData(p, tenantName, true))}>
            <FileSignature className="h-3.5 w-3.5" /> Documento para firma
          </Button>
          <Button size="sm" className="gap-1 gradient-brand text-primary-foreground" onClick={() => onSign(p)}>
            <PenLine className="h-3.5 w-3.5" /> Registrar firma
          </Button>
        </div>

        <Tabs defaultValue="resumen" className="mt-2">
          <TabsList>
            <TabsTrigger value="resumen">Desglose</TabsTrigger>
            <TabsTrigger value="historial">Historial ({events.length})</TabsTrigger>
            <TabsTrigger value="firmas">Firmas ({signatures.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="resumen" className="space-y-3 pt-3">
            <div className="rounded-lg border p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Devengos</p>
              {line("Salario base del período", money(p.base_salary))}
              {Number(p.overtime_amount || 0) !== 0 && line("Horas extra", money(p.overtime_amount || 0))}
              {line("Bonificaciones", money(p.bonus))}
              {line("Total bruto", money(gross))}
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Deducciones</p>
              {line("Deducciones", `- ${money(p.deductions)}`, true)}
              {Number(p.other_deductions || 0) !== 0 && line("Otras deducciones", `- ${money(p.other_deductions || 0)}`, true)}
            </div>
            <div className="rounded-lg border p-3 bg-muted/40">
              {line("Horas trabajadas", `${(Number(p.hours_worked) || 0).toFixed(2)} h`)}
              {line("Método de pago", p.payment_method || "—")}
              {line("Fecha de pago", p.paid_at ? new Date(p.paid_at).toLocaleString("es-ES") : "Pendiente")}
              <Separator className="my-2" />
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Neto a percibir</span>
                <span className="text-lg font-heading font-bold tabular-nums">{money(p.net_pay)}</span>
              </div>
            </div>
            {p.notes && (
              <div className="rounded-lg border p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Observaciones</p>
                <p className="text-sm">{p.notes}</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="historial" className="pt-3">
            {loading ? (
              <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : events.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                <History className="h-7 w-7 mx-auto mb-2 opacity-30" /> Sin eventos registrados todavía.
              </p>
            ) : (
              <ol className="relative border-l border-border ml-2 space-y-4">
                {events.map((e) => (
                  <li key={e.id} className="ml-4">
                    <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                    <p className="text-sm font-medium">{PAYROLL_EVENT_LABEL[e.event_type] || e.event_type}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString("es-ES")} · {e.actor_label || "Sistema"}
                      {e.from_status && e.to_status
                        ? ` · ${PAYROLL_STATUS_LABEL[e.from_status] || e.from_status} → ${PAYROLL_STATUS_LABEL[e.to_status] || e.to_status}`
                        : ""}
                    </p>
                    {e.note && <p className="text-xs mt-0.5">{e.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>

          <TabsContent value="firmas" className="pt-3 space-y-2">
            {signatures.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                <PenLine className="h-7 w-7 mx-auto mb-2 opacity-30" /> Esta nómina aún no tiene firmas registradas.
              </p>
            ) : (
              signatures.map((s) => (
                <div key={s.id} className="rounded-lg border p-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> {s.signer_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.signed_at).toLocaleString("es-ES")} · {s.method}
                    </p>
                    {s.notes && <p className="text-xs mt-0.5">{s.notes}</p>}
                  </div>
                  {s.evidence_url && (
                    <a href={s.evidence_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline shrink-0">
                      Ver evidencia
                    </a>
                  )}
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
