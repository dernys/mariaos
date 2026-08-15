import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";

export interface EditableOrder {
  id: string;
  customer_name: string;
  customer_phone: string;
  delivery_type: string;
  delivery_address: string | null;
  delivery_instructions: string | null;
  delivery_fee: number;
  notes: string | null;
}

interface Props {
  order: EditableOrder | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function OrderEditDialog({ order, onOpenChange, onSaved }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", type: "delivery", address: "", instructions: "", fee: "0", notes: "" });

  useEffect(() => {
    if (!order) return;
    setForm({
      name: order.customer_name ?? "",
      phone: order.customer_phone ?? "",
      type: order.delivery_type ?? "delivery",
      address: order.delivery_address ?? "",
      instructions: order.delivery_instructions ?? "",
      fee: String(order.delivery_fee ?? 0),
      notes: order.notes ?? "",
    });
  }, [order]);

  const save = async () => {
    if (!order) return;
    if (form.type === "delivery" && !form.address.trim()) {
      return toast({ title: "Falta la dirección", description: "Un pedido de delivery necesita dirección de entrega.", variant: "destructive" });
    }
    setSaving(true);
    const { error } = await (supabase.rpc as any)("update_online_order", {
      p_order_id: order.id,
      p_customer_name: form.name.trim() || null,
      p_customer_phone: form.phone.trim() || null,
      p_delivery_address: form.type === "delivery" ? form.address.trim() : null,
      p_delivery_instructions: form.instructions.trim() || null,
      p_notes: form.notes.trim() || null,
      p_delivery_fee: parseFloat(form.fee || "0") || 0,
      p_delivery_type: form.type,
    });
    setSaving(false);
    if (error) return toast({ title: "No se pudo editar el pedido", description: error.message, variant: "destructive" });
    toast({ title: "Pedido actualizado", description: "Los cambios quedaron registrados en el historial." });
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={!!order} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar pedido</DialogTitle>
          <DialogDescription>Cada cambio se registra en el historial del pedido.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Cliente</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label className="text-xs">Teléfono</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Modalidad</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="delivery">Delivery</SelectItem>
                  <SelectItem value="pickup">Recogida</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Coste de envío</Label>
              <Input type="number" step="0.01" value={form.type === "pickup" ? "0" : form.fee} disabled={form.type === "pickup"}
                onChange={(e) => setForm({ ...form, fee: e.target.value })} /></div>
          </div>
          {form.type === "delivery" && (
            <>
              <div><Label className="text-xs">Dirección de entrega</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div><Label className="text-xs">Instrucciones para el repartidor</Label>
                <Textarea rows={2} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></div>
            </>
          )}
          <div><Label className="text-xs">Notas del pedido</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving} className="gap-1 gradient-brand text-primary-foreground">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
