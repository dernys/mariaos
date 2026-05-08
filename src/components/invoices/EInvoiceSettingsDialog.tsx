import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { toast } from "sonner";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; }

const DEFAULT = {
  mode: "local",
  provider: "generic_ubl",
  tax_regime: "",
  legal_name: "",
  legal_tax_id: "",
  webhook_url: "",
  webhook_secret: "",
  certificate_url: "",
  signature_key: "",
  auto_transmit: false,
  test_mode: true,
};

export function EInvoiceSettingsDialog({ open, onOpenChange }: Props) {
  const { tenantId } = useTenantContext();
  const [s, setS] = useState<any>(DEFAULT);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !tenantId) return;
    (async () => {
      const { data } = await supabase.from("einvoice_settings" as any).select("*").eq("tenant_id", tenantId).maybeSingle();
      if (data) setS({ ...DEFAULT, ...data });
      else setS(DEFAULT);
    })();
  }, [open, tenantId]);

  const save = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { error } = await supabase.from("einvoice_settings" as any).upsert({ tenant_id: tenantId, ...s }, { onConflict: "tenant_id" });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Configuración guardada");
    onOpenChange(false);
  };

  const set = (k: string, v: any) => setS({ ...s, [k]: v });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Facturación electrónica</DialogTitle>
          <DialogDescription>Configura el modo de emisión y el proveedor para enviar facturas a la autoridad fiscal o a tu sistema externo.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Modo</Label>
            <Select value={s.mode} onValueChange={(v) => set("mode", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Solo local (PDF)</SelectItem>
                <SelectItem value="electronic">Electrónico (XML + transmisión)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Proveedor</Label>
            <Select value={s.provider} onValueChange={(v) => set("provider", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="generic_ubl">UBL 2.1 genérico</SelectItem>
                <SelectItem value="webhook">Webhook personalizado</SelectItem>
                <SelectItem value="sat_mx">SAT México (próx.)</SelectItem>
                <SelectItem value="dian_co">DIAN Colombia (próx.)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Régimen fiscal</Label>
            <Input value={s.tax_regime || ""} onChange={(e) => set("tax_regime", e.target.value)} placeholder="ej: 601" />
          </div>
          <div>
            <Label className="text-xs">Razón social legal</Label>
            <Input value={s.legal_name || ""} onChange={(e) => set("legal_name", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">ID fiscal (RFC/NIT)</Label>
            <Input value={s.legal_tax_id || ""} onChange={(e) => set("legal_tax_id", e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Switch checked={s.test_mode} onCheckedChange={(v) => set("test_mode", v)} />
            <Label className="text-xs">Modo pruebas</Label>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Webhook de transmisión (URL)</Label>
            <Input value={s.webhook_url || ""} onChange={(e) => set("webhook_url", e.target.value)} placeholder="https://mi-pac.com/recibir" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Webhook secret / token</Label>
            <Input type="password" value={s.webhook_secret || ""} onChange={(e) => set("webhook_secret", e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Clave de firma (uso interno para CUFE)</Label>
            <Input type="password" value={s.signature_key || ""} onChange={(e) => set("signature_key", e.target.value)} />
          </div>
          <div className="flex items-end gap-2 col-span-2">
            <Switch checked={s.auto_transmit} onCheckedChange={(v) => set("auto_transmit", v)} />
            <Label className="text-xs">Transmitir automáticamente al emitir factura</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={loading}>{loading ? "Guardando..." : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
