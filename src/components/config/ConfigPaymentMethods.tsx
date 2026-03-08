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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit2, Trash2, CreditCard, Banknote, QrCode } from "lucide-react";

interface PaymentMethod {
  id: string;
  name: string;
  type: string;
  requires_card_info: boolean;
  is_active: boolean;
}

const TYPE_ICONS: Record<string, any> = { cash: Banknote, card: CreditCard, qr: QrCode, transfer: CreditCard };
const TYPE_LABELS: Record<string, string> = { cash: "Efectivo", card: "Tarjeta", qr: "QR", transfer: "Transferencia" };

export function ConfigPaymentMethods() {
  const tenantId = useTenant();
  const { toast } = useToast();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [form, setForm] = useState({ name: "", type: "cash", requires_card_info: false });

  const fetch = async () => {
    const { data } = await supabase.from("payment_methods").select("*").order("name");
    if (data) setMethods(data as PaymentMethod[]);
  };

  useEffect(() => { fetch(); }, []);

  const openNew = () => { setEditing(null); setForm({ name: "", type: "cash", requires_card_info: false }); setDialogOpen(true); };
  const openEdit = (m: PaymentMethod) => { setEditing(m); setForm({ name: m.name, type: m.type, requires_card_info: m.requires_card_info }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Error", description: "Nombre requerido", variant: "destructive" }); return; }
    const payload = { name: form.name.trim(), type: form.type, requires_card_info: form.requires_card_info, tenant_id: tenantId };
    if (editing) {
      await supabase.from("payment_methods").update(payload).eq("id", editing.id);
    } else {
      await supabase.from("payment_methods").insert(payload);
    }
    toast({ title: editing ? "Método actualizado" : "Método creado" });
    setDialogOpen(false);
    fetch();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("payment_methods").delete().eq("id", id);
    toast({ title: "Método eliminado" });
    fetch();
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{methods.length} métodos de pago</p>
        <Button size="sm" onClick={openNew} className="gap-1 text-xs gradient-brand text-primary-foreground">
          <Plus className="h-3.5 w-3.5" /> Nuevo Método
        </Button>
      </div>

      <div className="grid gap-2">
        {methods.map((m) => {
          const Icon = TYPE_ICONS[m.type] || CreditCard;
          return (
            <Card key={m.id} className="p-0">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-[10px] text-muted-foreground">{TYPE_LABELS[m.type] || m.type}{m.requires_card_info ? " · Requiere datos de tarjeta" : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={m.is_active ? "default" : "secondary"} className="text-[10px]">{m.is_active ? "Activo" : "Inactivo"}</Badge>
                  <button onClick={() => openEdit(m)} className="p-1.5 rounded hover:bg-muted transition-colors"><Edit2 className="h-3.5 w-3.5" /></button>
                  <button onClick={() => handleDelete(m.id)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {methods.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No hay métodos de pago</p>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar" : "Nuevo"} Método de Pago</DialogTitle>
            <DialogDescription>Configura los métodos de pago aceptados</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div><Label>Nombre *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Efectivo CUP" /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Efectivo</SelectItem>
                  <SelectItem value="card">Tarjeta</SelectItem>
                  <SelectItem value="qr">QR</SelectItem>
                  <SelectItem value="transfer">Transferencia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="requires-card" checked={form.requires_card_info} onChange={(e) => setForm({ ...form, requires_card_info: e.target.checked })} className="h-4 w-4 rounded border-input" />
              <Label htmlFor="requires-card" className="text-xs cursor-pointer">Requiere datos de tarjeta</Label>
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
