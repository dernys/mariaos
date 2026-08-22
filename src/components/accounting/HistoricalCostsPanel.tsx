import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { CheckCircle2, AlertTriangle, RefreshCw, Wallet } from "lucide-react";
import { toast } from "sonner";

interface Line {
  sale_item_id: string;
  sale_id: string;
  ticket_number: string | null;
  sale_date: string;
  product_id: string | null;
  product_name: string;
  sku: string | null;
  qty: number;
  unit_cost: number;
  total_cost?: number;
}

interface Report {
  resolvable: Line[];
  pending: Line[];
  resolvable_count: number;
  pending_count: number;
  estimated_amount: number;
  sales_count: number;
}

const fmt = (n: number) => `$${(Number(n) || 0).toLocaleString("es-CU", { maximumFractionDigits: 2 })}`;

export function HistoricalCostsPanel() {
  const tenantId = useTenant();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [products, setProducts] = useState<{ value: string; label: string }[]>([]);
  const [draft, setDraft] = useState<Record<string, { product_id?: string; unit_cost?: string }>>({});

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [{ data, error }, prods] = await Promise.all([
      (supabase.rpc as any)("missing_cogs_report", { p_tenant: tenantId }),
      supabase.from("products").select("id,name,sku").eq("tenant_id", tenantId).order("name").limit(500),
    ]);
    if (error) toast.error(error.message);
    setReport((data as Report) ?? null);
    setProducts((prods.data ?? []).map((p: any) => ({ value: p.id, label: p.sku ? `${p.name} · ${p.sku}` : p.name })));
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const regularize = async () => {
    if (!tenantId) return;
    setPosting(true);
    const { data, error } = await (supabase.rpc as any)("post_missing_cogs", { p_tenant: tenantId });
    setPosting(false);
    if (error) return toast.error(error.message);
    toast.success("Costos históricos regularizados", {
      description: `${data?.sales_adjusted ?? 0} ventas ajustadas por ${fmt(data?.amount ?? 0)}`,
    });
    load();
  };

  const resolve = async (line: Line) => {
    const d = draft[line.sale_item_id] || {};
    if (!d.product_id && !d.unit_cost) return toast.error("Indica el producto o el costo unitario");
    const { error } = await (supabase.rpc as any)("resolve_sale_item_cost", {
      p_sale_item_id: line.sale_item_id,
      p_product_id: d.product_id ?? null,
      p_unit_cost: d.unit_cost ? Number(d.unit_cost) : null,
    });
    if (error) return toast.error(error.message);
    toast.success("Costo resuelto para la línea de venta");
    setDraft((s) => ({ ...s, [line.sale_item_id]: {} }));
    load();
  };

  const preview = useMemo(() => (report?.resolvable ?? []).slice(0, 30), [report]);

  if (loading || !report) return <Card className="p-5"><Skeleton className="h-32 w-full" /></Card>;

  const clean = report.resolvable_count === 0 && report.pending_count === 0;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Costos históricos (COGS)</h3>
          <p className="text-xs text-muted-foreground">
            Ventas contabilizadas sin costo de ventas. El ajuste crea asientos trazables, nunca modifica los originales.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={clean ? "default" : "destructive"} className="gap-1">
            {clean ? <><CheckCircle2 className="h-3.5 w-3.5" /> Sin pendientes</>
                   : <><AlertTriangle className="h-3.5 w-3.5" /> {report.resolvable_count + report.pending_count} líneas</>}
          </Badge>
          <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Ventas afectadas", value: String(report.sales_count) },
          { label: "Líneas regularizables", value: String(report.resolvable_count) },
          { label: "Costo estimado", value: fmt(report.estimated_amount) },
          { label: "Costo pendiente de identificación", value: String(report.pending_count) },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border bg-card/50 p-3">
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className="mt-1 text-lg font-semibold">{k.value}</div>
          </div>
        ))}
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button disabled={posting || report.resolvable_count === 0} className="gap-2 gradient-brand text-primary-foreground">
            <Wallet className="h-4 w-4" /> {posting ? "Regularizando..." : "Regularizar costos históricos"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regularizar costos históricos</AlertDialogTitle>
            <AlertDialogDescription>
              Se crearán asientos de ajuste (Costo de ventas / Inventario) por {fmt(report.estimated_amount)} en {report.sales_count} ventas.
              Los asientos originales permanecen intactos y la operación queda registrada en auditoría.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={regularize}>Contabilizar ajuste</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {preview.length > 0 && (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Venta</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Costo unit.</TableHead>
                <TableHead className="text-right">Costo total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map((l) => (
                <TableRow key={l.sale_item_id}>
                  <TableCell className="text-xs">{l.ticket_number ?? l.sale_id.slice(0, 8)}</TableCell>
                  <TableCell className="text-xs">{l.product_name}{l.sku ? ` · ${l.sku}` : ""}</TableCell>
                  <TableCell className="text-right text-xs">{l.qty}</TableCell>
                  <TableCell className="text-right text-xs">{fmt(l.unit_cost)}</TableCell>
                  <TableCell className="text-right text-xs font-semibold">{fmt(l.total_cost ?? l.qty * l.unit_cost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {report.pending_count > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Costo pendiente de identificación ({report.pending_count})
          </h4>
          <p className="text-xs text-muted-foreground">
            Estas líneas no tienen producto o costo conocido. Asigna el producto o escribe el costo unitario real para incluirlas en el ajuste.
          </p>
          <div className="rounded-lg border divide-y">
            {report.pending.map((l) => {
              const d = draft[l.sale_item_id] || {};
              return (
                <div key={l.sale_item_id} className="p-3 grid gap-2 md:grid-cols-[1.2fr_1.4fr_0.8fr_auto] md:items-end">
                  <div className="text-xs">
                    <div className="font-medium">{l.product_name}</div>
                    <div className="text-muted-foreground">
                      {(l.ticket_number ?? l.sale_id.slice(0, 8))} · {new Date(l.sale_date).toLocaleDateString("es-CU")} · cant. {l.qty}
                    </div>
                  </div>
                  <SearchableSelect
                    value={d.product_id ?? ""}
                    onChange={(v) => setDraft((s) => ({ ...s, [l.sale_item_id]: { ...d, product_id: v } }))}
                    options={products}
                    placeholder="Asignar producto"
                  />
                  <Input
                    type="number" step="0.01" placeholder="Costo unitario"
                    value={d.unit_cost ?? ""}
                    onChange={(e) => setDraft((s) => ({ ...s, [l.sale_item_id]: { ...d, unit_cost: e.target.value } }))}
                  />
                  <Button size="sm" variant="outline" onClick={() => resolve(l)}>Resolver</Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
