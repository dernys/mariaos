import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, FileSpreadsheet, RefreshCw } from "lucide-react";

type Sheet = {
  id: string;
  name: string;
  product_id: string | null;
  raw_materials_cost: number;
  labor_cost: number;
  indirect_cost: number;
  packaging_cost: number;
  other_cost: number;
  unit_cost: number;
  margin_pct: number;
  suggested_price: number;
  currency: string;
  is_active: boolean;
};

type Item = {
  id: string;
  cost_sheet_id: string;
  category: string;
  description: string;
  quantity: number;
  unit: string | null;
  unit_cost: number;
  total: number;
};

const CATEGORIES = ["materias_primas", "mano_obra", "indirectos", "empaque", "otros"];
const fmt = (n: number) => new Intl.NumberFormat("es-CU", { style: "currency", currency: "CUP" }).format(n || 0);

export default function CuCostSheetsTab() {
  const tenantId = useTenant();
  const { toast } = useToast();
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [selected, setSelected] = useState<Sheet | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [newDialog, setNewDialog] = useState(false);
  const [form, setForm] = useState({ name: "", margin_pct: 30 });
  const [itemForm, setItemForm] = useState({ category: "materias_primas", description: "", quantity: 1, unit: "u", unit_cost: 0 });

  const loadSheets = async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("cu_cost_sheets")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    setSheets((data as Sheet[]) || []);
  };

  const loadItems = async (sheetId: string) => {
    const { data } = await supabase
      .from("cu_cost_sheet_items")
      .select("*")
      .eq("cost_sheet_id", sheetId)
      .order("created_at", { ascending: true });
    setItems((data as Item[]) || []);
  };

  useEffect(() => { loadSheets(); /* eslint-disable-next-line */ }, [tenantId]);
  useEffect(() => { if (selected) loadItems(selected.id); }, [selected]);

  const createSheet = async () => {
    if (!tenantId || !form.name) return;
    const { data, error } = await supabase
      .from("cu_cost_sheets")
      .insert({ tenant_id: tenantId, name: form.name, margin_pct: form.margin_pct, currency: "CUP" })
      .select()
      .single();
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    setNewDialog(false);
    setForm({ name: "", margin_pct: 30 });
    await loadSheets();
    setSelected(data as Sheet);
  };

  const addItem = async () => {
    if (!selected || !tenantId) return;
    const total = itemForm.quantity * itemForm.unit_cost;
    const { error } = await supabase.from("cu_cost_sheet_items").insert({
      cost_sheet_id: selected.id,
      tenant_id: tenantId,
      category: itemForm.category,
      description: itemForm.description,
      quantity: itemForm.quantity,
      unit: itemForm.unit,
      unit_cost: itemForm.unit_cost,
      total,
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    setItemForm({ category: "materias_primas", description: "", quantity: 1, unit: "u", unit_cost: 0 });
    await loadItems(selected.id);
    await loadSheets();
    const fresh = await supabase.from("cu_cost_sheets").select("*").eq("id", selected.id).single();
    if (fresh.data) setSelected(fresh.data as Sheet);
  };

  const delItem = async (id: string) => {
    await supabase.from("cu_cost_sheet_items").delete().eq("id", id);
    if (selected) {
      await loadItems(selected.id);
      const fresh = await supabase.from("cu_cost_sheets").select("*").eq("id", selected.id).single();
      if (fresh.data) setSelected(fresh.data as Sheet);
    }
    await loadSheets();
  };

  const recompute = async () => {
    if (!selected) return;
    const { error } = await supabase.rpc("recompute_cu_cost_sheet", { p_cost_sheet_id: selected.id });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Costo recalculado" });
    const fresh = await supabase.from("cu_cost_sheets").select("*").eq("id", selected.id).single();
    if (fresh.data) setSelected(fresh.data as Sheet);
    await loadSheets();
  };

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-1">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> Plantillas</CardTitle>
          <Button size="sm" onClick={() => setNewDialog(true)}><Plus className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-1">
          {sheets.length === 0 && <p className="text-xs text-muted-foreground">Sin plantillas</p>}
          {sheets.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className={`w-full text-left p-2 rounded-md border text-sm ${selected?.id === s.id ? "bg-accent border-primary" : "hover:bg-muted/50"}`}
            >
              <div className="font-medium">{s.name}</div>
              <div className="text-xs text-muted-foreground flex justify-between">
                <span>Costo: {fmt(s.unit_cost)}</span>
                <span>Precio: {fmt(s.suggested_price)}</span>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        {!selected ? (
          <CardContent className="py-12 text-center text-muted-foreground text-sm">Selecciona una plantilla</CardContent>
        ) : (
          <>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">{selected.name}</CardTitle>
                <p className="text-xs text-muted-foreground">Margen {selected.margin_pct}% → Precio sugerido {fmt(selected.suggested_price)}</p>
              </div>
              <Button size="sm" variant="outline" onClick={recompute}><RefreshCw className="h-3.5 w-3.5 mr-1" />Recalcular</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                <div className="p-2 rounded bg-muted/40"><div className="text-muted-foreground">Materias</div><div className="font-semibold">{fmt(selected.raw_materials_cost)}</div></div>
                <div className="p-2 rounded bg-muted/40"><div className="text-muted-foreground">M. Obra</div><div className="font-semibold">{fmt(selected.labor_cost)}</div></div>
                <div className="p-2 rounded bg-muted/40"><div className="text-muted-foreground">Indirectos</div><div className="font-semibold">{fmt(selected.indirect_cost)}</div></div>
                <div className="p-2 rounded bg-muted/40"><div className="text-muted-foreground">Empaque</div><div className="font-semibold">{fmt(selected.packaging_cost)}</div></div>
                <div className="p-2 rounded bg-muted/40"><div className="text-muted-foreground">Otros</div><div className="font-semibold">{fmt(selected.other_cost)}</div></div>
              </div>

              <div className="grid grid-cols-12 gap-2 items-end p-2 border rounded-md">
                <div className="col-span-3">
                  <Label className="text-[10px]">Categoría</Label>
                  <Select value={itemForm.category} onValueChange={(v) => setItemForm({ ...itemForm, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-4"><Label className="text-[10px]">Descripción</Label><Input value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} /></div>
                <div className="col-span-1"><Label className="text-[10px]">Cant</Label><Input type="number" value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: Number(e.target.value) })} /></div>
                <div className="col-span-1"><Label className="text-[10px]">Un</Label><Input value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} /></div>
                <div className="col-span-2"><Label className="text-[10px]">Costo unit.</Label><Input type="number" value={itemForm.unit_cost} onChange={(e) => setItemForm({ ...itemForm, unit_cost: Number(e.target.value) })} /></div>
                <div className="col-span-1"><Button size="sm" onClick={addItem}><Plus className="h-3.5 w-3.5" /></Button></div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Cant</TableHead>
                    <TableHead className="text-right">Costo unit.</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="text-xs">{i.category}</TableCell>
                      <TableCell>{i.description}</TableCell>
                      <TableCell className="text-right">{i.quantity} {i.unit}</TableCell>
                      <TableCell className="text-right">{fmt(i.unit_cost)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(i.total)}</TableCell>
                      <TableCell><Button size="icon" variant="ghost" onClick={() => delItem(i.id)}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
                    </TableRow>
                  ))}
                  {items.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-4 text-xs text-muted-foreground">Sin renglones</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </>
        )}
      </Card>

      <Dialog open={newDialog} onOpenChange={setNewDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nueva plantilla de costos</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Margen (%)</Label><Input type="number" value={form.margin_pct} onChange={(e) => setForm({ ...form, margin_pct: Number(e.target.value) })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialog(false)}>Cancelar</Button>
            <Button onClick={createSheet} className="gradient-brand text-primary-foreground">Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
