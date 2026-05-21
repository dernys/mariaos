import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  productId?: string;
  productName?: string;
  onSaved?: () => void;
}

const KINDS: { value: string; label: string }[] = [
  { value: "adjust", label: "Ajuste de inventario" },
  { value: "loss", label: "Pérdida" },
  { value: "breakage", label: "Rotura" },
  { value: "expired", label: "Caducado / vencido" },
  { value: "theft", label: "Hurto" },
];

export function StockAdjustmentDialog({ open, onOpenChange, productId, productName, onSaved }: Props) {
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [locType, setLocType] = useState<"store" | "warehouse">("store");
  const [locId, setLocId] = useState("");
  const [qty, setQty] = useState("");
  const [kind, setKind] = useState("loss");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.from("stores").select("id, name").eq("is_active", true).then(({ data }) => setStores(data || []));
    supabase.from("warehouses").select("id, name").eq("is_active", true).then(({ data }) => setWarehouses((data as any) || []));
    setQty(""); setReason(""); setKind("loss"); setLocId("");
  }, [open]);

  const submit = async () => {
    if (!productId) return toast.error("Producto requerido");
    if (!locId) return toast.error("Selecciona ubicación");
    const n = parseFloat(qty);
    if (!n || n <= 0) return toast.error("Cantidad inválida");
    if (reason.trim().length < 3) return toast.error("Motivo requerido");
    setSaving(true);
    const { error } = await supabase.rpc("register_stock_adjustment" as any, {
      p_product_id: productId,
      p_location_type: locType,
      p_location_id: locId,
      p_quantity: -Math.abs(n), // siempre descuenta
      p_reason: reason.trim(),
      p_kind: kind,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Ajuste de stock registrado");
    onSaved?.();
    onOpenChange(false);
  };

  const opts = locType === "store" ? stores : warehouses;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-warning" /> Merma / Rotura / Ajuste</DialogTitle>
          <DialogDescription>{productName || "Producto"} — descuenta unidades con motivo</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Tipo de ubicación</Label>
              <Select value={locType} onValueChange={(v) => { setLocType(v as any); setLocId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="store">Tienda</SelectItem>
                  <SelectItem value="warehouse">Almacén</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Ubicación</Label>
              <Select value={locId} onValueChange={setLocId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {opts.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Cantidad</Label>
              <Input type="number" min="0" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Motivo del ajuste</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Descripción / motivo</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Detalle de la merma…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving} className="gradient-brand text-primary-foreground">
            Registrar ajuste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
