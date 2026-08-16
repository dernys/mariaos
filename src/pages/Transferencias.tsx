import { AppLayout } from "@/components/AppLayout";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, ArrowRightLeft, Trash2, Truck, CheckCircle2, XCircle, Route, User } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TableToolbar } from "@/components/data/TableToolbar";
import { TablePagination } from "@/components/data/TablePagination";
import { useTableState } from "@/hooks/useTableState";
import { format } from "date-fns";

type LocType = "warehouse" | "store";

interface Loc { id: string; name: string; type: LocType; }
interface Product { id: string; name: string; sku: string; unit_code?: string | null; }
interface TransferItem {
  product_id: string;
  product_name?: string;
  unit?: string | null;
  quantity_requested: number;
  quantity_shipped?: number | null;
  quantity_received?: number | null;
}
interface Transfer {
  id: string;
  transfer_number: string;
  status: string;
  origin_type: string;
  origin_id: string;
  destination_type: string;
  destination_id: string;
  notes: string | null;
  created_at: string;
  shipped_at: string | null;
  received_at: string | null;
  created_by: string | null;
  requested_by: string | null;
  carrier_name: string | null;
  carrier_driver: string | null;
  carrier_phone: string | null;
  carrier_vehicle: string | null;
  carrier_plate: string | null;
  tracking_code: string | null;
  estimated_arrival: string | null;
}
interface TransferEvent {
  id: string;
  status: string;
  note: string | null;
  performed_by: string | null;
  created_at: string;
}

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    requested: "bg-warning/10 text-warning",
    approved: "bg-primary/10 text-primary",
    in_transit: "bg-blue-500/10 text-blue-600",
    received: "bg-success/10 text-success",
    cancelled: "bg-destructive/10 text-destructive",
  };
  const labels: Record<string, string> = {
    requested: "Solicitada",
    approved: "Aprobada",
    in_transit: "En tránsito",
    received: "Recibida",
    cancelled: "Cancelada",
  };
  return { className: map[s] || "bg-muted", label: labels[s] || s };
};

export default function Transferencias() {
  const { t } = useTranslation();
  const tenantId = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();

  const [warehouses, setWarehouses] = useState<Loc[]>([]);
  const [stores, setStores] = useState<Loc[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [items, setItems] = useState<Record<string, TransferItem[]>>({});
  const [people, setPeople] = useState<Record<string, string>>({});
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [tracking, setTracking] = useState<Transfer | null>(null);
  const [events, setEvents] = useState<TransferEvent[]>([]);
  const [carrierEdit, setCarrierEdit] = useState<Transfer | null>(null);
  /** Transferencia en proceso de envío (salida) o recepción (entrada) con cantidades editables. */
  const [flow, setFlow] = useState<{ transfer: Transfer; mode: "ship" | "receive" } | null>(null);
  const [flowQty, setFlowQty] = useState<Record<string, string>>({});

  // Form
  const [originType, setOriginType] = useState<LocType>("warehouse");
  const [originId, setOriginId] = useState("");
  const [destType, setDestType] = useState<LocType>("store");
  const [destId, setDestId] = useState("");
  const [notes, setNotes] = useState("");
  const [carrier, setCarrier] = useState({
    carrier_name: "", carrier_driver: "", carrier_phone: "",
    carrier_vehicle: "", carrier_plate: "", tracking_code: "", estimated_arrival: "",
  });
  const [draftItems, setDraftItems] = useState<{ product_id: string; quantity: string }[]>([
    { product_id: "", quantity: "1" },
  ]);

  const stockKey = (productId: string, type: string, id: string) => `${productId}|${type}|${id}`;
  const stockAt = (productId: string, type: string, id: string) =>
    stockMap[stockKey(productId, type, id)] ?? 0;

  const fetchAll = async () => {
    const [whR, stR, prR, trR, pfR, psR] = await Promise.all([
      supabase.from("warehouses").select("id, name").order("name"),
      supabase.from("stores").select("id, name").order("name"),
      supabase.from("products").select("id, name, sku").order("name"),
      supabase.from("stock_transfers").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("profiles").select("user_id, full_name"),
      supabase.from("product_stock").select("product_id, location_type, location_id, stock"),
    ]);
    setWarehouses((whR.data || []).map((w) => ({ ...w, type: "warehouse" as LocType })));
    setStores((stR.data || []).map((s) => ({ ...s, type: "store" as LocType })));
    setProducts(prR.data || []);
    const sm: Record<string, number> = {};
    (psR.data || []).forEach((s: any) => { sm[`${s.product_id}|${s.location_type}|${s.location_id}`] = Number(s.stock) || 0; });
    setStockMap(sm);
    const nameMap: Record<string, string> = {};
    (pfR.data || []).forEach((p: any) => { if (p.user_id) nameMap[p.user_id] = p.full_name || p.user_id; });
    setPeople(nameMap);
    const ts = (trR.data || []) as unknown as Transfer[];
    setTransfers(ts);
    if (ts.length) {
      const { data: its } = await supabase
        .from("stock_transfer_items")
        .select("transfer_id, product_id, product_name, quantity_requested, quantity_shipped, quantity_received")
        .in("transfer_id", ts.map((t) => t.id));
      const prodNames = new Map((prR.data || []).map((p: any) => [p.id, p.name]));
      const grouped: Record<string, TransferItem[]> = {};
      (its || []).forEach((it: any) => {
        (grouped[it.transfer_id] = grouped[it.transfer_id] || []).push({
          product_id: it.product_id,
          product_name: it.product_name || prodNames.get(it.product_id),
          quantity_requested: Number(it.quantity_requested),
          quantity_shipped: it.quantity_shipped !== null ? Number(it.quantity_shipped) : null,
          quantity_received: it.quantity_received !== null ? Number(it.quantity_received) : null,
        });
      });
      setItems(grouped);

    } else {
      setItems({});
    }
  };

  useEffect(() => { fetchAll(); }, []);


  const openTracking = async (tr: Transfer) => {
    setTracking(tr);
    const { data } = await supabase
      .from("stock_transfer_events")
      .select("id, status, note, performed_by, created_at")
      .eq("transfer_id", tr.id)
      .order("created_at", { ascending: false });
    setEvents((data || []) as TransferEvent[]);
  };

  const resetForm = () => {
    setOriginType("warehouse"); setOriginId("");
    setDestType("store"); setDestId("");
    setNotes("");
    setCarrier({ carrier_name: "", carrier_driver: "", carrier_phone: "", carrier_vehicle: "", carrier_plate: "", tracking_code: "", estimated_arrival: "" });
    setDraftItems([{ product_id: "", quantity: "1" }]);
  };

  const handleCreate = async () => {
    if (!originId || !destId) { toast({ title: "Falta origen o destino", variant: "destructive" }); return; }
    if (originType === destType && originId === destId) { toast({ title: "Origen y destino no pueden ser iguales", variant: "destructive" }); return; }
    const validItems = draftItems.filter((d) => d.product_id && Number(d.quantity) > 0);
    if (!validItems.length) { toast({ title: "Agrega al menos un producto", variant: "destructive" }); return; }

    const code = "TR-" + Date.now().toString(36).toUpperCase();
    const { data: tr, error } = await supabase.from("stock_transfers").insert({
      tenant_id: tenantId!, transfer_number: code, origin_type: originType, origin_id: originId,
      destination_type: destType, destination_id: destId, notes: notes || null,
      status: "requested", requested_by: user?.id, created_by: user?.id,
      carrier_name: carrier.carrier_name || null,
      carrier_driver: carrier.carrier_driver || null,
      carrier_phone: carrier.carrier_phone || null,
      carrier_vehicle: carrier.carrier_vehicle || null,
      carrier_plate: carrier.carrier_plate || null,
      tracking_code: carrier.tracking_code || null,
      estimated_arrival: carrier.estimated_arrival ? new Date(carrier.estimated_arrival).toISOString() : null,
    } as any).select("id").single();
    if (error || !tr) { toast({ title: "Error", description: error?.message, variant: "destructive" }); return; }

    const rows = validItems.map((d) => {
      const prod = products.find((p) => p.id === d.product_id);
      return {
        transfer_id: tr.id,
        product_id: d.product_id,
        product_name: prod?.name || "",
        sku: prod?.sku || null,
        quantity_requested: Number(d.quantity),
      };
    });
    const { error: e2 } = await supabase.from("stock_transfer_items").insert(rows);
    if (e2) { toast({ title: "Error items", description: e2.message, variant: "destructive" }); return; }

    toast({ title: "Transferencia creada", description: code });
    setOpen(false); resetForm(); fetchAll();
  };

  const saveCarrier = async () => {
    if (!carrierEdit) return;
    const { error } = await supabase.from("stock_transfers").update({
      carrier_name: carrier.carrier_name || null,
      carrier_driver: carrier.carrier_driver || null,
      carrier_phone: carrier.carrier_phone || null,
      carrier_vehicle: carrier.carrier_vehicle || null,
      carrier_plate: carrier.carrier_plate || null,
      tracking_code: carrier.tracking_code || null,
      estimated_arrival: carrier.estimated_arrival ? new Date(carrier.estimated_arrival).toISOString() : null,
    } as any).eq("id", carrierEdit.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Datos de transportación actualizados" });
    setCarrierEdit(null); fetchAll();
  };

  const changeStatus = async (id: string, status: string) => {
    const patch: any = { status };
    if (status === "in_transit") { patch.shipped_at = new Date().toISOString(); patch.shipped_by = user?.id; }
    if (status === "cancelled") { patch.cancelled_at = new Date().toISOString(); }
    const { error } = await supabase.from("stock_transfers").update(patch).eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Estado actualizado" });
    fetchAll();
  };

  /** Abre el diálogo de salida (envío) o entrada (recepción) con cantidades por producto. */
  const openFlow = (tr: Transfer, mode: "ship" | "receive") => {
    const its = items[tr.id] || [];
    const qty: Record<string, string> = {};
    its.forEach((it) => {
      qty[it.product_id] = String(
        mode === "ship"
          ? it.quantity_shipped ?? it.quantity_requested
          : it.quantity_received ?? it.quantity_shipped ?? it.quantity_requested,
      );
    });
    setFlowQty(qty);
    setFlow({ transfer: tr, mode });
  };

  const confirmFlow = async () => {
    if (!flow) return;
    const { transfer: tr, mode } = flow;
    const its = items[tr.id] || [];
    const parsed = its.map((it) => ({ ...it, qty: Number(flowQty[it.product_id] ?? 0) }));
    if (parsed.some((p) => !Number.isFinite(p.qty) || p.qty < 0)) {
      toast({ title: "Cantidades inválidas", variant: "destructive" }); return;
    }
    if (!parsed.some((p) => p.qty > 0)) {
      toast({ title: "Indica al menos una cantidad mayor que cero", variant: "destructive" }); return;
    }

    if (mode === "ship") {
      const overflow = parsed.find((p) => p.qty > stockAt(p.product_id, tr.origin_type, tr.origin_id));
      if (overflow) {
        toast({
          title: "Stock insuficiente en origen",
          description: `${overflow.product_name}: disponible ${stockAt(overflow.product_id, tr.origin_type, tr.origin_id)}`,
          variant: "destructive",
        });
        return;
      }
      for (const p of parsed) {
        const { error } = await supabase.from("stock_transfer_items")
          .update({ quantity_shipped: p.qty })
          .eq("transfer_id", tr.id).eq("product_id", p.product_id);
        if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      }
      const { error } = await supabase.from("stock_transfers").update({
        status: "in_transit", shipped_at: new Date().toISOString(), shipped_by: user?.id,
      } as any).eq("id", tr.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Salida registrada", description: "Transferencia en tránsito" });
    } else {
      for (const p of parsed) {
        const { error } = await supabase.from("stock_transfer_items")
          .update({ quantity_received: p.qty })
          .eq("transfer_id", tr.id).eq("product_id", p.product_id);
        if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      }
      const { error } = await supabase.rpc("receive_stock_transfer", { p_transfer_id: tr.id });
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Entrada registrada", description: "Stock de origen y destino actualizado" });
    }
    setFlow(null); setFlowQty({}); fetchAll();
  };


  const locName = (type: string, id: string) => {
    const list = type === "warehouse" ? warehouses : stores;
    return list.find((l) => l.id === id)?.name || "—";
  };
  const personName = (id: string | null) => (id ? people[id] || "—" : "—");

  const rows = useMemo(
    () =>
      transfers.map((tr) => ({
        ...tr,
        originName: locName(tr.origin_type, tr.origin_id),
        destName: locName(tr.destination_type, tr.destination_id),
        creatorName: personName(tr.created_by || tr.requested_by),
      })),
    [transfers, warehouses, stores, people],
  );

  const table = useTableState({
    data: rows,
    searchKeys: ["transfer_number", "originName", "destName", "creatorName", "carrier_name", "tracking_code"],
    initialPageSize: 25,
    filterFns: {
      status: (r, v) => r.status === v,
      origin: (r, v) => r.origin_id === v,
      destination: (r, v) => r.destination_id === v,
    },
  });

  const locationOptions = useMemo(
    () => [
      ...warehouses.map((w) => ({ value: w.id, label: `${w.name} (almacén)` })),
      ...stores.map((s) => ({ value: s.id, label: `${s.name} (tienda)` })),
    ],
    [warehouses, stores],
  );
  const productOptions = useMemo(
    () => products.map((p) => ({ value: p.id, label: p.name, hint: p.sku })),
    [products],
  );

  const carrierFields = (
    <div className="grid grid-cols-2 gap-3">
      <div><Label className="text-xs">Transportista</Label><Input className="h-9 text-xs" value={carrier.carrier_name} onChange={(e) => setCarrier({ ...carrier, carrier_name: e.target.value })} /></div>
      <div><Label className="text-xs">Conductor</Label><Input className="h-9 text-xs" value={carrier.carrier_driver} onChange={(e) => setCarrier({ ...carrier, carrier_driver: e.target.value })} /></div>
      <div><Label className="text-xs">Teléfono</Label><Input className="h-9 text-xs" value={carrier.carrier_phone} onChange={(e) => setCarrier({ ...carrier, carrier_phone: e.target.value })} /></div>
      <div><Label className="text-xs">Vehículo</Label><Input className="h-9 text-xs" value={carrier.carrier_vehicle} onChange={(e) => setCarrier({ ...carrier, carrier_vehicle: e.target.value })} /></div>
      <div><Label className="text-xs">Matrícula</Label><Input className="h-9 text-xs" value={carrier.carrier_plate} onChange={(e) => setCarrier({ ...carrier, carrier_plate: e.target.value })} /></div>
      <div><Label className="text-xs">Guía / Tracking</Label><Input className="h-9 text-xs" value={carrier.tracking_code} onChange={(e) => setCarrier({ ...carrier, tracking_code: e.target.value })} /></div>
      <div className="col-span-2"><Label className="text-xs">Llegada estimada</Label><Input type="datetime-local" className="h-9 text-xs" value={carrier.estimated_arrival} onChange={(e) => setCarrier({ ...carrier, estimated_arrival: e.target.value })} /></div>
    </div>
  );

  const kpis = useMemo(() => {
    const sum = (arr: TransferItem[], key: "quantity_shipped" | "quantity_received" | "quantity_requested") =>
      arr.reduce((a, b) => a + (Number(b[key] ?? 0) || 0), 0);
    let out = 0, inn = 0, transit = 0, pending = 0;
    transfers.forEach((tr) => {
      const its = items[tr.id] || [];
      if (tr.status === "in_transit") { transit++; out += sum(its, "quantity_shipped"); }
      if (tr.status === "requested" || tr.status === "approved") pending++;
      if (tr.status === "received") {
        out += sum(its, "quantity_shipped") || sum(its, "quantity_requested");
        inn += sum(its, "quantity_received") || sum(its, "quantity_requested");
      }
    });
    return { out, inn, transit, pending };
  }, [transfers, items]);

  return (
    <AppLayout title={t("nav.items.transfers")}>
      <div className="flex justify-between items-center mb-4 gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-heading font-semibold">Transferencias de Stock</h2>
          <p className="text-xs text-muted-foreground">Mueve inventario entre almacenes y tiendas con seguimiento de entradas y salidas</p>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setOpen(true); }} className="gap-1 gradient-brand text-primary-foreground">
          <Plus className="h-3.5 w-3.5" /> Nueva Transferencia
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          { label: "Pendientes", value: kpis.pending },
          { label: "En tránsito", value: kpis.transit },
          { label: "Unidades salidas", value: kpis.out },
          { label: "Unidades entradas", value: kpis.inn },
        ].map((k) => (
          <div key={k.label} className="bg-card border rounded-xl p-3 shadow-card">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
            <p className="text-xl font-heading font-semibold">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-4">

        <TableToolbar
          search={table.search}
          onSearchChange={table.setSearch}
          searchPlaceholder="Buscar código, ubicación, responsable o guía..."
          filters={[
            {
              key: "status", label: "Estado", value: table.filters.status || "__all__",
              onChange: (v) => table.setFilter("status", v),
              options: ["requested", "approved", "in_transit", "received", "cancelled"].map((s) => ({ value: s, label: statusBadge(s).label })),
            },
            {
              key: "origin", label: "Origen", value: table.filters.origin || "__all__",
              onChange: (v) => table.setFilter("origin", v),
              options: locationOptions,
            },
            {
              key: "destination", label: "Destino", value: table.filters.destination || "__all__",
              onChange: (v) => table.setFilter("destination", v),
              options: locationOptions,
            },
          ]}
        />

        <div className="bg-card rounded-xl shadow-card border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Código</TableHead>
                <TableHead className="text-xs">Origen → Destino</TableHead>
                <TableHead className="text-xs hidden md:table-cell">Items</TableHead>
                <TableHead className="text-xs hidden lg:table-cell">Documento por</TableHead>
                <TableHead className="text-xs hidden lg:table-cell">Transporte</TableHead>
                <TableHead className="text-xs hidden sm:table-cell">Fecha</TableHead>
                <TableHead className="text-xs">Estado</TableHead>
                <TableHead className="text-xs w-56">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.paged.map((tr) => {
                const st = statusBadge(tr.status);
                const its = items[tr.id] || [];
                return (
                  <TableRow key={tr.id}>
                    <TableCell className="text-xs font-heading font-semibold">{tr.transfer_number}</TableCell>
                    <TableCell className="text-xs">
                      <div className="flex items-center gap-1">
                        <span>{tr.originName}</span>
                        <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                        <span>{tr.destName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs hidden md:table-cell">
                      {its.length} producto(s) · sol. {its.reduce((a, b) => a + b.quantity_requested, 0)} · sal. {its.reduce((a, b) => a + (b.quantity_shipped ?? 0), 0)} · ent. {its.reduce((a, b) => a + (b.quantity_received ?? 0), 0)}
                    </TableCell>
                    <TableCell className="text-xs hidden lg:table-cell">
                      <span className="inline-flex items-center gap-1"><User className="h-3 w-3 text-muted-foreground" />{tr.creatorName}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">
                      {tr.carrier_name ? `${tr.carrier_name}${tr.carrier_plate ? ` · ${tr.carrier_plate}` : ""}` : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">{format(new Date(tr.created_at), "dd/MM/yy HH:mm")}</TableCell>
                    <TableCell><Badge className={`text-[10px] ${st.className}`} variant="outline">{st.label}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => openTracking(tr)}>
                          <Route className="h-3 w-3 mr-1" /> Seguimiento
                        </Button>
                        {tr.status === "requested" && (
                          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => openFlow(tr, "ship")}>
                            <Truck className="h-3 w-3 mr-1" /> Registrar salida
                          </Button>
                        )}
                        {(tr.status === "in_transit" || tr.status === "approved") && (
                          <Button size="sm" className="h-7 text-[10px] gradient-brand text-primary-foreground" onClick={() => openFlow(tr, "receive")}>
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Registrar entrada
                          </Button>
                        )}

                        {tr.status !== "received" && tr.status !== "cancelled" && (
                          <>
                            <Button
                              size="sm" variant="ghost" className="h-7 text-[10px]"
                              onClick={() => {
                                setCarrier({
                                  carrier_name: tr.carrier_name || "", carrier_driver: tr.carrier_driver || "",
                                  carrier_phone: tr.carrier_phone || "", carrier_vehicle: tr.carrier_vehicle || "",
                                  carrier_plate: tr.carrier_plate || "", tracking_code: tr.tracking_code || "",
                                  estimated_arrival: tr.estimated_arrival ? tr.estimated_arrival.slice(0, 16) : "",
                                });
                                setCarrierEdit(tr);
                              }}
                            >
                              <Truck className="h-3 w-3 mr-1" /> Transporte
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-[10px] text-destructive" onClick={() => changeStatus(tr.id, "cancelled")}>
                              <XCircle className="h-3 w-3 mr-1" /> Cancelar
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {table.total === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-xs text-muted-foreground">Sin transferencias</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination page={table.page} pageSize={table.pageSize} total={table.total}
            onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />
        </div>
      </div>

      {/* Nueva transferencia */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Transferencia</DialogTitle>
            <DialogDescription>Solicita el movimiento de stock entre dos ubicaciones</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Origen</Label>
                <div className="flex gap-2">
                  <SearchableSelect
                    className="w-32"
                    options={[{ value: "warehouse", label: "Almacén" }, { value: "store", label: "Tienda" }]}
                    value={originType}
                    onChange={(v) => { setOriginType(v as LocType); setOriginId(""); }}
                  />
                  <SearchableSelect
                    className="flex-1"
                    options={(originType === "warehouse" ? warehouses : stores).map((l) => ({ value: l.id, label: l.name }))}
                    value={originId}
                    onChange={setOriginId}
                    placeholder="Seleccionar"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Destino</Label>
                <div className="flex gap-2">
                  <SearchableSelect
                    className="w-32"
                    options={[{ value: "warehouse", label: "Almacén" }, { value: "store", label: "Tienda" }]}
                    value={destType}
                    onChange={(v) => { setDestType(v as LocType); setDestId(""); }}
                  />
                  <SearchableSelect
                    className="flex-1"
                    options={(destType === "warehouse" ? warehouses : stores).map((l) => ({ value: l.id, label: l.name }))}
                    value={destId}
                    onChange={setDestId}
                    placeholder="Seleccionar"
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <Label className="text-xs font-semibold">Productos</Label>
                <Button size="sm" variant="outline" onClick={() => setDraftItems([...draftItems, { product_id: "", quantity: "1" }])} className="h-7 text-[10px]">
                  <Plus className="h-3 w-3 mr-1" /> Agregar
                </Button>
              </div>
              <div className="space-y-2">
                {draftItems.map((d, i) => {
                  const avail = d.product_id && originId ? stockAt(d.product_id, originType, originId) : null;
                  const over = avail !== null && Number(d.quantity) > avail;
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex gap-2 items-center">
                        <SearchableSelect
                          className="flex-1"
                          options={productOptions}
                          value={d.product_id}
                          onChange={(v) => { const arr = [...draftItems]; arr[i].product_id = v; setDraftItems(arr); }}
                          placeholder="Producto"
                          searchPlaceholder="Buscar producto..."
                        />
                        <Input type="number" min="1" className="w-24 h-9 text-xs" value={d.quantity}
                          onChange={(e) => { const arr = [...draftItems]; arr[i].quantity = e.target.value; setDraftItems(arr); }} />
                        <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" onClick={() => setDraftItems(draftItems.filter((_, j) => j !== i))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {avail !== null && (
                        <p className={`text-[10px] ${over ? "text-destructive" : "text-muted-foreground"}`}>
                          Disponible en origen: {avail} u.{over ? " · excede el stock disponible" : ""}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

            </div>

            <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
              <Label className="text-xs font-semibold">Datos de transportación</Label>
              {carrierFields}
            </div>

            <div>
              <Label className="text-xs">Notas</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
            </div>
            <p className="text-[11px] text-muted-foreground">
              El documento se registrará a nombre de <strong>{personName(user?.id ?? null)}</strong>.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button className="gradient-brand text-primary-foreground" onClick={handleCreate}>Crear Transferencia</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar transportación */}
      <Dialog open={!!carrierEdit} onOpenChange={(o) => !o && setCarrierEdit(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Transportación · {carrierEdit?.transfer_number}</DialogTitle>
            <DialogDescription>Datos del transportista y de la guía de transporte</DialogDescription>
          </DialogHeader>
          {carrierFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCarrierEdit(null)}>Cancelar</Button>
            <Button className="gradient-brand text-primary-foreground" onClick={saveCarrier}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Salida / Entrada con cantidades */}
      <Dialog open={!!flow} onOpenChange={(o) => { if (!o) { setFlow(null); setFlowQty({}); } }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {flow?.mode === "ship" ? "Registrar salida" : "Registrar entrada"} · {flow?.transfer.transfer_number}
            </DialogTitle>
            <DialogDescription>
              {flow
                ? flow.mode === "ship"
                  ? `Cantidades que salen de ${locName(flow.transfer.origin_type, flow.transfer.origin_id)}`
                  : `Cantidades recibidas en ${locName(flow.transfer.destination_type, flow.transfer.destination_id)} (descuenta el origen y suma el destino)`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {flow && (
            <div className="space-y-2">
              {(items[flow.transfer.id] || []).map((it) => {
                const avail = stockAt(it.product_id, flow.transfer.origin_type, flow.transfer.origin_id);
                return (
                  <div key={it.product_id} className="border rounded-lg p-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{it.product_name || it.product_id}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Solicitado {it.quantity_requested}
                          {it.quantity_shipped !== null ? ` · Enviado ${it.quantity_shipped}` : ""}
                          {flow.mode === "ship" ? ` · Disponible origen ${avail}` : ""}
                        </p>
                      </div>
                      <Input
                        type="number" min="0" className="w-24 h-9 text-xs"
                        value={flowQty[it.product_id] ?? ""}
                        onChange={(e) => setFlowQty({ ...flowQty, [it.product_id]: e.target.value })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setFlow(null); setFlowQty({}); }}>Cancelar</Button>
            <Button className="gradient-brand text-primary-foreground" onClick={confirmFlow}>
              {flow?.mode === "ship" ? "Confirmar salida" : "Confirmar entrada"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Seguimiento */}
      <Dialog open={!!tracking} onOpenChange={(o) => !o && setTracking(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Seguimiento · {tracking?.transfer_number}</DialogTitle>
            <DialogDescription>
              {tracking ? `${locName(tracking.origin_type, tracking.origin_id)} → ${locName(tracking.destination_type, tracking.destination_id)}` : ""}
            </DialogDescription>
          </DialogHeader>
          {tracking && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-muted/40 rounded-lg p-2">
                  <p className="text-muted-foreground text-[10px]">Documento creado por</p>
                  <p className="font-semibold">{personName(tracking.created_by || tracking.requested_by)}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-2">
                  <p className="text-muted-foreground text-[10px]">Estado actual</p>
                  <p className="font-semibold">{statusBadge(tracking.status).label}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-2">
                  <p className="text-muted-foreground text-[10px]">Transportista / conductor</p>
                  <p className="font-semibold">{tracking.carrier_name || "—"}{tracking.carrier_driver ? ` · ${tracking.carrier_driver}` : ""}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-2">
                  <p className="text-muted-foreground text-[10px]">Vehículo / matrícula</p>
                  <p className="font-semibold">{tracking.carrier_vehicle || "—"}{tracking.carrier_plate ? ` · ${tracking.carrier_plate}` : ""}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-2">
                  <p className="text-muted-foreground text-[10px]">Guía / tracking</p>
                  <p className="font-semibold">{tracking.tracking_code || "—"}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-2">
                  <p className="text-muted-foreground text-[10px]">Llegada estimada</p>
                  <p className="font-semibold">{tracking.estimated_arrival ? format(new Date(tracking.estimated_arrival), "dd/MM/yy HH:mm") : "—"}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold mb-2">Productos</p>
                <div className="space-y-1">
                  {(items[tracking.id] || []).map((it) => (
                    <div key={it.product_id} className="flex justify-between text-xs border-b py-1">
                      <span>{it.product_name || it.product_id}</span>
                      <span className="text-muted-foreground">
                        {it.quantity_requested} sol. · {it.quantity_shipped ?? 0} sal. · {it.quantity_received ?? 0} ent.
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold mb-2">Historial de estados</p>
                <div className="space-y-2">
                  {events.map((ev) => (
                    <div key={ev.id} className="flex gap-2 items-start text-xs border rounded-lg p-2 bg-muted/30">
                      <Badge variant="outline" className={`text-[10px] ${statusBadge(ev.status).className}`}>{statusBadge(ev.status).label}</Badge>
                      <div className="flex-1">
                        <p className="text-muted-foreground">{ev.note || "—"}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(ev.created_at), "dd/MM/yy HH:mm")} · {personName(ev.performed_by)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {events.length === 0 && <p className="text-xs text-muted-foreground">Sin eventos registrados</p>}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
