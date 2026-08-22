import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

interface ExceptionRow {
  code: string;
  severity: "critical" | "warning" | "info";
  entity_type: string;
  entity_id: string | null;
  reference: string | null;
  amount: number | null;
  occurred_at: string | null;
  detail: string;
}

const LABEL: Record<string, string> = {
  journal_without_source: "Asientos sin documento origen",
  sale_without_journal: "Ventas sin asiento",
  purchase_without_journal: "Compras sin asiento",
  payment_pending_stale: "Pagos pendientes antiguos",
  payable_inconsistent: "CxC / CxP inconsistentes",
  sale_line_without_cost: "Ventas sin costo (COGS)",
  cash_difference_unexplained: "Diferencias de caja sin motivo",
  duplicate_document: "Documentos duplicados",
  journal_reversed: "Reversas contables",
  period_reopened: "Períodos reabiertos",
  bank_unmatched: "Movimientos bancarios sin conciliar",
};

const SEV_STYLE: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/30",
  warning: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  info: "bg-muted text-muted-foreground",
};

const fmt = (n: number | null) =>
  n == null ? "—" : `$${Number(n).toLocaleString("es-CU", { maximumFractionDigits: 2 })}`;

export function FinancialExceptionsPanel() {
  const tenantId = useTenant();
  const [rows, setRows] = useState<ExceptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("__all__");

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await (supabase.rpc as any)("financial_exceptions_report", { p_tenant: tenantId });
    if (error) toast.error(error.message);
    setRows((data as ExceptionRow[]) ?? []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const map = new Map<string, { code: string; severity: string; count: number }>();
    rows.forEach((r) => {
      const g = map.get(r.code) ?? { code: r.code, severity: r.severity, count: 0 };
      g.count += 1;
      map.set(r.code, g);
    });
    return [...map.values()].sort((a, b) =>
      a.severity === b.severity ? b.count - a.count : a.severity === "critical" ? -1 : b.severity === "critical" ? 1 : 0,
    );
  }, [rows]);

  const criticals = rows.filter((r) => r.severity === "critical").length;
  const warnings = rows.filter((r) => r.severity === "warning").length;

  const visible = useMemo(
    () => (filter === "__all__" ? rows : rows.filter((r) => r.code === filter)).slice(0, 60),
    [rows, filter],
  );

  if (loading) return <Card className="p-5"><Skeleton className="h-32 w-full" /></Card>;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" /> Control interno · Excepciones
          </h3>
          <p className="text-xs text-muted-foreground">
            Operaciones que requieren revisión de administración o contabilidad. Solo del negocio activo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={criticals === 0 ? SEV_STYLE.info : SEV_STYLE.critical}>
            {criticals === 0 ? <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> 0 críticas</>
                             : <><AlertTriangle className="h-3.5 w-3.5 mr-1" /> {criticals} críticas</>}
          </Badge>
          <Badge variant="outline" className={SEV_STYLE.warning}>{warnings} avisos</Badge>
          <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border bg-card/50 p-6 text-center text-xs text-muted-foreground">
          Sin excepciones: cada operación tiene su consecuencia contable, sin duplicados ni huérfanos.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {groups.map((g) => (
              <button
                key={g.code}
                onClick={() => setFilter(g.code)}
                className="rounded-lg border bg-card/50 p-3 text-left transition-colors hover:bg-accent/40"
              >
                <div className="text-xs text-muted-foreground">{LABEL[g.code] ?? g.code}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-lg font-semibold">{g.count}</span>
                  <Badge variant="outline" className={`text-[10px] ${SEV_STYLE[g.severity]}`}>{g.severity}</Badge>
                </div>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <SearchableSelect
              value={filter}
              onChange={setFilter}
              options={[{ value: "__all__", label: "Todas las excepciones" },
                        ...groups.map((g) => ({ value: g.code, label: `${LABEL[g.code] ?? g.code} (${g.count})` }))]}
              placeholder="Filtrar por tipo"
            />
          </div>

          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Entidad</TableHead>
                  <TableHead className="text-xs">Referencia</TableHead>
                  <TableHead className="text-xs text-right">Importe</TableHead>
                  <TableHead className="text-xs">Fecha</TableHead>
                  <TableHead className="text-xs">Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r, i) => (
                  <TableRow key={`${r.code}-${r.entity_id}-${i}`}>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className={`text-[10px] ${SEV_STYLE[r.severity]}`}>
                        {LABEL[r.code] ?? r.code}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.entity_type}</TableCell>
                    <TableCell className="text-xs font-medium">{r.reference ?? r.entity_id?.slice(0, 8) ?? "—"}</TableCell>
                    <TableCell className="text-xs text-right">{fmt(r.amount)}</TableCell>
                    <TableCell className="text-xs">
                      {r.occurred_at ? new Date(r.occurred_at).toLocaleDateString("es-CU") : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.detail}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {rows.length > visible.length && (
            <p className="text-[11px] text-muted-foreground">
              Mostrando {visible.length} de {rows.length} excepciones.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
