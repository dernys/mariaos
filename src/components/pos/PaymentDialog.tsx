import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Banknote, CreditCard, QrCode, Plus, Trash2, Search, User, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";
import { printThermalReceipt } from "@/lib/printReceipt";
import { enqueueSale } from "@/lib/offline/db";
import { usePOSSettings } from "@/hooks/usePOSSettings";
import { useTranslation } from "react-i18next";

interface CartItem {
  id: number;
  name: string;
  price: number;
  qty: number;
  sku?: string;
  productId?: string;
}

interface Customer {
  id: string;
  name: string;
  credit_limit: number;
  balance: number;
}

interface Employee {
  id: string;
  name: string;
  position: string | null;
  credit_limit: number;
  balance: number;
}

interface PaymentLine {
  method: "cash" | "card" | "qr";
  currency: string;
  amount: string;
  exchange_rate: string;
  card_last_four: string;
  card_holder: string;
  card_description: string;
}

interface CurrencyConfig {
  code: string;
  symbol: string;
  exchange_rate: number;
  is_base: boolean;
}

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
  onSaleComplete: () => void;
}

export function PaymentDialog({ open, onOpenChange, cart, subtotal, tax, total, onSaleComplete }: PaymentDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { settings: posSettings } = usePOSSettings();
  const [payments, setPayments] = useState<PaymentLine[]>([
    { method: "cash", currency: "CUP", amount: "", exchange_rate: "1", card_last_four: "", card_holder: "", card_description: "" },
  ]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyConfig[]>([]);
  const [partyType, setPartyType] = useState<"none" | "customer" | "employee">("none");
  const [selectedParty, setSelectedParty] = useState<string>("");
  const [partySearch, setPartySearch] = useState("");
  const [isPartial, setIsPartial] = useState(false);
  const [saving, setSaving] = useState(false);
  const [qrCopied, setQrCopied] = useState<number | null>(null);

  const selectedCustomer = partyType === "customer" ? selectedParty : "";
  const selectedEmployee = partyType === "employee" ? selectedParty : "";

  // Build exchange rates map from DB currencies
  const exchangeRates: Record<string, number> = {};
  currencies.forEach((c) => { exchangeRates[c.code] = c.exchange_rate; });

  // Auto-enable partial when client/employee selected (allow leaving credit)
  useEffect(() => {
    if (partyType !== "none" && selectedParty) setIsPartial(true);
  }, [partyType, selectedParty]);

  useEffect(() => {
    if (open) {
      setPayments([{ method: "cash", currency: "CUP", amount: "", exchange_rate: "1", card_last_four: "", card_holder: "", card_description: "" }]);
      setPartyType("none");
      setSelectedParty("");
      setPartySearch("");
      setIsPartial(false);
      setQrCopied(null);
      fetchData();
    }
  }, [open]);

  const fetchData = async () => {
    const [custRes, empRes, currRes] = await Promise.all([
      supabase.from("customers").select("id, name, credit_limit, balance").order("name"),
      supabase.from("employees").select("id, name, position, credit_limit, balance").eq("is_active", true).order("name"),
      supabase.from("currencies").select("code, symbol, exchange_rate, is_base").eq("is_active", true).order("code"),
    ]);
    if (custRes.data) setCustomers(custRes.data as Customer[]);
    if (empRes.data) setEmployees(empRes.data as Employee[]);
    if (currRes.data && currRes.data.length > 0) {
      setCurrencies(currRes.data as CurrencyConfig[]);
    } else {
      // Fallback if no currencies configured
      setCurrencies([
        { code: "CUP", symbol: "$", exchange_rate: 1, is_base: true },
        { code: "USD", symbol: "$", exchange_rate: 300, is_base: false },
        { code: "EUR", symbol: "€", exchange_rate: 330, is_base: false },
      ]);
    }
  };

  const totalPaidInBase = payments.reduce((sum, p) => {
    const amt = parseFloat(p.amount) || 0;
    const rate = parseFloat(p.exchange_rate) || 1;
    return sum + amt * rate;
  }, 0);

  const remaining = total - totalPaidInBase;

  const addPaymentLine = () => {
    setPayments([...payments, { method: "cash", currency: "CUP", amount: "", exchange_rate: "1", card_last_four: "", card_holder: "", card_description: "" }]);
  };

  const removePaymentLine = (idx: number) => {
    setPayments(payments.filter((_, i) => i !== idx));
  };

  const updatePayment = (idx: number, field: keyof PaymentLine, value: string) => {
    const updated = [...payments];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === "currency") {
      updated[idx].exchange_rate = String(exchangeRates[value] || 1);
    }
    setPayments(updated);
  };

  const getQrPaymentData = (p: PaymentLine, saleTotal: number) => {
    const amt = parseFloat(p.amount) || saleTotal;
    return JSON.stringify({
      merchant: "POS-System",
      amount: amt,
      currency: p.currency,
      total_base: amt * (parseFloat(p.exchange_rate) || 1),
      timestamp: new Date().toISOString(),
    });
  };

  const copyQrData = (idx: number, data: string) => {
    navigator.clipboard.writeText(data);
    setQrCopied(idx);
    setTimeout(() => setQrCopied(null), 2000);
  };

  const handleSubmit = async () => {
    if (!isPartial && remaining > 0.01) {
      toast({ title: t("common.error"), description: t("pos.payment.errors.notCovered"), variant: "destructive" });
      return;
    }

    // Validate card payments have required fields
    for (const p of payments) {
      if (p.method === "card" && (!p.card_last_four || !p.card_holder)) {
        toast({ title: t("common.error"), description: t("pos.payment.errors.cardFields"), variant: "destructive" });
        return;
      }
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t("pos.payment.errors.notAuthenticated"));

      const { data: tu } = await supabase.from("tenant_users").select("tenant_id").eq("user_id", user.id).limit(1).single();

      // Validar turno abierto del usuario
      const { data: openShift } = await supabase
        .from("sales_shifts")
        .select("id, store_id, store_name")
        .eq("user_id", user.id)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!openShift) {
        toast({
          title: t("pos.payment.errors.noShift"),
          description: t("pos.payment.errors.noShiftDesc"),
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      // Validación: pago parcial requiere cliente o empleado para registrar la deuda
      if (isPartial && remaining > 0.01 && !selectedCustomer && !selectedEmployee) {
        toast({ title: t("pos.payment.errors.partyRequired"), description: t("pos.payment.errors.partyRequiredDesc"), variant: "destructive" });
        setSaving(false);
        return;
      }

      // Validación de límite de crédito
      if (isPartial && remaining > 0.01) {
        const party: any = selectedCustomer
          ? customers.find((c) => c.id === selectedCustomer)
          : employees.find((e) => e.id === selectedEmployee);
        if (party) {
          const newBalance = Number(party.balance || 0) + remaining;
          const limit = Number(party.credit_limit || 0);
          if (limit > 0 && newBalance > limit) {
            toast({ title: t("pos.payment.errors.creditExceeded"), description: t("pos.payment.errors.creditExceededDesc", { newBalance: newBalance.toFixed(2), limit: limit.toFixed(2) }), variant: "destructive" });
            setSaving(false);
            return;
          }
        }
      }

      const status = isPartial && remaining > 0.01 ? "partial" : "paid";
      const clientUuid = crypto.randomUUID();
      const paymentRows = payments
        .filter((p) => parseFloat(p.amount) > 0)
        .map((p) => ({
          method: p.method,
          currency: p.currency,
          amount: parseFloat(p.amount),
          amount_in_base: parseFloat(p.amount) * (parseFloat(p.exchange_rate) || 1),
          exchange_rate: parseFloat(p.exchange_rate) || 1,
          card_last_four: p.method === "card" ? p.card_last_four : null,
          card_holder: p.method === "card" ? p.card_holder : null,
          card_description: p.method === "card" ? p.card_description : null,
        }));

      // --- OFFLINE PATH: si no hay red, encola y termina ---
      const offlinePayload = {
        client_uuid: clientUuid,
        tenant_id: tu?.tenant_id,
        customer_id: selectedCustomer || null,
        employee_id: selectedEmployee || null,
        shift_id: openShift.id,
        location_type: "store",
        location_id: openShift.store_id || null,
        subtotal, tax, total,
        amount_paid: totalPaidInBase,
        status,
        created_at: new Date().toISOString(),
        items: cart.map((it) => ({
          client_uuid: crypto.randomUUID(),
          product_id: it.productId || null,
          product_name: it.name,
          sku: it.sku || null,
          price: it.price, qty: it.qty,
          total: it.price * it.qty,
        })),
        payments: paymentRows.map((p) => ({
          client_uuid: crypto.randomUUID(),
          party_type: selectedCustomer ? "customer" : selectedEmployee ? "employee" : "customer",
          party_id: selectedCustomer || selectedEmployee || null,
          method: p.method, currency: p.currency,
          amount: p.amount, amount_in_base: p.amount_in_base,
          exchange_rate: p.exchange_rate,
        })),
      };

      if (!navigator.onLine && tu?.tenant_id) {
        await enqueueSale({ client_uuid: clientUuid, tenant_id: tu.tenant_id, payload: offlinePayload });
        toast({
          title: t("pos.payment.toasts.savedOffline"),
          description: t("pos.payment.toasts.savedOfflineDesc"),
        });
        onSaleComplete();
        onOpenChange(false);
        setSaving(false);
        return;
      }

      // --- ONLINE PATH ---
      const { data: sale, error: saleErr } = await supabase.from("sales").insert({
        tenant_id: tu?.tenant_id,
        client_uuid: clientUuid,
        customer_id: selectedCustomer || null,
        employee_id: selectedEmployee || null,
        shift_id: openShift.id,
        store_id: openShift.store_id || null,
        subtotal, tax, total,
        amount_paid: totalPaidInBase,
        status,
      } as any).select("id, ticket_number").single();

      if (saleErr || !sale) throw saleErr || new Error("Error creando venta");

      const items = cart.map((item) => ({
        sale_id: sale.id,
        product_id: item.productId || null,
        product_name: item.name,
        sku: item.sku || null,
        price: item.price,
        qty: item.qty,
        total: item.price * item.qty,
      }));
      const { error: itemsErr } = await supabase.from("sale_items").insert(items);
      if (itemsErr) throw itemsErr;

      if (paymentRows.length > 0) {
        const { error: payErr } = await supabase.from("sale_payments").insert(
          paymentRows.map((p) => ({ ...p, sale_id: sale.id }))
        );
        if (payErr) throw payErr;
      }

      if (cart.some((c) => c.productId)) {
        // Si no hay tienda asignada al turno, usar el tenant como ubicación virtual.
        const useStore = !!openShift.store_id;
        const { error: stockErr } = await supabase.rpc("process_sale_stock", {
          p_sale_id: sale.id,
          p_location_type: useStore ? "store" : "tenant",
          p_location_id: useStore ? openShift.store_id : (tu?.tenant_id as string),
        });
        if (stockErr) {
          console.error("Stock RPC error:", stockErr);
          toast({ title: t("pos.payment.errors.stockWarn"), description: t("pos.payment.errors.stockWarnDesc", { msg: stockErr.message }) });
        }
      }

      // Imprimir ticket térmico (si está habilitado en ajustes POS)
      if (posSettings.auto_print_receipt) {
        try {
          const { data: tenantInfo } = await supabase.from("tenants").select("name").eq("id", tu?.tenant_id).maybeSingle();
          const customerName = customers.find((c) => c.id === selectedCustomer)?.name;
          printThermalReceipt({
            ticketNumber: (sale as any).ticket_number || sale.id.slice(0, 8),
            tenantName: tenantInfo?.name,
            storeName: openShift.store_name || undefined,
            customer: customerName,
            date: new Date(),
            items: cart.map((c) => ({ name: c.name, qty: c.qty, price: c.price, total: c.price * c.qty })),
            subtotal, tax, total,
            paid: totalPaidInBase,
            change: totalPaidInBase > total ? totalPaidInBase - total : 0,
            payments: paymentRows.map((p) => ({
              method: p.method === "cash" ? "Efectivo" : p.method === "card" ? "Tarjeta" : "QR",
              currency: p.currency, amount: p.amount,
            })),
            footer: posSettings.receipt_footer,
            widthMm: posSettings.receipt_width,
            silent: posSettings.silent_print,
          });
        } catch (e) { console.warn("No se pudo imprimir el recibo:", e); }
      }

      // --- Emit business event for reactive workflows / agents ---
      try {
        await supabase.from("business_events").insert({
          tenant_id: tu?.tenant_id as string,
          source: "pos",
          event_type: "sale.completed",
          payload: {
            sale_id: sale.id,
            ticket_number: (sale as any).ticket_number ?? null,
            total, subtotal, tax,
            amount_paid: totalPaidInBase,
            status,
            customer_id: selectedCustomer || null,
            store_id: openShift.store_id || null,
            shift_id: openShift.id,
            items_count: cart.length,
          },
        });
        // Fire-and-forget: trigger reactive workflows
        supabase.functions.invoke("workflow-runner").catch(() => {});
      } catch (e) { console.warn("business_events emit failed", e); }


      toast({
        title: `Ticket ${(sale as any).ticket_number || ""}`.trim(),
        description: status === "partial" ? t("pos.payment.toasts.pendingAmount", { amount: remaining.toFixed(2) }) : t("pos.payment.toasts.fullPaid"),
      });

      onSaleComplete();
      onOpenChange(false);
    } catch (err: any) {
      // Fallback: si el error sugiere problema de red, encolamos offline
      const msg = String(err?.message || err);
      const isNetwork = /Failed to fetch|NetworkError|TypeError|fetch/i.test(msg) || !navigator.onLine;
      if (isNetwork) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const { data: tu } = user ? await supabase.from("tenant_users").select("tenant_id").eq("user_id", user.id).limit(1).single() : { data: null } as any;
          if (tu?.tenant_id) {
            const clientUuid = crypto.randomUUID();
            await enqueueSale({
              client_uuid: clientUuid,
              tenant_id: tu.tenant_id,
              payload: {
                client_uuid: clientUuid,
                tenant_id: tu.tenant_id,
                customer_id: selectedCustomer || null,
                employee_id: selectedEmployee || null,
                subtotal, tax, total,
                amount_paid: totalPaidInBase,
                status: isPartial && remaining > 0.01 ? "partial" : "paid",
                created_at: new Date().toISOString(),
                items: cart.map((it) => ({
                  client_uuid: crypto.randomUUID(),
                  product_id: it.productId || null,
                  product_name: it.name, sku: it.sku || null,
                  price: it.price, qty: it.qty, total: it.price * it.qty,
                })),
                payments: [],
              },
            });
            toast({ title: t("pos.payment.toasts.queuedOffline"), description: t("pos.payment.toasts.queuedOfflineDesc") });
            onSaleComplete();
            onOpenChange(false);
            setSaving(false);
            return;
          }
        } catch { /* ignore */ }
      }
      toast({ title: t("common.error"), description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const filteredParties = partyType === "customer"
    ? customers.filter((c) => c.name.toLowerCase().includes(partySearch.toLowerCase()))
    : partyType === "employee"
      ? employees.filter((e) => e.name.toLowerCase().includes(partySearch.toLowerCase()))
      : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">{t("pos.payment.title")}</DialogTitle>
          <DialogDescription>
            {t("pos.payment.totalToCharge")}: <span className="font-bold text-primary">${total.toLocaleString(undefined, { maximumFractionDigits: 2 })} CUP</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Party type toggle (cliente XOR empleado) */}
          <div className="space-y-2">
            <Label className="text-xs">{t("pos.payment.associateWith")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: "none", label: t("pos.payment.noAssociate") },
                { v: "customer", label: t("pos.payment.customer") },
                { v: "employee", label: t("pos.payment.employee") },
              ] as const).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => { setPartyType(opt.v); setSelectedParty(""); setPartySearch(""); }}
                  className={`px-3 py-2 rounded-md text-xs font-medium border transition-colors ${
                    partyType === opt.v ? "gradient-brand text-primary-foreground border-transparent" : "bg-background hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {partyType !== "none" && (
              <Select value={selectedParty} onValueChange={setSelectedParty}>
                <SelectTrigger><SelectValue placeholder={partyType === "customer" ? t("pos.payment.selectCustomer") : t("pos.payment.selectEmployee")} /></SelectTrigger>
                <SelectContent>
                  <div className="p-2">
                    <Input placeholder={t("pos.payment.searchPlaceholder")} value={partySearch} onChange={(e) => setPartySearch(e.target.value)} className="h-8 text-xs" />
                  </div>
                  {filteredParties.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex items-center gap-2">
                        <span>{p.name}</span>
                        {partyType === "customer" && p.balance > 0 && (
                          <Badge variant="destructive" className="text-[10px] px-1">{t("pos.payment.debtBadge")}: ${p.balance}</Badge>
                        )}
                        {partyType === "employee" && p.position && (
                          <span className="text-[10px] text-muted-foreground">({p.position})</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Partial Payment Toggle */}
          {(() => {
            const party: any = selectedCustomer
              ? customers.find((c) => c.id === selectedCustomer)
              : selectedEmployee
                ? employees.find((e) => e.id === selectedEmployee)
                : null;
            const limit = Number(party?.credit_limit || 0);
            const curBal = Number(party?.balance || 0);
            const available = limit > 0 ? Math.max(0, limit - curBal) : null;
            const projected = curBal + remaining;
            const overLimit = !!party && limit > 0 && isPartial && remaining > 0.01 && projected > limit;
            return (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 bg-muted/30 rounded-lg p-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="partial"
                      checked={isPartial}
                      onChange={(e) => setIsPartial(e.target.checked)}
                      disabled={!!(selectedCustomer || selectedEmployee)}
                      className="h-4 w-4 rounded border-input"
                    />
                    <Label htmlFor="partial" className="text-xs cursor-pointer">
                      {t("pos.payment.allowPartial")}
                      {(selectedCustomer || selectedEmployee) && <span className="ml-1 text-primary">{t("pos.payment.autoActive")}</span>}
                    </Label>
                  </div>
                  {isPartial && remaining > 0.01 && (
                    <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning">
                      {t("pos.payment.balance")}: ${remaining.toFixed(2)}
                    </Badge>
                  )}
                </div>
                {party && (
                  <div className={`text-[10px] flex items-center justify-between rounded px-2 py-1 ${overLimit ? "bg-destructive/10 text-destructive" : "bg-muted/40 text-muted-foreground"}`}>
                    <span>{t("pos.payment.currentDebt")}: <b>${curBal.toFixed(2)}</b> {limit > 0 && <>· {t("pos.payment.limit")}: <b>${limit.toFixed(2)}</b> · {t("pos.payment.available")}: <b>${(available ?? 0).toFixed(2)}</b></>}{limit === 0 && <> · {t("pos.payment.noLimit")}</>}</span>
                    {overLimit && <span className="font-semibold">{t("pos.payment.overLimit")}</span>}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Payment Lines */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-heading font-semibold">{t("pos.payment.methods")}</Label>
              <Button type="button" variant="outline" size="sm" onClick={addPaymentLine} className="text-xs gap-1">
                <Plus className="h-3 w-3" /> {t("pos.payment.add")}
              </Button>
            </div>

            {payments.map((p, idx) => (
              <div key={idx} className="bg-muted/40 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {(["cash", "card", "qr"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => updatePayment(idx, "method", m)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          p.method === m ? "gradient-brand text-primary-foreground" : "bg-background border hover:bg-muted"
                        }`}
                      >
                        {m === "cash" && <Banknote className="h-3 w-3" />}
                        {m === "card" && <CreditCard className="h-3 w-3" />}
                        {m === "qr" && <QrCode className="h-3 w-3" />}
                        {m === "cash" ? t("pos.payment.cash") : m === "card" ? t("pos.payment.card") : t("pos.payment.qr")}
                      </button>
                    ))}
                  </div>
                  {payments.length > 1 && (
                    <button type="button" onClick={() => removePaymentLine(idx)} className="ml-auto p-1 text-destructive hover:bg-destructive/10 rounded">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px]">{t("pos.payment.currency")}</Label>
                    <Select value={p.currency} onValueChange={(v) => updatePayment(idx, "currency", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {currencies.map((c) => (
                          <SelectItem key={c.code} value={c.code}>{c.code} ({c.symbol})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px]">{t("pos.payment.amount")}</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={p.amount}
                      onChange={(e) => updatePayment(idx, "amount", e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">{t("pos.payment.exchangeRate")}</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={p.exchange_rate}
                      onChange={(e) => updatePayment(idx, "exchange_rate", e.target.value)}
                    />
                  </div>
                </div>

                {p.currency !== "CUP" && parseFloat(p.amount) > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    {t("pos.payment.equivalent")} ${((parseFloat(p.amount) || 0) * (parseFloat(p.exchange_rate) || 1)).toLocaleString()} CUP
                  </p>
                )}

                {p.method === "card" && (
                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border/50">
                    <div>
                      <Label className="text-[10px]">{t("pos.payment.lastFour")} *</Label>
                      <Input
                        className="h-8 text-xs"
                        maxLength={4}
                        value={p.card_last_four}
                        onChange={(e) => updatePayment(idx, "card_last_four", e.target.value.replace(/\D/g, ""))}
                        placeholder="1234"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">{t("pos.payment.holder")} *</Label>
                      <Input
                        className="h-8 text-xs"
                        value={p.card_holder}
                        onChange={(e) => updatePayment(idx, "card_holder", e.target.value)}
                        placeholder={t("pos.payment.holderPh")}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">{t("pos.payment.descriptionField")}</Label>
                      <Input
                        className="h-8 text-xs"
                        value={p.card_description}
                        onChange={(e) => updatePayment(idx, "card_description", e.target.value)}
                        placeholder={t("pos.payment.descriptionPh")}
                      />
                    </div>
                  </div>
                )}

                {p.method === "qr" && (
                  <div className="flex flex-col items-center gap-3 pt-2 border-t border-border/50">
                    <div className="bg-white p-3 rounded-lg shadow-sm">
                      <QRCodeSVG
                        value={getQrPaymentData(p, remaining > 0 ? remaining : total)}
                        size={140}
                        level="M"
                        includeMargin
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground text-center">
                      {t("pos.payment.qrScan")}{" "}
                      <span className="font-semibold">{parseFloat(p.amount) || 0} {p.currency}</span>
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1"
                      onClick={() => copyQrData(idx, getQrPaymentData(p, remaining > 0 ? remaining : total))}
                    >
                      {qrCopied === idx ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {qrCopied === idx ? t("pos.payment.copied") : t("pos.payment.copyData")}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="bg-muted/60 rounded-lg p-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("pos.payment.saleTotal")}</span>
              <span className="font-heading font-semibold">${total.toLocaleString(undefined, { maximumFractionDigits: 2 })} CUP</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("pos.payment.paid")}</span>
              <span className="font-heading font-semibold text-primary">${totalPaidInBase.toLocaleString(undefined, { maximumFractionDigits: 2 })} CUP</span>
            </div>
            {remaining > 0.01 && (
              <div className="flex justify-between text-destructive">
                <span>{t("pos.payment.pending")}</span>
                <span className="font-heading font-bold">${remaining.toLocaleString(undefined, { maximumFractionDigits: 2 })} CUP</span>
              </div>
            )}
            {remaining <= 0 && totalPaidInBase > total && (
              <div className="flex justify-between text-primary">
                <span>{t("pos.payment.change")}</span>
                <span className="font-heading font-bold">${Math.abs(remaining).toLocaleString(undefined, { maximumFractionDigits: 2 })} CUP</span>
              </div>
            )}
          </div>

          <Button
            onClick={handleSubmit}
            disabled={saving || (!(isPartial && (selectedCustomer || selectedEmployee)) && payments.every((p) => !parseFloat(p.amount)))}
            className="w-full gradient-brand text-primary-foreground font-heading font-semibold h-11"
          >
            {saving ? t("pos.payment.processing") : isPartial && remaining > 0.01
              ? (totalPaidInBase > 0 ? `${t("pos.payment.chargePartial")} $${totalPaidInBase.toFixed(2)} CUP` : `${t("pos.payment.leaveCredit")} $${total.toFixed(2)} CUP`)
              : `${t("pos.cart.charge")} $${total.toLocaleString(undefined, { maximumFractionDigits: 2 })} CUP`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
