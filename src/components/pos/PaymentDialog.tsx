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
  const { toast } = useToast();
  const [payments, setPayments] = useState<PaymentLine[]>([
    { method: "cash", currency: "CUP", amount: "", exchange_rate: "1", card_last_four: "", card_holder: "", card_description: "" },
  ]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyConfig[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [isPartial, setIsPartial] = useState(false);
  const [saving, setSaving] = useState(false);
  const [qrCopied, setQrCopied] = useState<number | null>(null);

  // Build exchange rates map from DB currencies
  const exchangeRates: Record<string, number> = {};
  currencies.forEach((c) => { exchangeRates[c.code] = c.exchange_rate; });

  // Auto-enable partial when client/employee selected (allow leaving credit)
  useEffect(() => {
    if (selectedCustomer || selectedEmployee) setIsPartial(true);
  }, [selectedCustomer, selectedEmployee]);

  useEffect(() => {
    if (open) {
      setPayments([{ method: "cash", currency: "CUP", amount: "", exchange_rate: "1", card_last_four: "", card_holder: "", card_description: "" }]);
      setSelectedCustomer("");
      setSelectedEmployee("");
      setIsPartial(false);
      setQrCopied(null);
      fetchData();
    }
  }, [open]);

  const fetchData = async () => {
    const [custRes, empRes, currRes] = await Promise.all([
      supabase.from("customers").select("id, name, credit_limit, balance").order("name"),
      supabase.from("employees").select("id, name, position").eq("is_active", true).order("name"),
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
      toast({ title: "Error", description: "El monto pagado no cubre el total. Activa pago parcial o ajusta los montos.", variant: "destructive" });
      return;
    }

    // Validate card payments have required fields
    for (const p of payments) {
      if (p.method === "card" && (!p.card_last_four || !p.card_holder)) {
        toast({ title: "Error", description: "Los pagos con tarjeta requieren titular y últimos 4 dígitos.", variant: "destructive" });
        return;
      }
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

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
          title: "Sin turno abierto",
          description: "Debes abrir un turno en /turnos antes de cobrar.",
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      // Validación: pago parcial requiere cliente o empleado para registrar la deuda
      if (isPartial && remaining > 0.01 && !selectedCustomer && !selectedEmployee) {
        toast({ title: "Cliente o empleado requerido", description: "Para dejar saldo pendiente debes asociar un cliente o empleado.", variant: "destructive" });
        setSaving(false);
        return;
      }

      const status = isPartial && remaining > 0.01 ? "partial" : "paid";

      // Create sale (con shift, store y ticket auto)
      const { data: sale, error: saleErr } = await supabase.from("sales").insert({
        tenant_id: tu?.tenant_id,
        customer_id: selectedCustomer || null,
        employee_id: selectedEmployee || null,
        shift_id: openShift.id,
        store_id: openShift.store_id || null,
        subtotal,
        tax,
        total,
        amount_paid: totalPaidInBase,
        status,
      }).select("id, ticket_number").single();

      if (saleErr || !sale) throw saleErr || new Error("Error creando venta");

      // Insert sale items (con product_id)
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

      // Insert payments
      const paymentRows = payments
        .filter((p) => parseFloat(p.amount) > 0)
        .map((p) => ({
          sale_id: sale.id,
          method: p.method,
          currency: p.currency,
          amount: parseFloat(p.amount),
          amount_in_base: parseFloat(p.amount) * (parseFloat(p.exchange_rate) || 1),
          exchange_rate: parseFloat(p.exchange_rate) || 1,
          card_last_four: p.method === "card" ? p.card_last_four : null,
          card_holder: p.method === "card" ? p.card_holder : null,
          card_description: p.method === "card" ? p.card_description : null,
        }));
      if (paymentRows.length > 0) {
        const { error: payErr } = await supabase.from("sale_payments").insert(paymentRows);
        if (payErr) throw payErr;
      }

      // El saldo de cliente/empleado lo actualiza el trigger trg_apply_sale_credit_balance automáticamente.

      // Descontar stock de la tienda del turno (si hay store_id y productos vinculados)
      if (openShift.store_id && cart.some((c) => c.productId)) {
        const { error: stockErr } = await supabase.rpc("process_sale_stock", {
          p_sale_id: sale.id,
          p_location_type: "store",
          p_location_id: openShift.store_id,
        });
        if (stockErr) {
          console.error("Stock RPC error:", stockErr);
          toast({ title: "Aviso", description: "Venta registrada pero el descuento de stock falló: " + stockErr.message });
        }
      }

      // Imprimir ticket térmico 80mm
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
        });
      } catch (e) { console.warn("No se pudo imprimir el recibo:", e); }

      toast({
        title: `Ticket ${(sale as any).ticket_number || ""}`.trim(),
        description: status === "partial" ? `Pendiente: $${remaining.toFixed(2)} CUP` : "Pago completo registrado",
      });
      onSaleComplete();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Procesar Cobro</DialogTitle>
          <DialogDescription>
            Total a cobrar: <span className="font-bold text-primary">${total.toLocaleString(undefined, { maximumFractionDigits: 2 })} CUP</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer & Employee Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Cliente (opcional)</Label>
              <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                <SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
                <SelectContent>
                  <div className="p-2">
                    <Input placeholder="Buscar..." value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} className="h-8 text-xs" />
                  </div>
                  {filteredCustomers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <span>{c.name}</span>
                        {c.balance > 0 && <Badge variant="destructive" className="text-[10px] px-1">Deuda: ${c.balance}</Badge>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Empleado (opcional)</Label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger><SelectValue placeholder="Seleccionar empleado" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name} {e.position && `(${e.position})`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Partial Payment Toggle */}
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
                Permitir pago parcial / fiado
                {(selectedCustomer || selectedEmployee) && <span className="ml-1 text-primary">(activo automáticamente)</span>}
              </Label>
            </div>
            {isPartial && remaining > 0.01 && (
              <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning">
                Saldo: ${remaining.toFixed(2)}
              </Badge>
            )}
          </div>

          {/* Payment Lines */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-heading font-semibold">Métodos de Pago</Label>
              <Button type="button" variant="outline" size="sm" onClick={addPaymentLine} className="text-xs gap-1">
                <Plus className="h-3 w-3" /> Agregar
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
                        {m === "cash" ? "Efectivo" : m === "card" ? "Tarjeta" : "QR"}
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
                    <Label className="text-[10px]">Moneda</Label>
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
                    <Label className="text-[10px]">Monto</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={p.amount}
                      onChange={(e) => updatePayment(idx, "amount", e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">Tasa de cambio</Label>
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
                    Equivale a ${((parseFloat(p.amount) || 0) * (parseFloat(p.exchange_rate) || 1)).toLocaleString()} CUP
                  </p>
                )}

                {p.method === "card" && (
                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border/50">
                    <div>
                      <Label className="text-[10px]">Últimos 4 dígitos *</Label>
                      <Input
                        className="h-8 text-xs"
                        maxLength={4}
                        value={p.card_last_four}
                        onChange={(e) => updatePayment(idx, "card_last_four", e.target.value.replace(/\D/g, ""))}
                        placeholder="1234"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Titular *</Label>
                      <Input
                        className="h-8 text-xs"
                        value={p.card_holder}
                        onChange={(e) => updatePayment(idx, "card_holder", e.target.value)}
                        placeholder="Nombre"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Descripción</Label>
                      <Input
                        className="h-8 text-xs"
                        value={p.card_description}
                        onChange={(e) => updatePayment(idx, "card_description", e.target.value)}
                        placeholder="Visa, Mastercard..."
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
                      Escanea el código QR para completar el pago de{" "}
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
                      {qrCopied === idx ? "Copiado" : "Copiar datos"}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="bg-muted/60 rounded-lg p-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total venta</span>
              <span className="font-heading font-semibold">${total.toLocaleString(undefined, { maximumFractionDigits: 2 })} CUP</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pagado</span>
              <span className="font-heading font-semibold text-primary">${totalPaidInBase.toLocaleString(undefined, { maximumFractionDigits: 2 })} CUP</span>
            </div>
            {remaining > 0.01 && (
              <div className="flex justify-between text-destructive">
                <span>Pendiente</span>
                <span className="font-heading font-bold">${remaining.toLocaleString(undefined, { maximumFractionDigits: 2 })} CUP</span>
              </div>
            )}
            {remaining <= 0 && totalPaidInBase > total && (
              <div className="flex justify-between text-primary">
                <span>Cambio</span>
                <span className="font-heading font-bold">${Math.abs(remaining).toLocaleString(undefined, { maximumFractionDigits: 2 })} CUP</span>
              </div>
            )}
          </div>

          <Button
            onClick={handleSubmit}
            disabled={saving || (payments.every((p) => !parseFloat(p.amount)))}
            className="w-full gradient-brand text-primary-foreground font-heading font-semibold h-11"
          >
            {saving ? "Procesando..." : isPartial && remaining > 0.01
              ? `Cobrar Parcial $${totalPaidInBase.toFixed(2)} CUP`
              : `Cobrar $${total.toLocaleString(undefined, { maximumFractionDigits: 2 })} CUP`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
