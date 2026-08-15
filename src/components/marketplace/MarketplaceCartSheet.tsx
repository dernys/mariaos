import { useMemo, useState } from "react";
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
import {
  ShoppingCart, Plus, Minus, Trash2, ArrowLeft, ChevronRight,
  Truck, Building2, Check, User as UserIcon, MapPinned,
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
  const [form, setForm] = useState({
    name: user?.user_metadata?.full_name ?? "",
    phone: user?.user_metadata?.phone ?? "",
    email: user?.email ?? "",
    delivery_type: "pickup" as "pickup" | "delivery",
    address: "",
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

  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const proceed = () => {
    if (!user) {
      toast({ title: t("marketplace.toasts.loginRequired"), description: t("marketplace.toasts.needAccount") });
      onOpenChange(false);
      navigate("/marketplace/acceso");
      return;
    }
    setStep("info");
  };

  const submit = async () => {
    if (!user) return;
    if (!form.name.trim() || !form.phone.trim()) {
      toast({ title: t("common.error"), description: t("marketplace.toasts.nameOrPhone"), variant: "destructive" });
      return;
    }
    if (form.delivery_type === "delivery" && !form.address.trim()) {
      toast({ title: t("common.error"), description: t("marketplace.toasts.addressRequired"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      for (const [tenantId, items] of Object.entries(cartByTenant)) {
        const { error } = await supabase.rpc("place_online_order" as any, {
          p_tenant_id: tenantId,
          p_items: items.map((i) => ({ product_id: i.id, qty: i.qty })),
          p_customer_name: form.name.trim(),
          p_customer_phone: form.phone.trim(),
          p_customer_email: form.email.trim() || null,
          p_delivery_type: form.delivery_type,
          p_delivery_address: form.delivery_type === "delivery" ? form.address.trim() : null,
          p_notes: form.notes.trim() || null,
        });
        if (error) throw error;
      }
      onClear();
      onOpenChange(false);
      setStep("cart");
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
                <span>{t("marketplace.total")}</span>
                <span className="text-primary">{formatPrice(cartTotal)}</span>
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
                <div>
                  <Label>{t("marketplace.deliveryAddress")} *</Label>
                  <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder={t("marketplace.deliveryAddressPh")} />
                </div>
              )}
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
                {Object.entries(cartByTenant).map(([tid, items]) => {
                  const subTotal = items.reduce((s, i) => s + i.price * i.qty, 0);
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
                      <div className="flex justify-between text-xs font-semibold">
                        <span>{t("marketplace.subtotal")}</span>
                        <span>{formatPrice(subTotal)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between font-bold text-lg pt-2">
                <span>{t("marketplace.total")}</span>
                <span className="text-primary">{formatPrice(cartTotal)}</span>
              </div>
            </div>
            <div className="border-t p-5 bg-card">
              <Button onClick={submit} disabled={submitting} className="w-full rounded-full h-11">
                {submitting ? t("marketplace.processing") : t("marketplace.confirmOrder")}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
