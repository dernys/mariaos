import { AppLayout } from "@/components/AppLayout";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MiniStatCard, StatRow } from "@/components/data/MiniStatCard";
import { Package, DollarSign, Wallet, Check } from "lucide-react";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

export default function Consignacion() {
  const nav = useNavigate();
  const { toast } = useToast();
  const [lots, setLots] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchAll = async () => {
    const [lR, sR] = await Promise.all([
      (supabase.from as any)("consignment_lots").select("*, products(name, sku), suppliers(name)").order("received_at", { ascending: false }),
      (supabase.from as any)("consignment_settlements").select("*, suppliers(name), consignment_lots(products(name))").eq("status", "pending").order("created_at", { ascending: false }),
    ]);
    setLots(lR.data || []); setSettlements(sR.data || []);
  };
  useEffect(() => { fetchAll(); }, []);

  const activeLots = lots.filter((l) => l.status === "active");
  const totalUnits = activeLots.reduce((a, l) => a + Number(l.quantity_remaining || 0), 0);
  const valuePending = activeLots.reduce((a, l) => a + Number(l.quantity_remaining) * Number(l.unit_cost), 0);
  const settlePending = settlements.reduce((a, s) => a + Number(s.total), 0);

  const toggle = (id: string) => {
    const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n);
  };

  const settle = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    // group by supplier
    const supplierMap = new Map<string, string[]>();
    settlements.filter(s => ids.includes(s.id)).forEach(s => {
      if (!supplierMap.has(s.supplier_id)) supplierMap.set(s.supplier_id, []);
      supplierMap.get(s.supplier_id)!.push(s.id);
    });
    if (supplierMap.size > 1) { toast({ title: "Selecciona un solo proveedor", variant: "destructive" }); return; }
    const [sIds] = Array.from(supplierMap.values());
    const { error } = await (supabase.rpc as any)("settle_consignment_lots", { p_settlement_ids: sIds, p_method: "cash", p_notes: "Liquidación" });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Liquidación registrada" });
    setSelected(new Set()); fetchAll();
  };

  return (
    <AppLayout title="Consignaciones">
      <div className="space-y-4">
        <StatRow>
          <MiniStatCard label="Lotes activos" value={activeLots.length} icon={Package} tone="primary" />
          <MiniStatCard label="Unidades pendientes" value={totalUnits} icon={Package} />
          <MiniStatCard label="Valor en consignación" value={`$${valuePending.toLocaleString()}`} icon={DollarSign} />
          <MiniStatCard label="Por liquidar" value={`$${settlePending.toLocaleString()}`} icon={Wallet} tone={settlePending > 0 ? "warning" : "success"} />
        </StatRow>

        <div className="bg-card rounded-xl border overflow-hidden">
          <div className="p-3 border-b"><p className="text-xs font-heading font-semibold">Lotes en consignación</p></div>
          <Table>
            <TableHeader><TableRow>
              <TableHead className="text-xs">Proveedor</TableHead>
              <TableHead className="text-xs">Producto</TableHead>
              <TableHead className="text-xs">Recibido</TableHead>
              <TableHead className="text-xs text-right">Recibido</TableHead>
              <TableHead className="text-xs text-right">Vendido</TableHead>
              <TableHead className="text-xs text-right">Restante</TableHead>
              <TableHead className="text-xs text-right">Costo</TableHead>
              <TableHead className="text-xs">Estado</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {lots.map((l) => (
                <TableRow key={l.id} className="cursor-pointer" onClick={() => nav(`/proveedores/${l.supplier_id}`)}>
                  <TableCell className="text-xs font-medium">{l.suppliers?.name}</TableCell>
                  <TableCell className="text-xs">{l.products?.name}</TableCell>
                  <TableCell className="text-xs">{format(new Date(l.received_at), "dd/MM/yy")}</TableCell>
                  <TableCell className="text-xs text-right">{l.quantity_received}</TableCell>
                  <TableCell className="text-xs text-right">{l.quantity_sold}</TableCell>
                  <TableCell className="text-xs text-right font-bold">{l.quantity_remaining}</TableCell>
                  <TableCell className="text-xs text-right">${Number(l.unit_cost).toFixed(2)}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{l.status}</Badge></TableCell>
                </TableRow>
              ))}
              {lots.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-6">Sin lotes</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>

        <div className="bg-card rounded-xl border overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b">
            <p className="text-xs font-heading font-semibold">Liquidaciones pendientes</p>
            <Button size="sm" disabled={selected.size === 0} onClick={settle} className="h-8 text-xs gap-1 gradient-brand text-primary-foreground">
              <Check className="h-3 w-3" />Liquidar ({selected.size})
            </Button>
          </div>
          <Table>
            <TableHeader><TableRow>
              <TableHead className="text-xs w-8"></TableHead>
              <TableHead className="text-xs">Fecha</TableHead>
              <TableHead className="text-xs">Proveedor</TableHead>
              <TableHead className="text-xs">Producto</TableHead>
              <TableHead className="text-xs text-right">Cant.</TableHead>
              <TableHead className="text-xs text-right">Total</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {settlements.map((s) => (
                <TableRow key={s.id}>
                  <TableCell><Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} /></TableCell>
                  <TableCell className="text-xs">{format(new Date(s.created_at), "dd/MM/yy")}</TableCell>
                  <TableCell className="text-xs">{s.suppliers?.name}</TableCell>
                  <TableCell className="text-xs">{s.consignment_lots?.products?.name}</TableCell>
                  <TableCell className="text-xs text-right">{s.quantity}</TableCell>
                  <TableCell className="text-xs text-right font-bold">${Number(s.total).toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {settlements.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">Nada por liquidar</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </div>
    </AppLayout>
  );
}
