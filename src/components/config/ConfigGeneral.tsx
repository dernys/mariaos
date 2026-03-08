import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Save } from "lucide-react";

const SETTINGS_KEYS = [
  { key: "business_name", label: "Nombre del Negocio", category: "general" },
  { key: "business_rfc", label: "RFC", category: "general" },
  { key: "business_address", label: "Dirección Fiscal", category: "general" },
  { key: "business_phone", label: "Teléfono", category: "general" },
  { key: "business_email", label: "Email", category: "general" },
  { key: "default_tax_rate", label: "Tasa de Impuesto por Defecto (%)", category: "sales" },
  { key: "ticket_footer", label: "Pie de Ticket", category: "sales" },
  { key: "low_stock_threshold", label: "Umbral de Stock Bajo (global)", category: "inventory" },
  { key: "allow_negative_stock", label: "Permitir Stock Negativo (true/false)", category: "inventory" },
];

export function ConfigGeneral() {
  const tenantId = useTenant();
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    supabase.from("system_settings").select("key, value").eq("tenant_id", tenantId).then(({ data }) => {
      if (data) {
        const map: Record<string, string> = {};
        data.forEach((d: any) => { map[d.key] = d.value || ""; });
        setValues(map);
      }
    });
  }, [tenantId]);

  const handleSave = async () => {
    if (!tenantId) return;
    setSaving(true);
    for (const setting of SETTINGS_KEYS) {
      const val = values[setting.key] || "";
      await supabase.from("system_settings").upsert(
        { key: setting.key, value: val, category: setting.category, tenant_id: tenantId },
        { onConflict: "key,tenant_id" }
      );
    }
    toast({ title: "Configuración guardada" });
    setSaving(false);
  };

  const grouped = {
    general: SETTINGS_KEYS.filter((s) => s.category === "general"),
    sales: SETTINGS_KEYS.filter((s) => s.category === "sales"),
    inventory: SETTINGS_KEYS.filter((s) => s.category === "inventory"),
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos de la Empresa</CardTitle>
          <CardDescription>Información general del negocio</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {grouped.general.map((s) => (
            <div key={s.key}>
              <Label className="text-xs">{s.label}</Label>
              <Input value={values[s.key] || ""} onChange={(e) => setValues({ ...values, [s.key]: e.target.value })} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ventas</CardTitle>
          <CardDescription>Configuración de ventas y tickets</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {grouped.sales.map((s) => (
            <div key={s.key}>
              <Label className="text-xs">{s.label}</Label>
              <Input value={values[s.key] || ""} onChange={(e) => setValues({ ...values, [s.key]: e.target.value })} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inventario</CardTitle>
          <CardDescription>Configuración de inventario</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {grouped.inventory.map((s) => (
            <div key={s.key}>
              <Label className="text-xs">{s.label}</Label>
              <Input value={values[s.key] || ""} onChange={(e) => setValues({ ...values, [s.key]: e.target.value })} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="gradient-brand text-primary-foreground gap-2">
        <Save className="h-4 w-4" /> {saving ? "Guardando..." : "Guardar Configuración"}
      </Button>
    </div>
  );
}
