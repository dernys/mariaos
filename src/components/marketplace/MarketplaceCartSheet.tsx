import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ShoppingCart, Plus, Minus, Trash2, ArrowLeft, ChevronRight,
  Truck, Building2, Check, User as UserIcon, MapPinned, AlertTriangle, Ticket, Loader2,
} from "lucide-react";
import { bizIcon, formatPrice } from "./types";
import type { CartItem, Tenant } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cart: CartItem[];
  tenantsMap: Record<string, Tenant>;
  onUpdateQty: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onOrderSuccess: () => void;
}

type Step = "cart" | "info" | "delivery" | "review";

interface SavedAddress {
  id: string;
  label: string;
  address: string;
  instructions: string | null;
  is_default: boolean;
  latitude: number | null;
  longitude: number | null;
}

interface Zone {
  id: string;
  tenant_id: string;
  name: string;
  fee: number;
  estimated_minutes: number | null;
}

interface QuoteTenant {
  tenant_id: string;
  subtotal: number;
  discount: number;
  tax: number;
  delivery_fee: number;
  total: number;
  issues: { product_id?: string; reason: string; available?: number; coupon?: string }[];
}

export const MarketplaceCartSheet = ({
  open,
  onOpenChange,
  cart,
  tenantsMap,
  onUpdateQty,
  onRemove,
  onClear,
  onOrderSuccess,
}: Props) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("cart");
  const [submitting, setSubmitting] = useState(false);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [addressId, setAddressId] = useState<string>("new");
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneByTenant, setZoneByTenant] = useState<Record<string, string>>({});
  const [couponByTenant, setCouponByTenant] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<QuoteTenant[] | null>(null);
  const [quoting, setQuoting] = useState(false);
  const idempotencyKey = useRef<string>(crypto.randomUUID());
  const [form, setForm] = useState({
    name: user?.user_metadata?.full_name ?? "",
    phone: user?.user_metadata?.phone ?? "",
    email: user?.email ?? "",
    delivery_type: "pickup" as "pickup" | "delivery",
    address: "",
    instructions: "",
    notes: "",
  });

  const cartByTenant = useMemo(() => {
    const groups: Record<string, CartItem[]> = {};
    cart.forEach((i) => {
      if (!groups[i.tenant_id]) groups[i.tenant_id] = [];
      groups[i.tenant_id].push(i);
    });
    return groups;
  }, [cart]);

  const tenantIds = useMemo(() => Object.keys(cartByTenant), [cartByTenant]);
  const cartSubtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const rpcItems = useMemo(
    () => cart.map((i) => ({ tenant_id: i.tenant_id, product_id: i.id, qty: i.qty })),
    [cart]
  );

  // Direcciones guardadas del comprador
  useEffect(() => {
    if (!user || !open) return;
    (async () => {
      const { data } = await supabase
        .from("customer_addresses" as any)
        .select("id,label,address,instructions,is_default,latitude,longitude")
        .order("is_default", { ascending: false });
      const list = ((data as any) || []) as SavedAddress[];
      setAddresses(list);
      const def = list.find((a) => a.is_default) ?? list[0];
      if (def) {
        setAddressId(def.id);
        setForm((f) => ({ ...f, address: def.address, instructions: def.instructions ?? "" }));
      }
    })();
  }, [user, open]);

  // Zonas de reparto de los negocios del carrito
  useEffect(() => {
    if (!user || !open || tenantIds.length === 0) return;
    (async () => {
      const { data } = await supabase.rpc("marketplace_delivery_zones" as any, { p_tenant_ids: tenantIds });
      setZones(((data as any) || []) as Zone[]);
    })();
  }, [user, open, tenantIds.join(",")]);

  const loadQuote = useCallback(async () => {
    if (!user || rpcItems.length === 0) return;
    setQuoting(true);
    const { data, error } = await supabase.rpc("marketplace_quote" as any, {
      p_items: rpcItems,
      p_delivery_type: form.delivery_type,
      p_zone_ids: zoneByTenant,
      p_coupon_codes: couponByTenant,
    });
    setQuoting(false);
    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      return;
    }
    setQuote((((data as any)?.tenants ?? []) as QuoteTenant[]));
  }, [user, rpcItems, form.delivery_type, zoneByTenant, couponByTenant, toast, t]);

  useEffect(() => {
    if (step === "review") loadQuote();
  }, [step, loadQuote]);

  const quoteTotal = useMemo(
    () => (quote ?? []).reduce((s, q) => s + Number(q.total || 0), 0),
    [quote]
  );
  const blockingIssues = useMemo(
    () => (quote ?? []).flatMap((q) => q.issues ?? []),
    [quote]
  );

  const proceed = () => {
    if (!user) {
      toast({ title: t("marketplace.toasts.loginRequired"), description: t("marketplace.toasts.needAccount") });
      onOpenChange(false);
      navigate("/marketplace/acceso");
      return;
    }
    setStep("info");
  };

  const selectAddress = (id: string) => {
    setAddressId(id);
    if (id === "new") {
      setForm((f) => ({ ...f, address: "", instructions: "" }));
      return;
    }
    const a = addresses.find((x) => x.id === id);
    if (a) setForm((f) => ({ ...f, address: a.address, instructions: a.instructions ?? "" }));
  };

  const submit = async () => {
    if (!user || submitting) return;
    if (!form.name.trim() || !form.phone.trim()) {
      toast({ title: t("common.error"), description: t("marketplace.toasts.nameOrPhone"), variant: "destructive" });
      return;
    }
    if (form.delivery_type === "delivery" && !form.address.trim()) {
      toast({ title: t("common.error"), description: t("marketplace.toasts.addressRequired"), variant: "destructive" });
      return;
    }
    const selected = addresses.find((a) => a.id === addressId);
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("place_order_group" as any, {
        p_idempotency_key: idempotencyKey.current,
        p_items: rpcItems,
        p_customer_name: form.name.trim(),
        p_customer_phone: form.phone.trim(),
        p_customer_email: form.email.trim() || null,
        p_delivery_type: form.delivery_type,
        p_delivery_address: form.delivery_type === "delivery" ? form.address.trim() : null,
        p_delivery_instructions: form.instructions.trim() || null,
        p_notes: form.notes.trim() || null,
        p_zone_ids: form.delivery_type === "delivery" ? zoneByTenant : {},
        p_coupon_codes: couponByTenant,
        p_delivery_lat: form.delivery_type === "delivery" ? selected?.latitude ?? null : null,
        p_delivery_lng: form.delivery_type === "delivery" ? selected?.longitude ?? null : null,
      });
      if (error) throw error;
      const orders = ((data as any)?.orders ?? []) as { order_id: string }[];
      idempotencyKey.current = crypto.randomUUID();
      onClear();
      setQuote(null);
      onOpenChange(false);
      setStep("cart");
      toast({
        title: t("marketplace.confirmOrder"),
        description: orders.length > 1
          ? `${orders.length} ${t("marketplace.ordersCreated", { defaultValue: "pedidos creados" })}`
          : undefined,
      });
      onOrderSuccess();
    } catch (e: any) {
      toast({ title: t("marketplace.toasts.orderError"), description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const steps: Step[] = ["cart", "info", "delivery", "review"];
  const stepIndex = steps.indexOf(step);

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setStep("cart"); }}>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            {t("marketplace.cart")} <span className="text-muted-foreground text-sm">({cartCount})</span>
          </SheetTitle>
          {cart.length > 0 && (
            <div className="flex items-center gap-1.5 pt-2">
              {steps.map((s, i) => (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded-full transition-colors ${i <= stepIndex ? "bg-primary" : "bg-muted"}`}
                />
              ))}
            </div>
          )}
        </SheetHeader>

        {cart.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
            <ShoppingCart className="h-14 w-14 opacity-30 mb-3" />
            <p className="font-medium">{t("marketplace.cartEmpty")}</p>
            <p className="text-xs mt-1">{t("marketplace.cartEmptyHint")}</p>
          </div>
        ) : step === "cart" ? (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {Object.entries(cartByTenant).map(([tid, items]) => (
                <div key={tid} className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {bizIcon(tenantsMap[tid]?.business_type || "")} {tenantsMap[tid]?.name}
                  </p>
                  {items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 bg-muted/40 rounded-xl p-3">
                      <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-xl shrink-0 overflow-hidden">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                        ) : "📦"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-xs text-primary font-semibold">{formatPrice(item.price * item.qty)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => onUpdateQty(item.id, -1)} className="h-7 w-7 rounded-full bg-card border border-border hover:bg-muted flex items-center justify-center">
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-sm font-bold w-6 text-center">{item.qty}</span>
                        <button onClick={() => onUpdateQty(item.id, 1)} className="h-7 w-7 rounded-full bg-card border border-border hover:bg-muted flex items-center justify-center">
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <button onClick={() => onRemove(item.id)} className="text-destructive/70 hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="border-t p-5 space-y-3 bg-card">
              <div className="flex justify-between text-lg font-bold">
                <span>{t("marketplace.subtotal")}</span>
                <span className="text-primary">{formatPrice(cartSubtotal)}</span>
              </div>
              <Button onClick={proceed} className="w-full rounded-full h-11">
                {t("marketplace.continueOrder")} <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
              {!user && (
                <p className="text-[11px] text-center text-muted-foreground">{t("marketplace.loginToFinish")}</p>
              )}
            </div>
          </>
        ) : step === "info" ? (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <button onClick={() => setStep("cart")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> {t("marketplace.backToCart")}
              </button>
              <div className="flex items-center gap-2 text-sm font-medium">
                <UserIcon className="h-4 w-4 text-primary" /> {t("marketplace.step.info")}
              </div>
              <div className="space-y-3">
                <div><Label>{t("marketplace.name")} *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("marketplace.fullNamePh")} /></div>
                <div><Label>{t("marketplace.phone")} *</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder={t("marketplace.phonePh")} /></div>
                <div><Label>{t("marketplace.email")}</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={t("marketplace.emailPh")} /></div>
              </div>
            </div>
            <div className="border-t p-5 bg-card">
              <Button onClick={() => setStep("delivery")} className="w-full rounded-full h-11" disabled={!form.name.trim() || !form.phone.trim()}>
                {t("common.next")} <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </>
        ) : step === "delivery" ? (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <button onClick={() => setStep("info")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> {t("common.back")}
              </button>
              <div className="flex items-center gap-2 text-sm font-medium">
                <MapPinned className="h-4 w-4 text-primary" /> {t("marketplace.step.delivery")}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setForm({ ...form, delivery_type: "pickup" })}
                  className={`p-4 rounded-xl border-2 text-center text-sm transition-all ${form.delivery_type === "pickup" ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <Building2 className="h-5 w-5 mx-auto mb-1" />
                  <p className="font-medium">{t("marketplace.pickup")}</p>
                  <p className="text-[10px] text-muted-foreground">{t("marketplace.pickupHint")}</p>
                </button>
                <button
                  onClick={() => setForm({ ...form, delivery_type: "delivery" })}
                  className={`p-4 rounded-xl border-2 text-center text-sm transition-all ${form.delivery_type === "delivery" ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <Truck className="h-5 w-5 mx-auto mb-1" />
                  <p className="font-medium">{t("marketplace.delivery")}</p>
                  <p className="text-[10px] text-muted-foreground">{t("marketplace.deliveryHint")}</p>
                </button>
              </div>

              {form.delivery_type === "delivery" && (
                <>
                  {addresses.length > 0 && (
                    <div>
                      <Label>{t("marketplace.savedAddress", { defaultValue: "Dirección guardada" })}</Label>
                      <Select value={addressId} onValueChange={selectAddress}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {addresses.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.label} — {a.address.slice(0, 40)}
                            </SelectItem>
                          ))}
                          <SelectItem value="new">
                            {t("marketplace.otherAddress", { defaultValue: "Otra dirección" })}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label>{t("marketplace.deliveryAddress")} *</Label>
                    <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder={t("marketplace.deliveryAddressPh")} />
                  </div>
                  <div>
                    <Label>{t("marketplace.deliveryInstructions", { defaultValue: "Indicaciones para el repartidor" })}</Label>
                    <Input value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
                  </div>

                  {tenantIds.map((tid) => {
                    const tz = zones.filter((z) => z.tenant_id === tid);
                    if (tz.length === 0) return null;
                    return (
                      <div key={tid}>
                        <Label className="text-xs">
                          {t("marketplace.zone", { defaultValue: "Zona de reparto" })} · {tenantsMap[tid]?.name}
                        </Label>
                        <Select
                          value={zoneByTenant[tid] ?? ""}
                          onValueChange={(v) => setZoneByTenant((p) => ({ ...p, [tid]: v }))}
                        >
                          <SelectTrigger><SelectValue placeholder={t("marketplace.selectZone", { defaultValue: "Selecciona zona" })} /></SelectTrigger>
                          <SelectContent>
                            {tz.map((z) => (
                              <SelectItem key={z.id} value={z.id}>
                                {z.name} — {formatPrice(Number(z.fee))}
                                {z.estimated_minutes ? ` · ${z.estimated_minutes} min` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </>
              )}

              {tenantIds.map((tid) => (
                <div key={`c-${tid}`}>
                  <Label className="text-xs flex items-center gap-1">
                    <Ticket className="h-3 w-3" /> {t("marketplace.coupon", { defaultValue: "Cupón" })} · {tenantsMap[tid]?.name}
                  </Label>
                  <Input
                    value={couponByTenant[tid] ?? ""}
                    onChange={(e) => setCouponByTenant((p) => ({ ...p, [tid]: e.target.value.toUpperCase() }))}
                    placeholder={t("marketplace.couponPh", { defaultValue: "Código opcional" })}
                  />
                </div>
              ))}

              <div>
                <Label>{t("marketplace.notes")}</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={t("marketplace.notesPh")} />
              </div>
            </div>
            <div className="border-t p-5 bg-card">
              <Button onClick={() => setStep("review")} className="w-full rounded-full h-11" disabled={form.delivery_type === "delivery" && !form.address.trim()}>
                {t("common.next")} <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <button onClick={() => setStep("delivery")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> {t("common.back")}
              </button>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Check className="h-4 w-4 text-primary" /> {t("marketplace.step.review")}
              </div>
              <div className="space-y-3 text-sm">
                <div className="bg-muted/40 rounded-xl p-3 space-y-1">
                  <p className="font-medium">{form.name}</p>
                  <p className="text-xs text-muted-foreground">{form.phone}</p>
                  {form.email && <p className="text-xs text-muted-foreground">{form.email}</p>}
                </div>
                <div className="bg-muted/40 rounded-xl p-3 space-y-1">
                  <p className="font-medium flex items-center gap-1.5">
                    {form.delivery_type === "delivery" ? <Truck className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                    {t(`marketplace.${form.delivery_type}`)}
                  </p>
                  {form.delivery_type === "delivery" && <p className="text-xs text-muted-foreground">{form.address}</p>}
                </div>

                {blockingIssues.length > 0 && (
                  <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 space-y-1">
                    <p className="text-xs font-semibold flex items-center gap-1.5 text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {t("marketplace.reviewIssues", { defaultValue: "Revisa tu pedido" })}
                    </p>
                    {blockingIssues.map((iss, idx) => (
                      <p key={idx} className="text-[11px] text-muted-foreground">
                        {iss.reason === "stock"
                          ? `${cart.find((c) => c.id === iss.product_id)?.name ?? ""}: solo quedan ${iss.available}`
                          : iss.reason === "coupon_invalid"
                            ? `Cupón ${iss.coupon} no válido`
                            : `${cart.find((c) => c.id === iss.product_id)?.name ?? ""}: no disponible`}
                      </p>
                    ))}
                  </div>
                )}

                {Object.entries(cartByTenant).map(([tid, items]) => {
                  const q = (quote ?? []).find((x) => x.tenant_id === tid);
                  return (
                    <div key={tid} className="bg-muted/40 rounded-xl p-3">
                      <p className="font-medium mb-1">{bizIcon(tenantsMap[tid]?.business_type || "")} {tenantsMap[tid]?.name}</p>
                      {items.map((i) => (
                        <div key={i.id} className="flex justify-between text-xs">
                          <span className="truncate">{i.qty}× {i.name}</span>
                          <span>{formatPrice(i.price * i.qty)}</span>
                        </div>
                      ))}
                      <Separator className="my-2" />
                      {q ? (
                        <div className="space-y-0.5 text-xs">
                          <div className="flex justify-between"><span>{t("marketplace.subtotal")}</span><span>{formatPrice(Number(q.subtotal))}</span></div>
                          {Number(q.discount) > 0 && (
                            <div className="flex justify-between text-success"><span>{t("marketplace.discount", { defaultValue: "Descuento" })}</span><span>-{formatPrice(Number(q.discount))}</span></div>
                          )}
                          {Number(q.tax) > 0 && (
                            <div className="flex justify-between"><span>{t("marketplace.tax", { defaultValue: "Impuestos" })}</span><span>{formatPrice(Number(q.tax))}</span></div>
                          )}
                          {Number(q.delivery_fee) > 0 && (
                            <div className="flex justify-between"><span>{t("marketplace.deliveryFee", { defaultValue: "Envío" })}</span><span>{formatPrice(Number(q.delivery_fee))}</span></div>
                          )}
                          <div className="flex justify-between font-semibold pt-1"><span>{t("marketplace.total")}</span><span>{formatPrice(Number(q.total))}</span></div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> {t("marketplace.processing")}</p>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between font-bold text-lg pt-2">
                <span>{t("marketplace.total")}</span>
                <span className="text-primary">{formatPrice(quote ? quoteTotal : cartSubtotal)}</span>
              </div>
              <p className="text-[11px] text-muted-foreground text-center">
                {t("marketplace.paymentOnDelivery", { defaultValue: "Pago contra entrega o en la tienda. No se cobra en línea." })}
              </p>
            </div>
            <div className="border-t p-5 bg-card">
              <Button onClick={submit} disabled={submitting || quoting || !quote} className="w-full rounded-full h-11">
                {submitting ? t("marketplace.processing") : t("marketplace.confirmOrder")}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
