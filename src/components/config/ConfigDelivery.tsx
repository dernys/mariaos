import { useEffect, useState } from "react";
import { useModuleSettings } from "@/hooks/useModuleSettings";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

export interface DeliverySettings {
  auto_assign: boolean;
  auto_confirm_orders: boolean;
  default_delivery_fee: number;
  free_delivery_over: number;
  max_active_per_rider: number;
  max_distance_km: number;
  prep_minutes: number;
  eta_minutes_per_km: number;
  commission_percent: number;
  require_rider_photo: boolean;
}

export const DELIVERY_DEFAULTS: DeliverySettings = {
  auto_assign: false,
  auto_confirm_orders: false,
  default_delivery_fee: 0,
  free_delivery_over: 0,
  max_active_per_rider: 3,
  max_distance_km: 15,
  prep_minutes: 20,
  eta_minutes_per_km: 4,
  commission_percent: 10,
  require_rider_photo: false,
};

export function ConfigDelivery() {
  const { toast } = useToast();
  const d = useModuleSettings<DeliverySettings>("delivery", DELIVERY_DEFAULTS);
  const [s, setS] = useState<DeliverySettings>(d.settings);
  useEffect(() => setS(d.settings), [d.settings]);
  const num = (v: string) => parseFloat(v || "0") || 0;

  return (
    <div className="space-y-4 max-w-2xl">
      <Card><CardContent className="p-4 space-y-3">
        <h3 className="text-sm font-heading font-semibold">Pedidos online</h3>
        <div className="flex items-center gap-2">
          <Switch checked={s.auto_confirm_orders} onCheckedChange={(v) => setS({ ...s, auto_confirm_orders: v })} />
          <Label className="text-xs">Confirmar pedidos automáticamente al recibirlos</Label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Coste de envío por defecto</Label><Input type="number" step="0.01" value={s.default_delivery_fee} onChange={(e) => setS({ ...s, default_delivery_fee: num(e.target.value) })} /></div>
          <div><Label className="text-xs">Envío gratis desde (0 = nunca)</Label><Input type="number" step="0.01" value={s.free_delivery_over} onChange={(e) => setS({ ...s, free_delivery_over: num(e.target.value) })} /></div>
          <div><Label className="text-xs">Minutos de preparación</Label><Input type="number" value={s.prep_minutes} onChange={(e) => setS({ ...s, prep_minutes: num(e.target.value) })} /></div>
          <div><Label className="text-xs">Minutos por km (ETA)</Label><Input type="number" value={s.eta_minutes_per_km} onChange={(e) => setS({ ...s, eta_minutes_per_km: num(e.target.value) })} /></div>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-4 space-y-3">
        <h3 className="text-sm font-heading font-semibold">Repartidores</h3>
        <div className="flex items-center gap-2">
          <Switch checked={s.auto_assign} onCheckedChange={(v) => setS({ ...s, auto_assign: v })} />
          <Label className="text-xs">Sugerir y asignar automáticamente el mejor repartidor</Label>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><Label className="text-xs">Entregas activas por repartidor</Label><Input type="number" value={s.max_active_per_rider} onChange={(e) => setS({ ...s, max_active_per_rider: num(e.target.value) })} /></div>
          <div><Label className="text-xs">Distancia máxima (km)</Label><Input type="number" value={s.max_distance_km} onChange={(e) => setS({ ...s, max_distance_km: num(e.target.value) })} /></div>
          <div><Label className="text-xs">Comisión por entrega (%)</Label><Input type="number" step="0.1" value={s.commission_percent} onChange={(e) => setS({ ...s, commission_percent: num(e.target.value) })} /></div>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={s.require_rider_photo} onCheckedChange={(v) => setS({ ...s, require_rider_photo: v })} />
          <Label className="text-xs">Exigir foto de entrega al repartidor</Label>
        </div>
      </CardContent></Card>

      <Button onClick={async () => { await d.save(s); toast({ title: "Ajustes de delivery guardados" }); }} className="gap-2 gradient-brand text-primary-foreground">
        <Save className="h-3.5 w-3.5" /> Guardar ajustes
      </Button>
    </div>
  );
}
