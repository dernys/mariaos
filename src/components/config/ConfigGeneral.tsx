import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Save, Globe, Loader2, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocale } from "@/hooks/useLocale";
import { SUPPORTED_LOCALES, type AppLocale } from "@/i18n";

const SETTINGS_KEYS = [
  { key: "business_name", label: "Nombre del Negocio", category: "general" },
  { key: "business_rfc", label: "RFC / NIT / CNPJ", category: "general" },
  { key: "business_address", label: "Dirección Fiscal", category: "general" },
  { key: "business_phone", label: "Teléfono", category: "general" },
  { key: "business_email", label: "Email", category: "general" },
  { key: "default_tax_rate", label: "Tasa de Impuesto por Defecto (%)", category: "sales" },
  { key: "ticket_footer", label: "Pie de Ticket", category: "sales" },
  { key: "low_stock_threshold", label: "Umbral de Stock Bajo (global)", category: "inventory" },
  { key: "allow_negative_stock", label: "Permitir Stock Negativo (true/false)", category: "inventory" },
];

interface AccountingProfile {
  code: string;
  country_code: string;
  regime: string;
  name: string;
  description: string | null;
  base_currency: string;
  regulatory_exports: any;
}

export function ConfigGeneral() {
  const tenantId = useTenant();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { locale, setUserLocale, setTenantLocale } = useLocale();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [profiles, setProfiles] = useState<AccountingProfile[]>([]);
  const [countryCode, setCountryCode] = useState<string>("CU");
  const [profileCode, setProfileCode] = useState<string>("");
  const [currentProfile, setCurrentProfile] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [tenantLocale, setTenantLocaleState] = useState<AppLocale>("es");

  useEffect(() => {
    if (!tenantId) return;
    supabase.from("system_settings").select("key, value").eq("tenant_id", tenantId).then(({ data }) => {
      if (data) {
        const map: Record<string, string> = {};
        data.forEach((d: any) => { map[d.key] = d.value || ""; });
        setValues(map);
      }
    });
    (supabase as any).from("accounting_profiles").select("*").eq("active", true).then(({ data }: any) => {
      if (data) setProfiles(data);
    });
    (supabase as any).from("tenants").select("country_code, accounting_profile_code, default_locale").eq("id", tenantId).maybeSingle().then(({ data }: any) => {
      if (data) {
        setCountryCode(data.country_code || "CU");
        setProfileCode(data.accounting_profile_code || "");
        setCurrentProfile(data.accounting_profile_code || null);
        if (data.default_locale) setTenantLocaleState(data.default_locale as AppLocale);
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

  const handleApplyProfile = async () => {
    if (!tenantId || !profileCode) return;
    setApplying(true);
    try {
      await (supabase as any).from("tenants").update({ country_code: countryCode }).eq("id", tenantId);
      const { error } = await (supabase as any).rpc("apply_accounting_profile", {
        p_tenant_id: tenantId,
        p_profile_code: profileCode,
      });
      if (error) throw error;
      setCurrentProfile(profileCode);
      toast({ title: "Perfil contable aplicado", description: "Plan de cuentas e impuestos sincronizados" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  const grouped = {
    general: SETTINGS_KEYS.filter((s) => s.category === "general"),
    sales: SETTINGS_KEYS.filter((s) => s.category === "sales"),
    inventory: SETTINGS_KEYS.filter((s) => s.category === "inventory"),
  };

  const countries = Array.from(new Set(profiles.map((p) => p.country_code)));
  const profilesForCountry = profiles.filter((p) => p.country_code === countryCode);
  const selectedProfile = profiles.find((p) => p.code === profileCode);
  const countryLabel = (c: string) => (({ CU: "Cuba", BR: "Brasil", XX: "Genérico / Internacional" } as any)[c] || c);

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" /> Configuración Regional y Contable
          </CardTitle>
          <CardDescription>
            País, régimen tributario y plan de cuentas. Al aplicar el perfil se materializa el plan de cuentas y los impuestos correspondientes.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">País</Label>
              <Select value={countryCode} onValueChange={(v) => { setCountryCode(v); setProfileCode(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecciona país" /></SelectTrigger>
                <SelectContent>
                  {countries.map((c) => (
                    <SelectItem key={c} value={c}>{countryLabel(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Régimen / Perfil Contable</Label>
              <Select value={profileCode} onValueChange={setProfileCode}>
                <SelectTrigger><SelectValue placeholder="Selecciona régimen" /></SelectTrigger>
                <SelectContent>
                  {profilesForCountry.map((p) => (
                    <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedProfile && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">Moneda base: {selectedProfile.base_currency}</Badge>
                <Badge variant="outline">{selectedProfile.regime}</Badge>
                {currentProfile === selectedProfile.code && (
                  <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Activo</Badge>
                )}
              </div>
              {selectedProfile.description && (
                <p className="text-muted-foreground">{selectedProfile.description}</p>
              )}
              {Array.isArray(selectedProfile.regulatory_exports) && selectedProfile.regulatory_exports.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  <span className="text-muted-foreground">Exportaciones regulatorias:</span>
                  {selectedProfile.regulatory_exports.map((e: string) => (
                    <Badge key={e} variant="outline" className="text-[10px]">{e}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          <Button onClick={handleApplyProfile} disabled={!profileCode || applying} variant="secondary" className="gap-2 w-fit">
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
            {currentProfile === profileCode ? "Re-aplicar perfil" : "Aplicar perfil contable"}
          </Button>
        </CardContent>
      </Card>

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
