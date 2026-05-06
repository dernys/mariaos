import { AppLayout } from "@/components/AppLayout";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, ArrowRightLeft, Trash2, Truck, CheckCircle2, XCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

type LocType = "warehouse" | "store";

interface Loc { id: string; name: string; type: LocType; }
interface Product { id: string; name: string; sku: string; }
interface TransferItem {
  product_id: string;
  product_name?: string;
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
  const tenantId = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();

  const [warehouses, setWarehouses] = useState<Loc[]>([]);
  const [stores, setStores] = useState<Loc[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [items, setItems] = useState<Record<string, TransferItem[]>>({});
  const [open, setOpen] = useState(false);

  // Form
  const [originType, setOriginType] = useState<LocType>("warehouse");
  const [originId, setOriginId] = useState("");
  const [destType, setDestType] = useState<LocType>("store");
  const [destId, setDestId] = useState("");
  const [notes, setNotes] = useState("");
  const [draftItems, setDraftItems] = useState<{ product_id: string; quantity: string }[]>([
    { product_id: "", quantity: "1" },
  ]);

  const fetchAll = async () => {
    const [whR, stR, prR, trR] = await Promise.all([
      supabase.from("warehouses").select("id, name").order("name"),
      supabase.from("stores").select("id, name").order("name"),
      supabase.from("products").select("id, name, sku").order("name"),
      supabase.from("stock_transfers").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    setWarehouses((whR.data || []).map((w) => ({ ...w, type: "warehouse" as LocType })));
    setStores((stR.data || []).map((s) => ({ ...s, type: "store" as LocType })));
    setProducts(prR.data || []);
    const ts = (trR.data || []) as unknown as Transfer[];
    setTransfers(ts);
    if (ts.length) {
      const { data: its } = await supabase
        .from("stock_transfer_items")
        .select("transfer_id, product_id, quantity_requested, quantity_shipped, quantity_received, products(name)")
        .in("transfer_id", ts.map((t) => t.id));
      const grouped: Record<string, TransferItem[]> = {};
      (its || []).forEach((it: any) => {
        (grouped[it.transfer_id] = grouped[it.transfer_id] || []).push({
          product_id: it.product_id,
          product_name: it.products?.name,
          quantity_requested: Number(it.quantity_requested),
          quantity_shipped: it.quantity_shipped !== null ? Number(it.quantity_shipped) : null,
          quantity_received: it.quantity_received !== null ? Number(it.quantity_received) : null,
        });
      });
      setItems(grouped);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const resetForm = () => {
    setOriginType("warehouse"); setOriginId("");
    setDestType("store"); setDestId("");
    setNotes("");
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
      status: "requested", requested_by: user?.id,
    }).select("id").single();
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

  const changeStatus = async (id: string, status: string) => {
    const patch: any = { status };
    if (status === "in_transit") { patch.shipped_at = new Date().toISOString(); patch.shipped_by = user?.id; }
    if (status === "cancelled") { patch.cancelled_at = new Date().toISOString(); }
    const { error } = await supabase.from("stock_transfers").update(patch).eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Estado actualizado" });
    fetchAll();
  };

  const receive = async (id: string) => {
    const { error } = await supabase.rpc("receive_stock_transfer", { p_transfer_id: id });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Transferencia recibida y stock actualizado" });
    fetchAll();
  };

  const locName = (type: string, id: string) => {
    const list = type === "warehouse" ? warehouses : stores;
    return list.find((l) => l.id === id)?.name || "—";
  };

  return (
    <AppLayout title="Transferencias">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-heading font-semibold">Transferencias de Stock</h2>
          <p className="text-xs text-muted-foreground">Mueve inventario entre almacenes y tiendas</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1 gradient-brand text-primary-foreground">
          <Plus className="h-3.5 w-3.5" /> Nueva Transferencia
        </Button>
      </div>

      <div className="bg-card rounded-xl shadow-card border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Código</TableHead>
              <TableHead className="text-xs">Origen → Destino</TableHead>
              <TableHead className="text-xs">Items</TableHead>
              <TableHead className="text-xs">Fecha</TableHead>
              <TableHead className="text-xs">Estado</TableHead>
              <TableHead className="text-xs w-48">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transfers.map((t) => {
              const st = statusBadge(t.status);
              const its = items[t.id] || [];
              return (
                <TableRow key={t.id}>
                  <TableCell className="text-xs font-heading font-semibold">{t.transfer_number}</TableCell>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-1">
                      <span>{locName(t.origin_type, t.origin_id)}</span>
                      <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                      <span>{locName(t.destination_type, t.destination_id)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {its.length} producto(s) · {its.reduce((a, b) => a + b.quantity_requested, 0)} u.
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{format(new Date(t.created_at), "dd/MM/yy HH:mm")}</TableCell>
                  <TableCell><Badge className={`text-[10px] ${st.className}`} variant="outline">{st.label}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {t.status === "requested" && (
                        <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => changeStatus(t.id, "in_transit")}>
                          <Truck className="h-3 w-3 mr-1" /> Enviar
                        </Button>
                      )}
                      {(t.status === "in_transit" || t.status === "approved") && (
                        <Button size="sm" className="h-7 text-[10px] gradient-brand text-primary-foreground" onClick={() => receive(t.id)}>
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Recibir
                        </Button>
                      )}
                      {t.status !== "received" && t.status !== "cancelled" && (
                        <Button size="sm" variant="ghost" className="h-7 text-[10px] text-destructive" onClick={() => changeStatus(t.id, "cancelled")}>
                          <XCircle className="h-3 w-3 mr-1" /> Cancelar
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {transfers.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">Sin transferencias</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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
                  <Select value={originType} onValueChange={(v) => { setOriginType(v as LocType); setOriginId(""); }}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="warehouse">Almacén</SelectItem>
                      <SelectItem value="store">Tienda</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={originId} onValueChange={setOriginId}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {(originType === "warehouse" ? warehouses : stores).map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Destino</Label>
                <div className="flex gap-2">
                  <Select value={destType} onValueChange={(v) => { setDestType(v as LocType); setDestId(""); }}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="warehouse">Almacén</SelectItem>
                      <SelectItem value="store">Tienda</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={destId} onValueChange={setDestId}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {(destType === "warehouse" ? warehouses : stores).map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                {draftItems.map((d, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Select value={d.product_id} onValueChange={(v) => {
                      const arr = [...draftItems]; arr[i].product_id = v; setDraftItems(arr);
                    }}>
                      <SelectTrigger className="flex-1 h-9 text-xs"><SelectValue placeholder="Producto" /></SelectTrigger>
                      <SelectContent>
                        {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input type="number" min="1" className="w-24 h-9 text-xs" value={d.quantity}
                      onChange={(e) => { const arr = [...draftItems]; arr[i].quantity = e.target.value; setDraftItems(arr); }} />
                    <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" onClick={() => setDraftItems(draftItems.filter((_, j) => j !== i))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">Notas</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button className="gradient-brand text-primary-foreground" onClick={handleCreate}>Crear Transferencia</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
