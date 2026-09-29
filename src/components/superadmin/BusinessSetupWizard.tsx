import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Store,
  Wine,
  ChefHat,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Building2,
  CircleAlert,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { toast } from "sonner";


interface BusinessTemplate {
  code: string;
  business_type: string;
  name: string;
  description: string | null;
  icon: string | null;
  accounting_profile_code: string | null;
  default_country_code: string | null;
  config: Record<string, any>;
}

interface ReadinessCheck {
  key: string;
  label: string;
  pass: boolean;
  detail: string;
}

interface AdminCandidate {
  exists: boolean;
  email: string | null;
  user_id?: string;
  full_name?: string;
  confirmed?: boolean;
  tenant_count?: number;
  tenant_names?: string[];
  is_superadmin?: boolean;
  reusable?: boolean;
}


const ICONS: Record<string, typeof Store> = { Store, Wine, ChefHat };

const STEPS = [
  "Tipo de negocio",
  "Información básica",
  "Cómo opera",
  "Locales y almacenes",
  "Medios de pago",
  "Administrador",
  "Resumen",
];

const slugify = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function BusinessSetupWizard({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [templates, setTemplates] = useState<BusinessTemplate[]>([]);
  const [loadingTpl, setLoadingTpl] = useState(false);
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<{
    tenant_id: string;
    checks: ReadinessCheck[];
    ready: boolean;
    admin_email: string | null;
  } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);
  const [opening, setOpening] = useState(false);
  const { setActiveTenantId, refreshTenants } = useTenantContext();

  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const [templateCode, setTemplateCode] = useState<string>("");
  const [info, setInfo] = useState({ name: "", slug: "", email: "", phone: "", address: "", rfc: "" });
  const [ops, setOps] = useState({
    tables: false,
    tables_count: 8,
    table_capacity: 4,
    kitchen: false,
    delivery: false,
    loyalty: false,
    recipes: false,
  });
  const [warehouses, setWarehouses] = useState<{ name: string; warehouse_type: string }[]>([]);
  const [methods, setMethods] = useState<Record<string, boolean>>({});
  const [posCfg, setPosCfg] = useState({ tax_included: true, allow_negative_stock: false, default_credit_days: 15 });
  const [adminForm, setAdminForm] = useState<{
    enabled: boolean;
    mode: "new" | "existing";
    email: string;
    full_name: string;
    password: string;
  }>({ enabled: true, mode: "new", email: "", full_name: "", password: "" });
  const [adminCheck, setAdminCheck] = useState<AdminCandidate | null>(null);
  const [checkingAdmin, setCheckingAdmin] = useState(false);

  const checkAdminEmail = async () => {
    const email = adminForm.email.trim().toLowerCase();
    if (!/.+@.+\..+/.test(email)) {
      toast.error("Introduce un email válido");
      return;
    }
    setCheckingAdmin(true);
    const { data, error } = await supabase.functions.invoke("provision-business", {
      body: { action: "check_admin", email },
    });
    setCheckingAdmin(false);
    if (error || data?.error) {
      toast.error(data?.error ?? error?.message ?? "No se pudo verificar el email");
      return;
    }
    const c = data.candidate as AdminCandidate;
    setAdminCheck(c);
    if (c.exists && c.reusable) {
      setAdminForm((f) => ({ ...f, mode: "existing", full_name: f.full_name || c.full_name || "" }));
      toast.info("El usuario ya existe: puedes reutilizarlo como administrador");
    } else if (c.exists) {
      setAdminForm((f) => ({ ...f, mode: "new" }));
      toast.error("El usuario existe pero no puede reutilizarse");
    } else {
      setAdminForm((f) => ({ ...f, mode: "new" }));
    }
  };


  const template = useMemo(() => templates.find((t) => t.code === templateCode) ?? null, [templates, templateCode]);

  useEffect(() => {
    if (!open) return;
    setLoadingTpl(true);
    supabase.functions
      .invoke("provision-business", { body: { action: "templates" } })
      .then(({ data, error }) => {
        if (error || data?.error) {
          toast.error(data?.error ?? error?.message ?? "No se pudieron cargar las plantillas");
        } else {
          setTemplates(data?.templates ?? []);
        }
      })
      .finally(() => setLoadingTpl(false));
  }, [open]);

  // Al elegir plantilla, precargamos los valores recomendados
  const pickTemplate = (t: BusinessTemplate) => {
    setTemplateCode(t.code);
    const cfg = t.config ?? {};
    setWarehouses((cfg.warehouses ?? [{ name: "Almacén principal", warehouse_type: "general" }]).map((w: any) => ({
      name: w.name,
      warehouse_type: w.warehouse_type ?? "general",
    })));
    const pm: Record<string, boolean> = {};
    (cfg.payment_methods ?? []).forEach((m: any) => (pm[m.type] = true));
    setMethods(pm);
    setPosCfg({
      tax_included: cfg.pos?.tax_included ?? true,
      allow_negative_stock: cfg.pos?.allow_negative_stock ?? false,
      default_credit_days: cfg.pos?.default_credit_days ?? 15,
    });
    const vertical = t.business_type;
    setOps({
      tables: vertical === "bar" || vertical === "restaurante",
      tables_count: vertical === "restaurante" ? 12 : 8,
      table_capacity: 4,
      kitchen: vertical === "restaurante" || vertical === "bar",
      delivery: vertical === "restaurante",
      loyalty: vertical !== "empresa",
      recipes: vertical !== "empresa",
    });
    setStep(1);
  };

  const isRestaurantLike = template?.business_type === "bar" || template?.business_type === "restaurante";

  const canAdvance = () => {
    if (step === 0) return !!templateCode;
    if (step === 1) return info.name.trim().length >= 2 && slugify(info.slug || info.name).length >= 2;
    if (step === 3) return warehouses.length > 0 && warehouses.every((w) => w.name.trim());
    if (step === 4) return Object.values(methods).some(Boolean);
    if (step === 5) {
      if (!adminForm.enabled) return true;
      if (!/.+@.+\..+/.test(adminForm.email)) return false;
      // Verificación obligatoria del email antes de continuar
      if (!adminCheck || adminCheck.email !== adminForm.email.trim().toLowerCase()) return false;
      if (adminForm.mode === "existing") return !!adminCheck.exists && !!adminCheck.reusable;
      return !adminCheck.exists && adminForm.password.length >= 8;
    }
    return true;
  };

  const reset = () => {
    setStep(0);
    setTemplateCode("");
    setInfo({ name: "", slug: "", email: "", phone: "", address: "", rfc: "" });
    setAdminCheck(null);
    setResult(null);
    setFailure(null);
    // Nueva intención = nueva clave de idempotencia; si no, el backend
    // devolvería el negocio anterior al crear un segundo negocio.
    setIdempotencyKey(crypto.randomUUID());
  };


  const submit = async () => {
    if (!template) return;
    setCreating(true);
    setFailure(null);
    const cfgMethods = (template.config?.payment_methods ?? []).filter((m: any) => methods[m.type]);
    const payload = {
      name: info.name.trim(),
      slug: slugify(info.slug || info.name),
      email: info.email || null,
      phone: info.phone || null,
      address: info.address || null,
      rfc: info.rfc || null,
      business_type: template.business_type,
      country_code: template.default_country_code,
      accounting_profile_code: template.accounting_profile_code,
      operations: ops,
      warehouses,
      payment_methods: cfgMethods,
      pos: posCfg,
      store: { name: info.name.trim(), address: info.address || null, phone: info.phone || null },
    };

    const { data, error } = await supabase.functions.invoke("provision-business", {
      body: {
        action: "create",
        template_code: template.code,
        payload,
        idempotency_key: idempotencyKey,
        admin: adminForm.enabled
          ? {
              mode: adminForm.mode,
              email: adminForm.email.trim(),
              full_name: adminForm.full_name || adminForm.email,
              password: adminForm.mode === "existing" ? null : adminForm.password,
            }
          : null,

      },
    });

    // El cuerpo real del error viaja en la respuesta HTTP (status != 2xx)
    let serverError: string | null = data?.error ?? null;
    if (!serverError && error) {
      try {
        const ctx = (error as any).context;
        const body = ctx && typeof ctx.json === "function" ? await ctx.json() : null;
        serverError = body?.error ?? error.message;
      } catch {
        serverError = error.message;
      }
    }
    setCreating(false);

    if (serverError) {
      setFailure(serverError);
      toast.error(serverError);
      return;
    }

    const validation = data?.validation ?? {};
    const ready = !!validation.ready;
    setResult({
      tenant_id: data.tenant_id,
      ready,
      checks: validation.checks ?? [],
      admin_email: data.admin_email ?? null,
    });
    if (ready) toast.success("Negocio creado correctamente");
    else toast.warning("Negocio creado con avisos");
    onCreated();
    // Make the new business selectable immediately (no page reload needed)
    refreshTenants();

  };

  const openBusiness = async () => {
    if (!result?.tenant_id) return;
    setOpening(true);
    await refreshTenants();
    // Switches the active business context: the new admin is then visible in Roles > Usuarios
    await setActiveTenantId(result.tenant_id);
  };

  const enterAsAdmin = async () => {
    if (!result?.admin_email || !adminForm.password) return;
    setEntering(true);
    // Leave the superadmin session and its cached context behind
    localStorage.removeItem("sa_active_tenant");
    sessionStorage.clear();
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithPassword({
      email: result.admin_email,
      password: adminForm.password,
    });
    setEntering(false);
    if (error) {
      toast.error(`No se pudo iniciar sesión: ${error.message}`);
      return;
    }
    // /app is the authenticated dashboard ("/" is the public landing page)
    window.location.href = "/app";
  };



  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg gradient-brand grid place-items-center">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-heading font-semibold text-sm">Crear nuevo negocio</h2>
              <p className="text-[10px] text-muted-foreground">
                {result ? "Negocio provisionado" : `Paso ${step + 1} de ${STEPS.length} · ${STEPS[step]}`}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { onOpenChange(false); reset(); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Progress */}
        {!result && (
          <div className="flex gap-1 px-5 pt-3">
            {STEPS.map((s, i) => (
              <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-muted"}`} />
            ))}
          </div>
        )}

        {!result && failure && (
          <div className="mx-5 mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
            <p className="text-xs font-medium text-destructive">No se creó el negocio</p>
            <p className="text-[11px] text-destructive/90 break-words">{failure}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Se revirtió todo lo creado. Corrige el dato y vuelve a intentar: no se duplicará nada.
            </p>
          </div>
        )}

        <ScrollArea className="max-h-[62vh]">

          <div className="p-5">
            {result ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl grid place-items-center ${result.ready ? "bg-primary/15 text-primary" : "bg-amber-500/15 text-amber-500"}`}>
                    {result.ready ? <Check className="h-5 w-5" /> : <CircleAlert className="h-5 w-5" />}
                  </div>
                  <div>
                    <p className="font-heading font-semibold text-sm">
                      {result.ready ? "Negocio creado correctamente" : "Negocio creado con avisos"}
                    </p>
                    <p className="text-xs text-muted-foreground">{info.name}</p>
                  </div>
                </div>
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                  {result.admin_email ? (
                    <>
                      <p className="text-xs font-medium">Administrador creado: {result.admin_email}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Rol admin y propietario del negocio, con acceso a Roles y permisos (pestaña Usuarios) dentro de su negocio.
                      </p>
                    </>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Negocio sin administrador inicial: crea sus usuarios desde Roles y permisos.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={openBusiness} disabled={opening}>
                      {opening && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                      Abrir este negocio
                    </Button>
                    {result.admin_email && adminForm.password && (
                      <Button size="sm" onClick={enterAsAdmin} disabled={entering}>
                        {entering && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                        Entrar como administrador
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {result.checks.map((c) => (
                    <div key={c.key} className="flex items-start gap-2 rounded-lg border bg-card p-3">
                      {c.pass ? (
                        <Check className="h-4 w-4 text-primary mt-0.5" />
                      ) : (
                        <CircleAlert className="h-4 w-4 text-amber-500 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-medium">{c.label}</p>
                        <p className="text-[11px] text-muted-foreground">{c.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-4"
                >
                  {/* 0 · Tipo de negocio */}
                  {step === 0 && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      {loadingTpl && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                      {templates.map((t) => {
                        const Icon = ICONS[t.icon ?? "Building2"] ?? Building2;
                        const active = templateCode === t.code;
                        return (
                          <button
                            key={t.code}
                            onClick={() => pickTemplate(t)}
                            className={`text-left rounded-xl border p-4 transition-all hover:border-primary/60 ${active ? "border-primary bg-primary/5" : "bg-card"}`}
                          >
                            <Icon className="h-6 w-6 text-primary mb-2" />
                            <p className="font-heading font-semibold text-sm">{t.name}</p>
                            <p className="text-[11px] text-muted-foreground mt-1">{t.description}</p>
                            <Badge variant="secondary" className="mt-2 text-[10px]">{t.code}</Badge>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* 1 · Información básica */}
                  {step === 1 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <Label className="text-xs">Nombre del negocio *</Label>
                        <Input
                          value={info.name}
                          placeholder="Cafetería La Esquina"
                          onChange={(e) => setInfo({ ...info, name: e.target.value, slug: info.slug || slugify(e.target.value) })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Identificador (URL) *</Label>
                        <Input value={info.slug} placeholder="cafeteria-la-esquina" onChange={(e) => setInfo({ ...info, slug: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">Teléfono</Label>
                        <Input value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">Email</Label>
                        <Input type="email" value={info.email} onChange={(e) => setInfo({ ...info, email: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">Identificación fiscal (NIT/RFC)</Label>
                        <Input value={info.rfc} onChange={(e) => setInfo({ ...info, rfc: e.target.value })} />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs">Dirección</Label>
                        <Input value={info.address} onChange={(e) => setInfo({ ...info, address: e.target.value })} />
                      </div>
                    </div>
                  )}

                  {/* 2 · Cómo opera */}
                  {step === 2 && (
                    <div className="space-y-3">
                      {isRestaurantLike && (
                        <>
                          <ToggleRow
                            label="Servicio en mesas"
                            hint="Habilita mapa de mesas y cuentas abiertas"
                            checked={ops.tables}
                            onChange={(v) => setOps({ ...ops, tables: v })}
                          />
                          {ops.tables && (
                            <div className="grid grid-cols-2 gap-3 pl-1">
                              <div>
                                <Label className="text-xs">Cantidad de mesas</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  max={40}
                                  value={ops.tables_count}
                                  onChange={(e) => setOps({ ...ops, tables_count: Number(e.target.value) })}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Comensales por mesa</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  max={20}
                                  value={ops.table_capacity}
                                  onChange={(e) => setOps({ ...ops, table_capacity: Number(e.target.value) })}
                                />
                              </div>
                            </div>
                          )}
                          <ToggleRow
                            label="Comandas a cocina (KDS)"
                            hint="Pantalla de cocina y control de preparación"
                            checked={ops.kitchen}
                            onChange={(v) => setOps({ ...ops, kitchen: v })}
                          />
                          <ToggleRow
                            label="Recetas y escandallos"
                            hint="Descuento de stock por ingredientes"
                            checked={ops.recipes}
                            onChange={(v) => setOps({ ...ops, recipes: v })}
                          />
                        </>
                      )}
                      <ToggleRow
                        label="Domicilio / delivery"
                        hint="Zonas de reparto y asignación de repartidores"
                        checked={ops.delivery}
                        onChange={(v) => setOps({ ...ops, delivery: v })}
                      />
                      <ToggleRow
                        label="Fidelización de clientes"
                        hint="Acumulación y canje de puntos"
                        checked={ops.loyalty}
                        onChange={(v) => setOps({ ...ops, loyalty: v })}
                      />
                      <div className="grid gap-3 sm:grid-cols-3 pt-2 border-t">
                        <ToggleRow
                          label="Precios con impuesto incluido"
                          checked={posCfg.tax_included}
                          onChange={(v) => setPosCfg({ ...posCfg, tax_included: v })}
                        />
                        <ToggleRow
                          label="Permitir stock negativo"
                          checked={posCfg.allow_negative_stock}
                          onChange={(v) => setPosCfg({ ...posCfg, allow_negative_stock: v })}
                        />
                        <div>
                          <Label className="text-xs">Días de crédito</Label>
                          <Input
                            type="number"
                            min={0}
                            value={posCfg.default_credit_days}
                            onChange={(e) => setPosCfg({ ...posCfg, default_credit_days: Number(e.target.value) })}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 3 · Locales y almacenes */}
                  {step === 3 && (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Se creará el local <strong>{info.name || "principal"}</strong> con los almacenes siguientes,
                        vinculados automáticamente al local.
                      </p>
                      {warehouses.map((w, i) => (
                        <div key={i} className="flex gap-2 items-end">
                          <div className="flex-1">
                            <Label className="text-xs">Almacén {i + 1}</Label>
                            <Input
                              value={w.name}
                              onChange={(e) => {
                                const next = [...warehouses];
                                next[i] = { ...w, name: e.target.value };
                                setWarehouses(next);
                              }}
                            />
                          </div>
                          <div className="w-36">
                            <Label className="text-xs">Tipo</Label>
                            <Input
                              value={w.warehouse_type}
                              onChange={(e) => {
                                const next = [...warehouses];
                                next[i] = { ...w, warehouse_type: e.target.value };
                                setWarehouses(next);
                              }}
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={warehouses.length <= 1}
                            onClick={() => setWarehouses(warehouses.filter((_, idx) => idx !== i))}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => setWarehouses([...warehouses, { name: "", warehouse_type: "general" }])}
                      >
                        Añadir almacén
                      </Button>
                    </div>
                  )}

                  {/* 4 · Medios de pago */}
                  {step === 4 && (
                    <div className="space-y-2">
                      {(template?.config?.payment_methods ?? []).map((m: any) => (
                        <ToggleRow
                          key={m.type}
                          label={m.name}
                          hint={m.type}
                          checked={!!methods[m.type]}
                          onChange={(v) => setMethods({ ...methods, [m.type]: v })}
                        />
                      ))}
                      <p className="text-[11px] text-muted-foreground pt-2">
                        Monedas: {(template?.config?.currencies ?? []).map((c: any) => c.code).join(" · ")}
                      </p>
                    </div>
                  )}

                  {/* 5 · Administrador */}
                  {step === 5 && (
                    <div className="space-y-3">
                      <ToggleRow
                        label="Crear administrador inicial"
                        hint="Recibe rol admin y propiedad del negocio"
                        checked={adminForm.enabled}
                        onChange={(v) => setAdminForm({ ...adminForm, enabled: v })}
                      />
                      {adminForm.enabled && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="sm:col-span-2">
                            <Label className="text-xs">Email *</Label>
                            <div className="flex gap-2">
                              <Input
                                type="email"
                                value={adminForm.email}
                                placeholder="admin@negocio.cu"
                                onChange={(e) => {
                                  setAdminForm({ ...adminForm, email: e.target.value, mode: "new" });
                                  setAdminCheck(null);
                                }}
                              />
                              <Button variant="outline" size="sm" onClick={checkAdminEmail} disabled={checkingAdmin} className="shrink-0 text-xs">
                                {checkingAdmin ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Verificar"}
                              </Button>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              Comprobamos si el usuario ya existe antes de crear el negocio.
                            </p>
                          </div>

                          {adminCheck && adminCheck.email === adminForm.email.trim().toLowerCase() && (
                            <div className="sm:col-span-2 rounded-lg border bg-card p-3 space-y-2">
                              {!adminCheck.exists ? (
                                <p className="text-xs flex items-center gap-1.5">
                                  <Check className="h-3.5 w-3.5 text-primary" />
                                  Email disponible: se creará un usuario nuevo.
                                </p>
                              ) : adminCheck.reusable ? (
                                <>
                                  <p className="text-xs flex items-center gap-1.5 font-medium">
                                    <CircleAlert className="h-3.5 w-3.5 text-amber-500" />
                                    Este usuario ya existe y no pertenece a ningún negocio.
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {adminCheck.full_name || "Sin nombre"} · {adminCheck.confirmed ? "email confirmado" : "email sin confirmar"}
                                  </p>
                                  <div className="flex flex-wrap gap-2 pt-1">
                                    <Button
                                      size="sm"
                                      variant={adminForm.mode === "existing" ? "default" : "outline"}
                                      className="text-xs"
                                      onClick={() => setAdminForm({ ...adminForm, mode: "existing", password: "" })}
                                    >
                                      Usar este usuario existente
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant={adminForm.mode === "new" ? "default" : "outline"}
                                      className="text-xs"
                                      onClick={() => setAdminForm({ ...adminForm, mode: "new" })}
                                    >
                                      Usar otro email
                                    </Button>
                                  </div>
                                </>
                              ) : (
                                <p className="text-xs text-destructive">
                                  {adminCheck.is_superadmin
                                    ? "Es un superadministrador: no puede ser administrador de un negocio."
                                    : `Ya pertenece a otro negocio (${(adminCheck.tenant_names ?? []).join(", ")}). Cambia el email.`}
                                </p>
                              )}
                            </div>
                          )}

                          <div className="sm:col-span-2">
                            <Label className="text-xs">Nombre completo</Label>
                            <Input value={adminForm.full_name} onChange={(e) => setAdminForm({ ...adminForm, full_name: e.target.value })} />
                          </div>

                          {adminForm.mode === "new" && (
                            <div className="sm:col-span-2">
                              <Label className="text-xs">Contraseña temporal * (mín. 8)</Label>
                              <Input type="password" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} />
                            </div>
                          )}
                        </div>
                      )}

                    </div>
                  )}

                  {/* 6 · Resumen */}
                  {step === 6 && template && (
                    <div className="space-y-3 text-xs">
                      <p className="text-[11px] text-muted-foreground">
                        Revisa los datos. Puedes volver a cualquier paso con “Editar” antes de crear el negocio.
                      </p>
                      <SummaryRow k="Plantilla" v={`${template.name} (${template.code})`} onEdit={() => setStep(0)} />
                      <SummaryRow k="Negocio" v={`${info.name} · ${slugify(info.slug || info.name)}`} onEdit={() => setStep(1)} />
                      <SummaryRow k="Perfil contable" v={template.accounting_profile_code ?? "—"} />
                      <SummaryRow k="Almacenes" v={warehouses.map((w) => w.name).join(", ")} onEdit={() => setStep(3)} />
                      <SummaryRow k="Medios de pago" v={Object.keys(methods).filter((k) => methods[k]).join(", ")} onEdit={() => setStep(4)} />
                      <SummaryRow
                        k="Operación"
                        onEdit={() => setStep(2)}
                        v={[
                          ops.tables && `${ops.tables_count} mesas`,
                          ops.kitchen && "cocina",
                          ops.recipes && "recetas",
                          ops.delivery && "delivery",
                          ops.loyalty && "fidelización",
                        ].filter(Boolean).join(" · ") || "básica"}
                      />
                      <SummaryRow
                        k="Administrador"
                        onEdit={() => setStep(5)}
                        v={
                          !adminForm.enabled
                            ? "se asignará después"
                            : `${adminForm.email} · ${adminForm.mode === "existing" ? "usuario existente" : "usuario nuevo"}`
                        }
                      />

                      <p className="text-[11px] text-muted-foreground pt-2 border-t">
                        Al crear, MarIA OS genera el maestro de cuentas propio, año fiscal, períodos y el mapeo contable
                        del negocio. Si algo falla, no se crea nada.
                      </p>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-5 py-3">
          {result ? (
            <Button size="sm" className="ml-auto gradient-brand text-primary-foreground" onClick={() => { onOpenChange(false); reset(); }}>
              Finalizar
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" disabled={step === 0 || creating} onClick={() => setStep(step - 1)} className="gap-1 text-xs">
                <ChevronLeft className="h-3.5 w-3.5" /> Atrás
              </Button>
              {step < STEPS.length - 1 ? (
                <Button size="sm" disabled={!canAdvance()} onClick={() => setStep(step + 1)} className="gap-1 text-xs">
                  Continuar <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button size="sm" disabled={creating} onClick={submit} className="gap-1 text-xs gradient-brand text-primary-foreground">
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Crear negocio
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs font-medium">{label}</p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SummaryRow({ k, v, onEdit }: { k: string; v: string; onEdit?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-1.5">
      <span className="text-muted-foreground">{k}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-medium text-right truncate">{v}</span>
        {onEdit && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={onEdit}>
            Editar
          </Button>
        )}
      </div>
    </div>
  );
}

