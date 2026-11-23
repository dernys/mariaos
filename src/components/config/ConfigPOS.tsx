import { tr as trPT } from "@/i18n/tr";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePOSSettings } from "@/hooks/usePOSSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

export function ConfigPOS() {
  const { settings, save, loading } = usePOSSettings();
  const tenantId = useTenant();
  const { toast } = useToast();
  const [taxes, setTaxes] = useState<{ id: string; name: string; rate: number }[]>([]);
  const [currencies, setCurrencies] = useState<{ code: string; name: string }[]>([]);
  const [local, setLocal] = useState(settings);

  useEffect(() => { setLocal(settings); }, [settings]);

  useEffect(() => {
    if (!tenantId) return;
    supabase.from("tax_rates").select("id,name,rate").eq("tenant_id", tenantId).eq("is_active", true).then(({ data }) => setTaxes((data as any) || []));
    supabase.from("currencies").select("code,name").eq("tenant_id", tenantId).eq("is_active", true).then(({ data }) => setCurrencies((data as any) || []));
  }, [tenantId]);

  const handleSave = async () => {
    try { await save(local); toast({ title: trPT("Ajustes guardados") }); }
    catch (e: any) { toast({ title: "Error", description: trPT("No se pudo guardar") + ": " + (e?.message ?? ""), variant: "destructive" }); }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Cargando...</p>;

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardContent className="p-4 space-y-4">
          <h3 className="text-sm font-heading font-semibold">{trPT("Impuestos y precios")}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{trPT("Impuesto por defecto")}</Label>
              <Select value={local.default_tax_rate_id || "none"} onValueChange={(v) => setLocal({ ...local, default_tax_rate_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{trPT("Sin impuesto")}</SelectItem>
                  {taxes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.rate}%)</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={local.tax_included} onCheckedChange={(v) => setLocal({ ...local, tax_included: v })} />
              <Label className="text-xs">{trPT("Impuesto incluido en precio")}</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <h3 className="text-sm font-heading font-semibold">Propinas</h3>
          <div className="flex items-center gap-2">
            <Switch checked={local.tip_enabled} onCheckedChange={(v) => setLocal({ ...local, tip_enabled: v })} />
            <Label className="text-xs">{trPT("Habilitar propinas en POS")}</Label>
          </div>
          {local.tip_enabled && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{trPT("% sugeridos (separados por coma)")}</Label>
                <Input value={local.tip_percentages.join(",")} onChange={(e) => setLocal({ ...local, tip_percentages: e.target.value.split(",").map((x) => parseFloat(x.trim()) || 0).filter(Boolean) })} />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <Switch checked={local.tip_required} onCheckedChange={(v) => setLocal({ ...local, tip_required: v })} />
                <Label className="text-xs">{trPT("Propina obligatoria")}</Label>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <h3 className="text-sm font-heading font-semibold">{trPT("Operación")}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Redondeo</Label>
              <Select value={local.rounding_mode} onValueChange={(v: any) => setLocal({ ...local, rounding_mode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ninguno</SelectItem>
                  <SelectItem value="nearest">{trPT("Más cercano")}</SelectItem>
                  <SelectItem value="up">{trPT("Hacia arriba")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{trPT("Descuento máx (%)")}</Label>
              <Input type="number" value={local.max_discount_pct} onChange={(e) => setLocal({ ...local, max_discount_pct: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2"><Switch checked={local.allow_discounts} onCheckedChange={(v) => setLocal({ ...local, allow_discounts: v })} /><Label className="text-xs">{trPT("Permitir descuentos")}</Label></div>
            <div className="flex items-center gap-2"><Switch checked={local.allow_negative_stock} onCheckedChange={(v) => setLocal({ ...local, allow_negative_stock: v })} /><Label className="text-xs">{trPT("Permitir stock negativo")}</Label></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <h3 className="text-sm font-heading font-semibold">{trPT("Impresión de ticket")}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={local.auto_print_receipt} onCheckedChange={(v) => setLocal({ ...local, auto_print_receipt: v })} />
              <Label className="text-xs">{trPT("Imprimir ticket automáticamente al cerrar venta")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={local.silent_print} onCheckedChange={(v) => setLocal({ ...local, silent_print: v })} disabled={!local.auto_print_receipt} />
              <Label className="text-xs">{trPT("Impresión silenciosa (sin ventana)")}</Label>
            </div>
            <div>
              <Label className="text-xs">{trPT("Ancho del papel")}</Label>
              <Select value={String(local.receipt_width)} onValueChange={(v) => setLocal({ ...local, receipt_width: (Number(v) === 58 ? 58 : 80) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="58">{trPT("58 mm")}</SelectItem>
                  <SelectItem value="80">{trPT("80 mm")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{trPT("Mensaje de pie de ticket")}</Label>
              <Input value={local.receipt_footer} onChange={(e) => setLocal({ ...local, receipt_footer: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <h3 className="text-sm font-heading font-semibold">{trPT("Monedas y crédito")}</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">{trPT("Moneda base")}</Label>
              <Select value={local.default_currency} onValueChange={(v) => setLocal({ ...local, default_currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{currencies.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{trPT("Moneda secundaria")}</Label>
              <Select value={local.secondary_currency || "none"} onValueChange={(v) => setLocal({ ...local, secondary_currency: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ninguna</SelectItem>
                  {currencies.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{trPT("Días de crédito")}</Label>
              <Input type="number" value={local.default_credit_days} onChange={(e) => setLocal({ ...local, default_credit_days: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} className="gap-2 gradient-brand text-primary-foreground">
        <Save className="h-3.5 w-3.5" /> {trPT("Guardar ajustes POS")}
      </Button>
    </div>
  );
}
