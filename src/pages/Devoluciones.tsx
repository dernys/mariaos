import { AppLayout } from "@/components/AppLayout";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, Undo2, RotateCcw } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

interface Sale { id: string; ticket_number: string | null; total: number; status: string; created_at: string; }
interface SaleItem { id: string; product_id: string | null; product_name: string; qty: number; price: number; total: number; }
interface ReturnRow { id: string; return_number: string; sale_id: string; total_refunded: number; refund_method: string; reason: string | null; return_type: string; created_at: string; }

export default function Devoluciones() {
  const { toast } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [draft, setDraft] = useState<Record<string, { qty: string; restock: boolean }>>({});
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");

  const fetchAll = async () => {
    const [sR, rR] = await Promise.all([
      supabase.from("sales").select("id, ticket_number, total, status, created_at").order("created_at", { ascending: false }).limit(50),
      (supabase.from as any)("sale_returns").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    setSales((sR.data || []) as Sale[]);
    setReturns(rR.data || []);
  };

  useEffect(() => { fetchAll(); }, []);

  const openReturn = async (s: Sale) => {
    setSelectedSale(s);
    setReason(""); setRefundMethod("cash");
    const { data } = await supabase.from("sale_items").select("id, product_id, product_name, qty, price, total").eq("sale_id", s.id);
    const its = (data || []) as SaleItem[];
    setItems(its);
    const d: Record<string, { qty: string; restock: boolean }> = {};
    its.forEach((i) => { d[i.id] = { qty: "0", restock: true }; });
    setDraft(d);
    setOpen(true);
  };

  const totalRefund = items.reduce((acc, i) => acc + (Number(draft[i.id]?.qty) || 0) * i.price, 0);

  const submit = async () => {
    if (!selectedSale) return;
    const itemsArr = items
      .filter((i) => Number(draft[i.id]?.qty) > 0)
      .map((i) => ({ sale_item_id: i.id, qty: Number(draft[i.id].qty), restock: draft[i.id].restock }));
    if (!itemsArr.length) { toast({ title: "Ingresa al menos una cantidad a devolver", variant: "destructive" }); return; }

    const allFull = itemsArr.every((it) => {
      const orig = items.find((x) => x.id === it.sale_item_id);
      return orig && it.qty === Number(orig.qty);
    }) && itemsArr.length === items.length;

    const { error } = await supabase.rpc("process_sale_return" as any, {
      p_sale_id: selectedSale.id,
      p_items: itemsArr as any,
      p_reason: reason || null,
      p_refund_method: refundMethod,
      p_return_type: allFull ? "full" : "partial",
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Devolución registrada", description: `Reembolso $${totalRefund.toFixed(2)}` });
    setOpen(false); fetchAll();
  };

  const filteredSales = sales.filter((s) =>
    !search || (s.ticket_number || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout title="Devoluciones">
      <Tabs defaultValue="new" className="space-y-4">
        <TabsList>
          <TabsTrigger value="new">Registrar devolución</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nº de ticket..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
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
                {filteredSales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs font-heading font-semibold">{s.ticket_number || s.id.slice(0, 8)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(s.created_at), "dd/MM/yy HH:mm")}</TableCell>
                    <TableCell className="text-xs font-heading font-bold">${Number(s.total).toFixed(2)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{s.status}</Badge></TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled={s.status === "cancelled"} onClick={() => openReturn(s)}>
                        <Undo2 className="h-3 w-3 mr-1" /> Devolver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <div className="bg-card rounded-xl shadow-card border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Nº</TableHead>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Reembolso</TableHead>
                  <TableHead className="text-xs">Método</TableHead>
                  <TableHead className="text-xs">Motivo</TableHead>
                  <TableHead className="text-xs">Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returns.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs font-heading font-semibold">{r.return_number}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{r.return_type === "full" ? "Total" : "Parcial"}</Badge></TableCell>
                    <TableCell className="text-xs font-heading font-bold">${Number(r.total_refunded).toFixed(2)}</TableCell>
                    <TableCell className="text-xs">{r.refund_method}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.reason || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(r.created_at), "dd/MM/yy HH:mm")}</TableCell>
                  </TableRow>
                ))}
                {returns.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">Sin devoluciones</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Devolución de venta</DialogTitle>
            <DialogDescription>
              Ticket {selectedSale?.ticket_number} · Total ${Number(selectedSale?.total || 0).toFixed(2)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-card rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Producto</TableHead>
                    <TableHead className="text-xs">Vendido</TableHead>
                    <TableHead className="text-xs">Precio</TableHead>
                    <TableHead className="text-xs">Devolver</TableHead>
                    <TableHead className="text-xs">Reponer stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="text-xs">{i.product_name}</TableCell>
                      <TableCell className="text-xs">{i.qty}</TableCell>
                      <TableCell className="text-xs">${Number(i.price).toFixed(2)}</TableCell>
                      <TableCell>
                        <Input type="number" min="0" max={i.qty} className="h-8 w-20 text-xs"
                          value={draft[i.id]?.qty || "0"}
                          onChange={(e) => setDraft({ ...draft, [i.id]: { ...draft[i.id], qty: e.target.value } })} />
                      </TableCell>
                      <TableCell>
                        <input type="checkbox" checked={draft[i.id]?.restock ?? true}
                          onChange={(e) => setDraft({ ...draft, [i.id]: { ...draft[i.id], restock: e.target.checked } })}
                          className="h-4 w-4" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Método de reembolso</Label>
                <Select value={refundMethod} onValueChange={setRefundMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Efectivo</SelectItem>
                    <SelectItem value="card">Tarjeta</SelectItem>
                    <SelectItem value="credit">Saldo a favor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Total a reembolsar</Label>
                <Input value={totalRefund.toFixed(2)} disabled className="font-bold" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Motivo</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Defectuoso, cambio de opinión..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button className="gradient-brand text-primary-foreground" onClick={submit}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Confirmar Devolución
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
