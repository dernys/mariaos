// Conciliación operación ↔ contabilidad: compara los documentos reales de cada
// módulo con los asientos generados y explica en lenguaje claro qué corregir.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/data/TablePagination";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTableState } from "@/hooks/useTableState";
import { exportCsv } from "@/lib/exportData";
import { AlertTriangle, CheckCircle2, ChevronDown, Download, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";

interface ReconRow {
  module: string;
  reference_type: string;
  documents: number;
  documents_posted: number;
  documents_unposted: number;
  documents_amount: number;
  posted_amount: number;
  difference: number;
  status: "pass" | "warn" | "fail";
  severity: string;
  detail: string;
  explanation: string;
  remediation: string;
  sample: { id: string; label: string; amount: number }[];
}

export function OperationReconciliationPanel() {
  const { t, i18n } = useTranslation();
  const tenantId = useTenant();
  const [rows, setRows] = useState<ReconRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const tr = (key: string, fallback: string, opts?: Record<string, unknown>) =>
    t(`finance.recon.${key}`, { defaultValue: fallback, ...(opts || {}) }) as string;

  const money = useMemo(
    () => (n: number) =>
      new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(Number(n || 0)),
    [i18n.language],
  );

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("accounting_operation_reconciliation", {
      p_tenant: tenantId,
      p_from: from || null,
      p_to: to || null,
    });
    if (error) toast.error(error.message);
    setRows(((data ?? []) as ReconRow[]) || []);
    setLoading(false);
  }, [tenantId, from, to]);

  useEffect(() => { load(); }, [load]);

  const table = useTableState<ReconRow>({
    data: rows,
    searchKeys: ["module", "detail"] as any,
    initialPageSize: 10,
    filterFns: { status: (r, v) => r.status === v },
  });

  const totals = useMemo(() => {
    const docs = rows.reduce((s, r) => s + Number(r.documents || 0), 0);
    const unposted = rows.reduce((s, r) => s + Number(r.documents_unposted || 0), 0);
    const diff = rows.reduce((s, r) => s + Number(r.difference || 0), 0);
    return { docs, unposted, diff };
  }, [rows]);

  if (loading) return <Card className="p-5"><Skeleton className="h-48 w-full" /></Card>;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h3 className="text-base font-semibold">{tr("title", "Conciliación operación ↔ contabilidad")}</h3>
          <p className="text-xs text-muted-foreground max-w-2xl">
            {tr("subtitle", "Cada documento operativo (venta, devolución, compra, cobro, nómina, movimiento de caja) debe tener su asiento. Aquí se ve la diferencia exacta y qué hacer.")}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-[10px] text-muted-foreground">{tr("from", "Desde")}</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[10px] text-muted-foreground">{tr("to", "Hasta")}</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36 text-xs" />
          </div>
          <Button size="sm" variant="outline" onClick={load} className="gap-1 h-8">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 h-8"
            onClick={() =>
              exportCsv(
                rows,
                [
                  { key: "module", label: "modulo" },
                  { key: "documents", label: "documentos" },
                  { key: "documents_posted", label: "contabilizados" },
                  { key: "documents_unposted", label: "sin_asiento" },
                  { key: "documents_amount", label: "importe_documentos" },
                  { key: "posted_amount", label: "importe_contabilizado" },
                  { key: "difference", label: "diferencia" },
                  { key: "status", label: "estado" },
                  { key: "explanation", label: "explicacion" },
                  { key: "remediation", label: "accion" },
                ],
                "conciliacion-contable",
              )
            }
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border p-2.5">
          <p className="text-xs text-muted-foreground">{tr("docs", "Documentos")}</p>
          <p className="text-lg font-semibold">{totals.docs}</p>
        </div>
        <div className="rounded-md border p-2.5">
          <p className="text-xs text-muted-foreground">{tr("unposted", "Sin asiento")}</p>
          <p className={`text-lg font-semibold ${totals.unposted > 0 ? "text-destructive" : "text-success"}`}>{totals.unposted}</p>
        </div>
        <div className="rounded-md border p-2.5">
          <p className="text-xs text-muted-foreground">{tr("difference", "Diferencia")}</p>
          <p className={`text-lg font-semibold ${Math.abs(totals.diff) > 0.01 ? "text-warning" : "text-success"}`}>{money(totals.diff)}</p>
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">{tr("module", "Módulo")}</TableHead>
              <TableHead className="text-xs text-right">{tr("docsShort", "Docs")}</TableHead>
              <TableHead className="text-xs text-right">{tr("posted", "Contab.")}</TableHead>
              <TableHead className="text-xs text-right">{tr("amount", "Importe")}</TableHead>
              <TableHead className="text-xs text-right">{tr("postedAmount", "Contabilizado")}</TableHead>
              <TableHead className="text-xs">{tr("state", "Estado")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.paged.map((r) => (
              <TableRow key={r.module}>
                <TableCell className="text-xs">
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-1 font-semibold hover:underline">
                      {r.status === "pass" ? <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                        : r.status === "fail" ? <XCircle className="h-3.5 w-3.5 text-destructive" />
                        : <AlertTriangle className="h-3.5 w-3.5 text-warning" />}
                      {tr(`modules.${r.module}`, r.module)}
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2 space-y-1 text-[11px] text-muted-foreground max-w-xl">
                      <p>{r.detail}</p>
                      <p>{r.explanation}</p>
                      <p className="text-foreground">→ {r.remediation}</p>
                      {r.sample?.length > 0 && (
                        <ul className="font-mono">
                          {r.sample.map((s) => (
                            <li key={s.id}>· {s.label} — {money(s.amount)}</li>
                          ))}
                        </ul>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                </TableCell>
                <TableCell className="text-xs text-right font-mono">{r.documents}</TableCell>
                <TableCell className="text-xs text-right font-mono">{r.documents_posted}</TableCell>
                <TableCell className="text-xs text-right font-mono">{money(r.documents_amount)}</TableCell>
                <TableCell className="text-xs text-right font-mono">{money(r.posted_amount)}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "pass" ? "default" : r.status === "fail" ? "destructive" : "secondary"} className="text-[10px]">
                    {r.status === "pass" ? tr("ok", "Cuadrado") : `${r.documents_unposted} ${tr("gaps", "pendientes")}`}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {table.total === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">
                  {tr("empty", "Sin operaciones en el rango seleccionado.")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination
          page={table.page}
          pageSize={table.pageSize}
          total={table.total}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
        />
      </div>
    </Card>
  );
}
