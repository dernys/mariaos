// Integridad de la configuración contable: qué operaciones tienen cuenta
// configurada (USED/UNUSED), qué falta (MISSING), qué es inválido (INVALID),
// qué está en conflicto (CONFLICTING) y qué cuentas históricas podrían estar
// mal clasificadas (solo propuesta, no modifica asientos posteados).

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/data/TablePagination";

import { AlertTriangle, CheckCircle2, Download, RefreshCw, ShieldCheck } from "lucide-react";
import { exportCsv } from "@/lib/exportData";
import { toast } from "sonner";

interface ConfigRow {
  mapping_key: string;
  module: string;
  operation: string;
  status: "MISSING" | "INVALID" | "CONFLICTING" | "USED" | "UNUSED" | "ORPHAN";
  account_code: string | null;
  account_name: string | null;
  expected_type: string | null;
  actual_type: string | null;
  lines_count: number;
  detail: string;
  remediation: string;
}

interface ReclassRow {
  account_code: string;
  account_name: string;
  actual_type: string;
  mapping_key: string;
  expected_type: string;
  lines_count: number;
  amount: number;
  proposal: string;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  USED: "default",
  UNUSED: "secondary",
  MISSING: "destructive",
  INVALID: "destructive",
  CONFLICTING: "destructive",
  ORPHAN: "outline",
};

export function AccountingConfigReportPanel() {
  const tenantId = useTenant();
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [reclass, setReclass] = useState<ReclassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [reclassPage, setReclassPage] = useState(1);
  const [reclassPageSize, setReclassPageSize] = useState(10);


  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [cfg, rec] = await Promise.all([
      (supabase as any).rpc("accounting_config_report", { p_tenant: tenantId }),
      (supabase as any).rpc("accounting_reclass_candidates", { p_tenant: tenantId }),
    ]);
    if (cfg.error) toast.error(cfg.error.message);
    setRows((cfg.data ?? []) as ConfigRow[]);
    setReclass((rec.data ?? []) as ReclassRow[]);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [rows]);

  const blocking = (counts.MISSING ?? 0) + (counts.INVALID ?? 0) + (counts.CONFLICTING ?? 0);
  const problems = rows.filter((r) => !["USED", "UNUSED"].includes(r.status));
  const visibleRows = problems.length > 0 ? problems : rows;
  useEffect(() => { setPage(1); }, [rows.length]);
  useEffect(() => { setReclassPage(1); }, [reclass.length]);


  if (loading) return <Card className="p-5"><Skeleton className="h-48 w-full" /></Card>;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Integridad de la configuración contable
          </h3>
          <p className="text-xs text-muted-foreground max-w-2xl">
            Si una operación no tiene cuenta válida configurada, la aplicación la rechaza completa
            (sin venta, pago, stock ni asiento parcial) y deja registro de control.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={blocking === 0 ? "default" : "destructive"} className="gap-1">
            {blocking === 0
              ? <><CheckCircle2 className="h-3.5 w-3.5" /> Configuración completa</>
              : <><AlertTriangle className="h-3.5 w-3.5" /> {blocking} operación(es) bloqueada(s)</>}
          </Badge>
          <Button size="sm" variant="outline" onClick={load} className="gap-1">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() =>
              exportCsv(
                rows,
                [
                  { key: "mapping_key", label: "clave" },
                  { key: "module", label: "modulo" },
                  { key: "operation", label: "operacion" },
                  { key: "status", label: "estado" },
                  { key: "account_code", label: "cuenta" },
                  { key: "expected_type", label: "tipo_esperado" },
                  { key: "actual_type", label: "tipo_real" },
                  { key: "lines_count", label: "movimientos" },
                  { key: "detail", label: "diagnostico" },
                  { key: "remediation", label: "accion" },
                ],
                "integridad-configuracion-contable",
              )
            }
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px]">
        {(["USED", "UNUSED", "MISSING", "INVALID", "CONFLICTING", "ORPHAN"] as const).map((s) => (
          <Badge key={s} variant={STATUS_VARIANT[s]} className="text-[10px]">
            {s}: {counts[s] ?? 0}
          </Badge>
        ))}
      </div>

      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Operación</TableHead>
              <TableHead className="text-xs">Cuenta</TableHead>
              <TableHead className="text-xs">Estado</TableHead>
              <TableHead className="text-xs">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.slice((page - 1) * pageSize, page * pageSize).map((r) => (
              <TableRow key={r.mapping_key + r.status}>
                <TableCell className="text-xs">
                  <div className="font-semibold">{r.mapping_key}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{r.module} · {r.operation}</div>
                </TableCell>
                <TableCell className="text-xs">
                  {r.account_code ? `${r.account_code} · ${r.account_name}` : "—"}
                  <div className="text-[10px] text-muted-foreground">
                    {r.expected_type} {r.actual_type && r.actual_type !== r.expected_type ? `≠ ${r.actual_type}` : ""}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[r.status]} className="text-[10px]">{r.status}</Badge>
                  <div className="text-[10px] text-muted-foreground mt-1 max-w-xs">{r.detail}</div>
                </TableCell>
                <TableCell className="text-[10px] text-muted-foreground max-w-xs">{r.remediation}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          page={page}
          pageSize={pageSize}
          total={visibleRows.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>


      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Propuesta de reclasificación histórica</h4>
        <p className="text-[11px] text-muted-foreground">
          Diagnóstico únicamente: los asientos ya contabilizados no se modifican. Cada propuesta
          requiere un asiento de reclasificación aprobado por contabilidad.
        </p>
        {reclass.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin cuentas históricas mal clasificadas detectadas.</p>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Cuenta</TableHead>
                  <TableHead className="text-xs">Clave</TableHead>
                  <TableHead className="text-xs text-right">Líneas</TableHead>
                  <TableHead className="text-xs text-right">Importe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reclass.slice((reclassPage - 1) * reclassPageSize, reclassPage * reclassPageSize).map((r, i) => (
                  <TableRow key={`${r.account_code}-${r.mapping_key}-${i}`}>
                    <TableCell className="text-xs">
                      {r.account_code} · {r.account_name}
                      <div className="text-[10px] text-muted-foreground">
                        {r.actual_type} → {r.expected_type}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{r.mapping_key}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{r.lines_count}</TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      {Number(r.amount ?? 0).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              page={reclassPage}
              pageSize={reclassPageSize}
              total={reclass.length}
              onPageChange={setReclassPage}
              onPageSizeChange={setReclassPageSize}
            />
          </div>

        )}
      </div>
    </Card>
  );
}
