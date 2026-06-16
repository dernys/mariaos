import { AppLayout } from "@/components/AppLayout";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ClipboardList, Plus, CheckCircle2, AlertCircle, Loader2, Search } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { logActivity } from "@/hooks/useActivityLog";

interface Count {
  id: string;
  reference: string | null;
  count_type: string;
  status: string;
  notes: string | null;
  started_at: string;
  completed_at: string | null;
}

interface Item {
  id: string;
  product_id: string;
  expected_qty: number;
  counted_qty: number;
  difference: number;
  product?: { name: string; sku: string };
}

export default function Conteos() {
  const { t } = useTranslation();
  const tenantId = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const [counts, setCounts] = useState<Count[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [activeCount, setActiveCount] = useState<Count | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [scan, setScan] = useState("");
  const [newRef, setNewRef] = useState("");
  const [newType, setNewType] = useState("cycle");

  const fetchCounts = async () => {
    setLoading(true);
    const { data } = await supabase.from("physical_counts").select("*").order("created_at", { ascending: false }).limit(50);
    if (data) setCounts(data as Count[]);
    setLoading(false);
  };

  useEffect(() => { fetchCounts(); }, []);

  const openCount = async (c: Count) => {
    setActiveCount(c);
    const { data } = await supabase
      .from("physical_count_items")
      .select("*, product:products(name, sku)")
      .eq("count_id", c.id)
      .order("created_at");
    if (data) setItems(data as any);
  };

  const createCount = async () => {
    if (!tenantId) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("physical_counts")
      .insert({ tenant_id: tenantId, reference: newRef || `Conteo-${Date.now()}`, count_type: newType, performed_by: user?.id, status: "in_progress" })
      .select().single();
    setCreating(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setNewRef("");
    fetchCounts();
    if (data) openCount(data as Count);
  };

  const addProductByScan = async () => {
    if (!activeCount || !scan.trim()) return;
    const term = scan.trim();
    const { data: products } = await supabase
      .from("products")
      .select("id, name, sku")
      .or(`sku.eq.${term},name.ilike.%${term}%`)
      .limit(1);
    if (!products || products.length === 0) {
      toast({ title: "Producto no encontrado", variant: "destructive" });
      return;
    }
    const p = products[0];
    // Get current stock
    const { data: stockRows } = await supabase.from("product_stock").select("stock").eq("product_id", p.id);
    const expected = (stockRows || []).reduce((acc: number, r: any) => acc + Number(r.stock || 0), 0);
    // Upsert item: increment counted_qty by 1
    const existing = items.find((i) => i.product_id === p.id);
    if (existing) {
      const { error } = await supabase
        .from("physical_count_items")
        .update({ counted_qty: existing.counted_qty + 1 })
        .eq("id", existing.id);
      if (!error) setItems(items.map((i) => i.id === existing.id ? { ...i, counted_qty: i.counted_qty + 1, difference: (i.counted_qty + 1) - i.expected_qty } : i));
    } else {
      const { data: ins } = await supabase
        .from("physical_count_items")
        .insert({ count_id: activeCount.id, product_id: p.id, expected_qty: expected, counted_qty: 1 })
        .select("*, product:products(name, sku)").single();
      if (ins) setItems([...items, ins as any]);
    }
    setScan("");
  };

  const updateCounted = async (it: Item, val: number) => {
    await supabase.from("physical_count_items").update({ counted_qty: val }).eq("id", it.id);
    setItems(items.map((i) => i.id === it.id ? { ...i, counted_qty: val, difference: val - i.expected_qty } : i));
  };

  const completeCount = async () => {
    if (!activeCount) return;
    await supabase.from("physical_counts").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", activeCount.id);
    await logActivity({ entity_type: "physical_count", entity_id: activeCount.id, action: "Conteo completado", description: `${items.length} productos`, tenant_id: tenantId, performed_by: user?.id });
    toast({ title: "Conteo completado" });
    setActiveCount(null);
    fetchCounts();
  };

  const filteredItems = items.filter((i) => !search || i.product?.name.toLowerCase().includes(search.toLowerCase()) || i.product?.sku?.toLowerCase().includes(search.toLowerCase()));

  return (
    <AppLayout title={t("nav.items.counts")}>
      <div className="space-y-4">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground">Conteo cíclico, masivo y por escaneo. Las diferencias quedan registradas para auditoría y aprobación.</p>
          <div className="flex items-end gap-2">
            <div>
              <Label className="text-[11px]">Referencia</Label>
              <Input value={newRef} onChange={(e) => setNewRef(e.target.value)} placeholder="Conteo Mayo" className="h-8 w-40" />
            </div>
            <div>
              <Label className="text-[11px]">Tipo</Label>
              <select value={newType} onChange={(e) => setNewType(e.target.value)} className="h-8 rounded-md border bg-background text-xs px-2">
                <option value="cycle">Cíclico</option>
                <option value="full">Masivo</option>
                <option value="spot">Spot</option>
              </select>
            </div>
            <Button size="sm" onClick={createCount} disabled={creating} className="gap-1 gradient-brand text-primary-foreground">
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Nuevo conteo
            </Button>
          </div>
        </div>

        <div className="border rounded-lg overflow-hidden bg-card divide-y">
          {counts.length === 0 && !loading && (
            <div className="p-8 text-center text-xs text-muted-foreground">
              <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />Sin conteos registrados
            </div>
          )}
          {counts.map((c) => (
            <button key={c.id} onClick={() => openCount(c)} className="w-full text-left p-3 flex items-center justify-between hover:bg-muted/40">
              <div>
                <p className="text-sm font-medium">{c.reference || c.id.slice(0, 8)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {format(new Date(c.started_at), "dd MMM yyyy HH:mm", { locale: es })} · {c.count_type}
                </p>
              </div>
              <Badge variant={c.status === "completed" ? "default" : c.status === "approved" ? "outline" : "secondary"} className="text-[10px]">
                {c.status}
              </Badge>
            </button>
          ))}
        </div>
      </div>

      <Dialog open={!!activeCount} onOpenChange={(o) => !o && setActiveCount(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{activeCount?.reference}</DialogTitle>
            <DialogDescription>Escanea o busca productos para registrar la cantidad contada.</DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Input value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addProductByScan()} placeholder="Escanear SKU o nombre..." className="h-9" />
            <Button size="sm" onClick={addProductByScan}>Añadir</Button>
          </div>

          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar..." className="h-8 pl-7 text-xs" />
          </div>

          <div className="border rounded-md divide-y max-h-[50vh] overflow-y-auto">
            {filteredItems.map((it) => (
              <div key={it.id} className="p-2 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{it.product?.name}</p>
                  <p className="text-[10px] text-muted-foreground">SKU: {it.product?.sku} · Esperado: {it.expected_qty}</p>
                </div>
                <Input type="number" value={it.counted_qty} onChange={(e) => updateCounted(it, Number(e.target.value))} className="h-8 w-20 text-xs" />
                <Badge className={`text-[10px] ${it.difference === 0 ? 'bg-success/15 text-success' : it.difference > 0 ? 'bg-primary/15 text-primary' : 'bg-destructive/15 text-destructive'}`}>
                  {it.difference > 0 ? "+" : ""}{it.difference}
                </Badge>
              </div>
            ))}
            {filteredItems.length === 0 && <p className="p-4 text-xs text-center text-muted-foreground">Sin productos contados aún</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveCount(null)}>Cerrar</Button>
            {activeCount?.status === "in_progress" && (
              <Button onClick={completeCount} className="gap-1 gradient-brand text-primary-foreground">
                <CheckCircle2 className="h-4 w-4" /> Completar conteo
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
