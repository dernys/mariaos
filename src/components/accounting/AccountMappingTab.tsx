// Maestro de Cuentas — configuración explícita de a qué cuenta tributa cada
// operación de la aplicación. El motor de asientos (resolve_account_by_role)
// consulta primero esta tabla, por lo que aquí se gobierna la contabilidad real.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/data/TablePagination";
import { TableToolbar } from "@/components/data/TableToolbar";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useTableState } from "@/hooks/useTableState";
import { exportCsv } from "@/lib/exportData";
import { AlertTriangle, CheckCircle2, Download, Info, RefreshCw, Wand2 } from "lucide-react";
import { toast } from "sonner";

interface MappingRow {
  mapping_key: string;
  module: string;
  operation: string;
  side: string;
  expected_type: string;
  account_id: string | null;
  account_code: string | null;
  account_name: string | null;
  account_type: string | null;
  source: "explicit" | "fallback" | "unresolved";
  type_ok: boolean;
  lines_count: number;
  last_used: string | null;
  detail: string;
  remediation: string;
}

interface AccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
  is_postable: boolean;
  is_active: boolean | null;
}

export function AccountMappingTab() {
  const { t } = useTranslation();
  const tenantId = useTenant();
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const tr = (key: string, fallback: string, opts?: Record<string, unknown>) =>
    t(`finance.mapping.${key}`, { defaultValue: fallback, ...(opts || {}) }) as string;

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [statusRes, accRes] = await Promise.all([
      (supabase as any).rpc("accounting_mapping_status", { p_tenant: tenantId }),
      supabase
        .from("accounting_accounts")
        .select("id, code, name, type, is_postable, is_active")
        .eq("tenant_id", tenantId)
        .eq("is_postable", true)
        .order("code"),
    ]);
    if (statusRes.error) toast.error(statusRes.error.message);
    setRows(((statusRes.data ?? []) as MappingRow[]) || []);
    setAccounts(((accRes.data ?? []) as AccountOption[]) || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const assign = async (row: MappingRow, accountId: string) => {
    if (!tenantId) return;
    setSaving(row.mapping_key);
    const { error } = await supabase
      .from("accounting_mappings")
      .upsert(
        {
          tenant_id: tenantId,
          mapping_key: row.mapping_key,
          account_id: accountId,
          description: `${row.module} · ${row.operation}`,
          is_active: true,
        },
        { onConflict: "tenant_id,mapping_key" },
      );
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    toast.success(tr("saved", "Cuenta asignada. Los nuevos asientos usarán esta cuenta."));
    load();
  };

  const autoSync = async () => {
    if (!tenantId) return;
    setSaving("__all__");
    const { data, error } = await (supabase as any).rpc("sync_accounting_mappings", { p_tenant: tenantId });
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    toast.success(tr("synced", "{{count}} clave(s) completadas automáticamente.", { count: Number(data ?? 0) }));
    load();
  };

  const table = useTableState<MappingRow>({
    data: rows,
    searchKeys: ["mapping_key", "module", "operation", "account_code", "account_name"] as any,
    initialPageSize: 10,
    filterFns: {
      module: (r, v) => r.module === v,
      source: (r, v) => r.source === v,
    },
  });

  const moduleOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.module))).map((m) => ({ value: m, label: m })),
    [rows],
  );

  const accountOptions = useMemo(
    () =>
      accounts
        .filter((a) => a.is_active !== false)
        .map((a) => ({ value: a.id, label: `${a.code} · ${a.name}`, hint: a.type })),
    [accounts],
  );

  const issues = rows.filter((r) => r.source !== "explicit" || !r.type_ok).length;

  if (loading) return <Card className="p-5"><Skeleton className="h-64 w-full" /></Card>;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h3 className="text-base font-semibold">{tr("title", "Maestro de Cuentas")}</h3>
          <p className="text-xs text-muted-foreground max-w-2xl">
            {tr(
              "subtitle",
              "Cada operación de la aplicación (venta, impuesto, cobro, compra, nómina, descuadre de caja) se contabiliza en la cuenta asignada aquí. Si una clave no está configurada, el motor deduce la cuenta por código, lo que puede no ser lo que el contador espera.",
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={issues === 0 ? "default" : "secondary"} className="gap-1">
            {issues === 0
              ? <><CheckCircle2 className="h-3.5 w-3.5" /> {tr("allSet", "Todo configurado")}</>
              : <><AlertTriangle className="h-3.5 w-3.5" /> {tr("pending", "{{count}} por revisar", { count: issues })}</>}
          </Badge>
          <Button size="sm" variant="outline" onClick={autoSync} disabled={saving === "__all__"} className="gap-1">
            <Wand2 className="h-3.5 w-3.5" /> {tr("autoSync", "Completar automáticamente")}
          </Button>
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
                  { key: "side", label: "naturaleza" },
                  { key: "expected_type", label: "tipo_esperado" },
                  { key: "account_code", label: "cuenta" },
                  { key: "account_name", label: "nombre_cuenta" },
                  { key: "source", label: "origen" },
                  { key: "lines_count", label: "movimientos" },
                  { key: "detail", label: "diagnostico" },
                  { key: "remediation", label: "accion" },
                ],
                "maestro-de-cuentas",
              )
            }
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <TableToolbar
        search={table.search}
        onSearchChange={table.setSearch}
        searchPlaceholder={tr("search", "Buscar clave, módulo o cuenta...")}
        filters={[
          {
            key: "module",
            label: tr("module", "Módulo"),
            value: table.filters.module || "__all__",
            onChange: (v) => table.setFilter("module", v),
            options: moduleOptions,
          },
          {
            key: "source",
            label: tr("source", "Origen"),
            value: table.filters.source || "__all__",
            onChange: (v) => table.setFilter("source", v),
            options: [
              { value: "explicit", label: tr("sourceExplicit", "Configurada") },
              { value: "fallback", label: tr("sourceFallback", "Deducida") },
              { value: "unresolved", label: tr("sourceUnresolved", "Sin cuenta") },
            ],
          },
        ]}
      />

      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">{tr("operation", "Operación")}</TableHead>
              <TableHead className="text-xs w-72">{tr("account", "Cuenta contable")}</TableHead>
              <TableHead className="text-xs">{tr("side", "Debe/Haber")}</TableHead>
              <TableHead className="text-xs">{tr("state", "Estado")}</TableHead>
              <TableHead className="text-xs text-right">{tr("moves", "Movs.")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.paged.map((r) => (
              <TableRow key={r.mapping_key} className="align-top">
                <TableCell className="text-xs">
                  <div className="font-semibold">{tr(`keys.${r.mapping_key}`, r.mapping_key)}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{r.module} · {r.operation}</div>
                  <div className="mt-1 flex items-start gap-1 text-[10px] text-muted-foreground max-w-md">
                    <Info className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{r.detail}</span>
                  </div>
                  {(r.source !== "explicit" || !r.type_ok) && (
                    <div className="mt-1 text-[10px] text-warning">→ {r.remediation}</div>
                  )}
                </TableCell>
                <TableCell>
                  <SearchableSelect
                    options={accountOptions}
                    value={r.account_id ?? ""}
                    onChange={(v) => assign(r, v)}
                    disabled={saving === r.mapping_key}
                    placeholder={tr("selectAccount", "Seleccionar cuenta")}
                    searchPlaceholder={tr("searchAccount", "Buscar cuenta...")}
                  />
                </TableCell>
                <TableCell className="text-xs">
                  <Badge variant="outline" className="text-[10px]">
                    {r.side === "debit" ? tr("debit", "Debe") : tr("credit", "Haber")}
                  </Badge>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {tr("expects", "Tipo")}: {r.expected_type}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={r.source === "explicit" && r.type_ok ? "default" : r.source === "unresolved" ? "destructive" : "secondary"}
                    className="text-[10px]"
                  >
                    {r.source === "explicit"
                      ? tr("sourceExplicit", "Configurada")
                      : r.source === "fallback"
                        ? tr("sourceFallback", "Deducida")
                        : tr("sourceUnresolved", "Sin cuenta")}
                  </Badge>
                  {!r.type_ok && r.account_id && (
                    <div className="mt-1 text-[10px] text-destructive">
                      {tr("typeMismatch", "Tipo incorrecto")}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-xs text-right font-mono">{r.lines_count}</TableCell>
              </TableRow>
            ))}
            {table.total === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">
                  {tr("empty", "Sin claves contables para mostrar.")}
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
