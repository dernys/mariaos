import { AppLayout } from "@/components/AppLayout";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useServerTable } from "@/hooks/useServerTable";
import { TableToolbar } from "@/components/data/TableToolbar";
import { TablePagination } from "@/components/data/TablePagination";
import { DataState } from "@/components/data/DataState";
import { MiniStatCard } from "@/components/data/MiniStatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Undo2, RotateCcw, Receipt, Coins, PackageCheck, ChevronDown, ChevronRight } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

interface Sale {
  id: string;
  ticket_number: string | null;
  total: number;
  status: string;
  created_at: string;
  currency?: string | null;
  store_id?: string | null;
  customer_id?: string | null;
}

interface ReturnableItem {
  sale_item_id: string;
  product_id: string | null;
  product_name: string;
  price: number;
  qty_sold: number;
  qty_returned: number;
  qty_available: number;
}

interface ReturnRow {
  id: string;
  return_number: string;
  sale_id: string;
  total: number;
  refund_method: string;
  reason: string | null;
  status: string;
  restock: boolean;
  created_at: string;
  ticket_number: string | null;
  sale_date: string | null;
  customer_name: string | null;
  performed_by_name: string | null;
  units_returned: number;
  lines_returned: number;
  currency: string | null;
}

interface ReturnDetailItem {
  id: string;
  product_name: string | null;
  qty: number;
  price: number;
  total: number;
}

const REFUND_METHODS = [
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "transfer", label: "Transferencia" },
  { value: "credit", label: "Saldo a favor" },
];

export default function Devoluciones() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { tenantId } = useTenantContext();
  const [tab, setTab] = useState("history");

  // ---- Historial: paginación / filtros server-side sobre la vista real
  const history = useServerTable<ReturnRow>({
    table: "sale_returns_view",
    select:
      "id, return_number, sale_id, total, refund_method, reason, status, restock, created_at, ticket_number, sale_date, customer_name, performed_by_name, units_returned, lines_returned, currency",
    searchColumns: ["return_number", "ticket_number", "reason", "customer_name"],
    orderBy: { column: "created_at", ascending: false },
    initialPageSize: 25,
    enabled: !!tenantId,
    scope: tenantId,
    baseFilter: (q) => q.eq("tenant_id", tenantId),
    filterFns: {
      status: (q, v) => q.eq("status", v),
      refund_method: (q, v) => q.eq("refund_method", v),
      from: (q, v) => q.gte("created_at", v),
      to: (q, v) => q.lte("created_at", `${v}T23:59:59`),
    },
  });

  // ---- Ventas devolvibles: búsqueda y paginación server-side
  const salesTable = useServerTable<Sale>({
    table: "sales",
    select: "id, ticket_number, total, status, created_at, currency, store_id, customer_id",
    searchColumns: ["ticket_number"],
    orderBy: { column: "created_at", ascending: false },
    initialPageSize: 10,
    enabled: !!tenantId,
    scope: tenantId,
    baseFilter: (q) => q.eq("tenant_id", tenantId).neq("status", "cancelled"),
    filterFns: {
      from: (q, v) => q.gte("created_at", v),
      to: (q, v) => q.lte("created_at", `${v}T23:59:59`),
    },
  });

  // ---- Totales del historial (importe devuelto) según filtros de fecha
  const [totals, setTotals] = useState({ amount: 0, units: 0 });
  useEffect(() => {
    if (!tenantId) return;
    let q: any = supabase.from("sale_returns_view").select("total, units_returned").eq("tenant_id", tenantId);
    if (history.filters.status && history.filters.status !== "__all__") q = q.eq("status", history.filters.status);
    if (history.filters.from) q = q.gte("created_at", history.filters.from);
    if (history.filters.to) q = q.lte("created_at", `${history.filters.to}T23:59:59`);
    q.then(({ data }: any) => {
      const rows = (data || []) as { total: number; units_returned: number }[];
      setTotals({
        amount: rows.reduce((a, r) => a + Number(r.total || 0), 0),
        units: rows.reduce((a, r) => a + Number(r.units_returned || 0), 0),
      });
    });
  }, [tenantId, history.filters.status, history.filters.from, history.filters.to, history.total]);

  // ---- Diálogo de devolución
  const [open, setOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [items, setItems] = useState<ReturnableItem[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [restock, setRestock] = useState(true);
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [saving, setSaving] = useState(false);

  // Detalle expandible: líneas devueltas de cada devolución
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, ReturnDetailItem[]>>({});
  const [detailLoading, setDetailLoading] = useState(false);

  const toggleDetail = async (returnId: string) => {
    if (expanded === returnId) { setExpanded(null); return; }
    setExpanded(returnId);
    if (detail[returnId]) return;
    setDetailLoading(true);
    const { data } = await supabase
      .from("sale_return_items")
      .select("id, product_name, qty, price, total")
      .eq("return_id", returnId);
    setDetail((prev) => ({ ...prev, [returnId]: (data ?? []) as ReturnDetailItem[] }));
    setDetailLoading(false);
  };


  const openReturn = async (s: Sale) => {
    setSelectedSale(s);
    setReason("");
    setRefundMethod("cash");
    setRestock(true);
    const { data, error } = await supabase.rpc("sale_returnable_items" as any, { p_sale_id: s.id });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    const its = (data || []) as ReturnableItem[];
    setItems(its);
    const d: Record<string, string> = {};
    its.forEach((i) => { d[i.sale_item_id] = "0"; });
    setDraft(d);
    setOpen(true);
  };

  const [searchParams] = useSearchParams();
  useEffect(() => {
    const saleId = searchParams.get("sale");
    if (!saleId) return;
    (async () => {
      const { data } = await supabase
        .from("sales")
        .select("id, ticket_number, total, status, created_at, currency, store_id, customer_id")
        .eq("id", saleId)
        .maybeSingle();
      if (data) { setTab("new"); openReturn(data as Sale); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const totalRefund = useMemo(
    () => items.reduce((acc, i) => acc + (Number(draft[i.sale_item_id]) || 0) * Number(i.price), 0),
    [items, draft],
  );

  const overLimit = items.some((i) => (Number(draft[i.sale_item_id]) || 0) > i.qty_available);
  const nothingToReturn = items.length > 0 && items.every((i) => i.qty_available <= 0);

  const submit = async () => {
    if (!selectedSale) return;
    const itemsArr = items
      .filter((i) => Number(draft[i.sale_item_id]) > 0)
      .map((i) => ({ sale_item_id: i.sale_item_id, qty: Number(draft[i.sale_item_id]) }));
    if (!itemsArr.length) {
      toast({ title: "Ingresa al menos una cantidad a devolver", variant: "destructive" });
      return;
    }
    if (overLimit) {
      toast({ title: "Cantidad no permitida", description: "Una línea supera lo disponible a devolver", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("create_sale_return" as any, {
      p_sale_id: selectedSale.id,
      p_items: itemsArr as any,
      p_reason: reason || null,
      p_refund_method: refundMethod,
      p_restock: restock,
      p_location_type: selectedSale.store_id ? "store" : null,
      p_location_id: selectedSale.store_id ?? null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Devolución registrada", description: `Reembolso $${totalRefund.toFixed(2)}` });
    setOpen(false);
    history.refetch();
    salesTable.refetch();
    setTab("history");
  };

  return (
    <AppLayout title={t("modules.returns.title")}>
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="new">{t("modules.returns.tabs.new")}</TabsTrigger>
          <TabsTrigger value="history">{t("modules.returns.tabs.history")}</TabsTrigger>
        </TabsList>

        {/* ---------------- Nueva devolución: selector de venta real ---------------- */}
        <TabsContent value="new" className="space-y-4">
          <TableToolbar
            search={salesTable.search}
            onSearchChange={salesTable.setSearch}
            searchPlaceholder={t("modules.returns.searchTicket")}
            rightSlot={
              <div className="flex items-center gap-2">
                <Input type="date" className="h-9 w-36 text-xs" value={salesTable.filters.from || ""}
                  onChange={(e) => salesTable.setFilter("from", e.target.value)} />
                <Input type="date" className="h-9 w-36 text-xs" value={salesTable.filters.to || ""}
                  onChange={(e) => salesTable.setFilter("to", e.target.value)} />
              </div>
            }
          />
          <div className="bg-card rounded-xl shadow-card border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Ticket</TableHead>
                  <TableHead className="text-xs">Fecha</TableHead>
                  <TableHead className="text-xs">Total</TableHead>
                  <TableHead className="text-xs">Estado</TableHead>
                  <TableHead className="text-xs w-32">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesTable.rows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs font-heading font-semibold">{s.ticket_number || s.id.slice(0, 8)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(s.created_at), "dd/MM/yy HH:mm")}</TableCell>
                    <TableCell className="text-xs font-heading font-bold">${Number(s.total).toFixed(2)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{s.status}</Badge></TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => openReturn(s)}>
                        <Undo2 className="h-3 w-3 mr-1" /> Devolver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!salesTable.loading && salesTable.rows.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="p-0">
                    <DataState empty emptyTitle="Sin ventas" emptyHint="Ajusta la búsqueda o el rango de fechas" icon={Receipt} />
                  </TableCell></TableRow>
                )}
                {salesTable.loading && (
                  <TableRow><TableCell colSpan={5} className="p-0"><DataState loading /></TableCell></TableRow>
                )}
                {salesTable.error && (
                  <TableRow><TableCell colSpan={5} className="p-0">
                    <DataState error={salesTable.error} onRetry={() => salesTable.refetch()} />
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
            <TablePagination
              page={salesTable.page}
              pageSize={salesTable.pageSize}
              total={salesTable.total}
              onPageChange={salesTable.setPage}
              onPageSizeChange={salesTable.setPageSize}
            />
          </div>
        </TabsContent>

        {/* ---------------- Historial ---------------- */}
        <TabsContent value="history" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniStatCard label="Devoluciones" value={String(history.total)} icon={Undo2} />
            <MiniStatCard label="Importe devuelto" value={`$${totals.amount.toFixed(2)}`} icon={Coins} />
            <MiniStatCard label="Unidades devueltas" value={String(totals.units)} icon={PackageCheck} />
          </div>

          <TableToolbar
            search={history.search}
            onSearchChange={history.setSearch}
            searchPlaceholder="Buscar por nº, ticket, cliente o motivo..."
            filters={[
              {
                key: "status",
                label: "Estado",
                value: history.filters.status || "__all__",
                onChange: (v) => history.setFilter("status", v),
                options: [
                  { value: "completed", label: "Completada" },
                  { value: "cancelled", label: "Cancelada" },
                ],
              },
              {
                key: "refund_method",
                label: "Método",
                value: history.filters.refund_method || "__all__",
                onChange: (v) => history.setFilter("refund_method", v),
                options: REFUND_METHODS,
              },
            ]}
            rightSlot={
              <div className="flex items-center gap-2">
                <Input type="date" className="h-9 w-36 text-xs" value={history.filters.from || ""}
                  onChange={(e) => history.setFilter("from", e.target.value)} />
                <Input type="date" className="h-9 w-36 text-xs" value={history.filters.to || ""}
                  onChange={(e) => history.setFilter("to", e.target.value)} />
              </div>
            }
          />

          <div className="bg-card rounded-xl shadow-card border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-8" />
                  <TableHead className="text-xs">Nº</TableHead>
                  <TableHead className="text-xs">Venta</TableHead>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs">Items</TableHead>
                  <TableHead className="text-xs">Reembolso</TableHead>
                  <TableHead className="text-xs">Método</TableHead>
                  <TableHead className="text-xs">Estado</TableHead>
                  <TableHead className="text-xs">Responsable</TableHead>
                  <TableHead className="text-xs">Motivo</TableHead>
                  <TableHead className="text-xs">Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.rows.map((r) => (
                  <>
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => toggleDetail(r.id)}>
                      <TableCell className="text-muted-foreground">
                        {expanded === r.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </TableCell>
                      <TableCell className="text-xs font-heading font-semibold">{r.return_number}</TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{r.ticket_number || r.sale_id.slice(0, 8)}</div>
                        {r.sale_date && (
                          <div className="text-[10px] text-muted-foreground">{format(new Date(r.sale_date), "dd/MM/yy HH:mm")}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{r.customer_name || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.lines_returned} línea(s) · {Number(r.units_returned)} u.
                      </TableCell>
                      <TableCell className="text-xs font-heading font-bold">${Number(r.total).toFixed(2)}</TableCell>
                      <TableCell className="text-xs">
                        {REFUND_METHODS.find((m) => m.value === r.refund_method)?.label || r.refund_method}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.status === "cancelled" ? "destructive" : "outline"} className="text-[10px]">
                          {r.status === "cancelled" ? "Cancelada" : "Completada"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.performed_by_name || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.reason || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{format(new Date(r.created_at), "dd/MM/yy HH:mm")}</TableCell>
                    </TableRow>
                    {expanded === r.id && (
                      <TableRow key={`${r.id}-detail`} className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={11} className="p-4">
                          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                            Productos devueltos de la compra {r.ticket_number || r.sale_id.slice(0, 8)}
                          </p>
                          {detailLoading ? (
                            <p className="text-xs text-muted-foreground">Cargando detalle…</p>
                          ) : (detail[r.id] ?? []).length === 0 ? (
                            <p className="text-xs text-muted-foreground">Sin líneas registradas.</p>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-[11px]">Producto</TableHead>
                                  <TableHead className="text-[11px] text-right">Cantidad</TableHead>
                                  <TableHead className="text-[11px] text-right">Precio</TableHead>
                                  <TableHead className="text-[11px] text-right">Importe</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(detail[r.id] ?? []).map((d) => (
                                  <TableRow key={d.id}>
                                    <TableCell className="text-xs">{d.product_name || "—"}</TableCell>
                                    <TableCell className="text-xs text-right tabular-nums">{Number(d.qty)}</TableCell>
                                    <TableCell className="text-xs text-right tabular-nums">${Number(d.price).toFixed(2)}</TableCell>
                                    <TableCell className="text-xs text-right tabular-nums font-semibold">${Number(d.total).toFixed(2)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
                {history.loading && (
                  <TableRow><TableCell colSpan={11} className="p-0"><DataState loading /></TableCell></TableRow>
                )}
                {history.error && (
                  <TableRow><TableCell colSpan={11} className="p-0">
                    <DataState error={history.error} onRetry={() => history.refetch()} />
                  </TableCell></TableRow>
                )}
                {!history.loading && !history.error && history.rows.length === 0 && (
                  <TableRow><TableCell colSpan={11} className="p-0">
                    <DataState empty emptyTitle="Sin devoluciones" emptyHint="Registra una devolución desde una venta real" icon={Undo2} />
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>

            <TablePagination
              page={history.page}
              pageSize={history.pageSize}
              total={history.total}
              onPageChange={history.setPage}
              onPageSizeChange={history.setPageSize}
            />
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Devolución de venta</DialogTitle>
            <DialogDescription>
              Ticket {selectedSale?.ticket_number || selectedSale?.id.slice(0, 8)} · Total ${Number(selectedSale?.total || 0).toFixed(2)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {nothingToReturn && (
              <p className="text-xs text-destructive">Todas las unidades de esta venta ya fueron devueltas.</p>
            )}
            <div className="bg-card rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Producto</TableHead>
                    <TableHead className="text-xs">Vendido</TableHead>
                    <TableHead className="text-xs">Devuelto</TableHead>
                    <TableHead className="text-xs">Disponible</TableHead>
                    <TableHead className="text-xs">Precio</TableHead>
                    <TableHead className="text-xs">Devolver</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((i) => {
                    const val = Number(draft[i.sale_item_id]) || 0;
                    return (
                      <TableRow key={i.sale_item_id}>
                        <TableCell className="text-xs">{i.product_name}</TableCell>
                        <TableCell className="text-xs">{Number(i.qty_sold)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{Number(i.qty_returned)}</TableCell>
                        <TableCell className="text-xs font-medium">{Number(i.qty_available)}</TableCell>
                        <TableCell className="text-xs">${Number(i.price).toFixed(2)}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            max={Number(i.qty_available)}
                            disabled={Number(i.qty_available) <= 0}
                            className={`h-8 w-20 text-xs ${val > Number(i.qty_available) ? "border-destructive" : ""}`}
                            value={draft[i.sale_item_id] ?? "0"}
                            onChange={(e) => setDraft({ ...draft, [i.sale_item_id]: e.target.value })}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Método de reembolso</Label>
                <Select value={refundMethod} onValueChange={setRefundMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REFUND_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Total a reembolsar</Label>
                <Input value={totalRefund.toFixed(2)} disabled className="font-bold" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="h-4 w-4" />
              Reponer inventario de los productos devueltos
            </label>
            <div>
              <Label className="text-xs">Motivo</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("modules.returns.reasonPlaceholder")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              className="gradient-brand text-primary-foreground"
              disabled={saving || overLimit || totalRefund <= 0}
              onClick={submit}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Confirmar Devolución
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
