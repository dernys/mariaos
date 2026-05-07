import { useState, useEffect } from "react";
import { useModuleSettings } from "@/hooks/useModuleSettings";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

interface InventorySettings { low_stock_threshold: number; cost_method: "fifo" | "average" }
interface PurchaseSettings { require_approval: boolean; default_payment_days: number }
interface InvoicingSettings { default_series: string; default_prefix: string; default_tax_rate: number }
interface ShiftSettings { require_opening_count: boolean; require_difference_reason: boolean }

export function ConfigModules() {
  const { toast } = useToast();
  const inv = useModuleSettings<InventorySettings>("inventory", { low_stock_threshold: 10, cost_method: "average" });
  const pur = useModuleSettings<PurchaseSettings>("purchases", { require_approval: false, default_payment_days: 30 });
  const invc = useModuleSettings<InvoicingSettings>("invoicing", { default_series: "A", default_prefix: "F", default_tax_rate: 0 });
  const sh = useModuleSettings<ShiftSettings>("shifts", { require_opening_count: true, require_difference_reason: true });

  const [i, setI] = useState(inv.settings); const [p, setP] = useState(pur.settings);
  const [iv, setIv] = useState(invc.settings); const [s, setS] = useState(sh.settings);

  useEffect(() => setI(inv.settings), [inv.settings]);
  useEffect(() => setP(pur.settings), [pur.settings]);
  useEffect(() => setIv(invc.settings), [invc.settings]);
  useEffect(() => setS(sh.settings), [sh.settings]);

  const saveAll = async () => {
    await Promise.all([inv.save(i), pur.save(p), invc.save(iv), sh.save(s)]);
    toast({ title: "Ajustes guardados" });
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <Card><CardContent className="p-4 space-y-3">
        <h3 className="text-sm font-heading font-semibold">Inventario</h3>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Umbral global stock bajo</Label><Input type="number" value={i.low_stock_threshold} onChange={(e) => setI({ ...i, low_stock_threshold: parseInt(e.target.value) || 0 })} /></div>
          <div><Label className="text-xs">Método costeo</Label>
            <select className="w-full h-9 rounded-md border bg-background px-2 text-sm" value={i.cost_method} onChange={(e) => setI({ ...i, cost_method: e.target.value as any })}>
              <option value="average">Promedio</option><option value="fifo">FIFO</option>
            </select>
          </div>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-4 space-y-3">
        <h3 className="text-sm font-heading font-semibold">Compras</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2"><Switch checked={p.require_approval} onCheckedChange={(v) => setP({ ...p, require_approval: v })} /><Label className="text-xs">Requerir aprobación</Label></div>
          <div><Label className="text-xs">Días pago proveedor</Label><Input type="number" value={p.default_payment_days} onChange={(e) => setP({ ...p, default_payment_days: parseInt(e.target.value) || 0 })} /></div>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-4 space-y-3">
        <h3 className="text-sm font-heading font-semibold">Facturación</h3>
        <div className="grid grid-cols-3 gap-3">
          <div><Label className="text-xs">Serie</Label><Input value={iv.default_series} onChange={(e) => setIv({ ...iv, default_series: e.target.value })} /></div>
          <div><Label className="text-xs">Prefijo</Label><Input value={iv.default_prefix} onChange={(e) => setIv({ ...iv, default_prefix: e.target.value })} /></div>
          <div><Label className="text-xs">IVA por defecto (%)</Label><Input type="number" value={iv.default_tax_rate} onChange={(e) => setIv({ ...iv, default_tax_rate: parseFloat(e.target.value) || 0 })} /></div>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-4 space-y-3">
        <h3 className="text-sm font-heading font-semibold">Turnos</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2"><Switch checked={s.require_opening_count} onCheckedChange={(v) => setS({ ...s, require_opening_count: v })} /><Label className="text-xs">Requerir conteo apertura</Label></div>
          <div className="flex items-center gap-2"><Switch checked={s.require_difference_reason} onCheckedChange={(v) => setS({ ...s, require_difference_reason: v })} /><Label className="text-xs">Motivo en diferencias</Label></div>
        </div>
      </CardContent></Card>

      <Button onClick={saveAll} className="gap-2 gradient-brand text-primary-foreground"><Save className="h-3.5 w-3.5" /> Guardar ajustes</Button>
    </div>
  );
}
