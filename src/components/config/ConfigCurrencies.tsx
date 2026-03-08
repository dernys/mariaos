import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, Coins } from "lucide-react";

interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  exchange_rate: number;
  is_base: boolean;
  is_active: boolean;
}

export function ConfigCurrencies() {
  const tenantId = useTenant();
  const { toast } = useToast();
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Currency | null>(null);
  const [form, setForm] = useState({ code: "", name: "", symbol: "$", exchange_rate: "1", is_base: false });

  const fetch = async () => {
    const { data } = await supabase.from("currencies").select("*").order("code");
    if (data) setCurrencies(data as Currency[]);
  };

  useEffect(() => { fetch(); }, []);

  const openNew = () => { setEditing(null); setForm({ code: "", name: "", symbol: "$", exchange_rate: "1", is_base: false }); setDialogOpen(true); };
  const openEdit = (c: Currency) => { setEditing(c); setForm({ code: c.code, name: c.name, symbol: c.symbol, exchange_rate: String(c.exchange_rate), is_base: c.is_base }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) { toast({ title: "Error", description: "Código y nombre requeridos", variant: "destructive" }); return; }
    const payload = { code: form.code.trim().toUpperCase(), name: form.name.trim(), symbol: form.symbol, exchange_rate: parseFloat(form.exchange_rate) || 1, is_base: form.is_base, tenant_id: tenantId };
    if (editing) {
      await supabase.from("currencies").update(payload).eq("id", editing.id);
    } else {
      await supabase.from("currencies").insert(payload);
    }
    toast({ title: editing ? "Moneda actualizada" : "Moneda creada" });
    setDialogOpen(false);
    fetch();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("currencies").delete().eq("id", id);
    toast({ title: "Moneda eliminada" });
    fetch();
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{currencies.length} monedas configuradas</p>
        <Button size="sm" onClick={openNew} className="gap-1 text-xs gradient-brand text-primary-foreground">
          <Plus className="h-3.5 w-3.5" /> Nueva Moneda
        </Button>
      </div>

      <div className="grid gap-2">
        {currencies.map((c) => (
          <Card key={c.id} className="p-0">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-heading font-bold text-primary">{c.symbol}</span>
                </div>
                <div>
                  <p className="text-sm font-medium">{c.code} — {c.name}</p>
                  <p className="text-xs text-muted-foreground">Tasa: {c.exchange_rate}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {c.is_base && <Badge variant="outline" className="text-[10px]">Base</Badge>}
                <Badge variant={c.is_active ? "default" : "secondary"} className="text-[10px]">{c.is_active ? "Activa" : "Inactiva"}</Badge>
                <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-muted transition-colors"><Edit2 className="h-3.5 w-3.5" /></button>
                <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </CardContent>
          </Card>
        ))}
        {currencies.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No hay monedas configuradas</p>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar" : "Nueva"} Moneda</DialogTitle>
            <DialogDescription>Configura las monedas del sistema</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Código *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="USD" maxLength={5} /></div>
              <div><Label>Símbolo</Label><Input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} placeholder="$" maxLength={3} /></div>
            </div>
            <div><Label>Nombre *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dólar Americano" /></div>
            <div><Label>Tasa de Cambio</Label><Input type="number" value={form.exchange_rate} onChange={(e) => setForm({ ...form, exchange_rate: e.target.value })} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="base-currency" checked={form.is_base} onChange={(e) => setForm({ ...form, is_base: e.target.checked })} className="h-4 w-4 rounded border-input" />
              <Label htmlFor="base-currency" className="text-xs cursor-pointer">Moneda base</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} className="gradient-brand text-primary-foreground">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
