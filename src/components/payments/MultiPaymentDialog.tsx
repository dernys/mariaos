import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export type PartyType = "customer" | "employee" | "supplier";

interface PaymentLine {
  id: string;
  method: string;
  currency: string;
  amount: string;
  rate: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  partyType: PartyType;
  partyId: string;
  partyName?: string;
  amountDue: number;
  referenceType?: "sale" | "purchase" | "invoice" | "consignment" | null;
  referenceId?: string | null;
  title?: string;
  onPaid?: () => void;
}

interface Method { id: string; name: string; type: string; is_active: boolean }
interface Currency { id: string; code: string; name: string; symbol: string; exchange_rate: number; is_active: boolean; is_base: boolean }

export function MultiPaymentDialog({ open, onOpenChange, partyType, partyId, partyName, amountDue, referenceType, referenceId, title, onPaid }: Props) {
  const { t } = useTranslation();
  const tenantId = useTenant();
  const { toast } = useToast();
  const [methods, setMethods] = useState<Method[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [lines, setLines] = useState<PaymentLine[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !tenantId) return;
    (async () => {
      const [m, c] = await Promise.all([
        supabase.from("payment_methods").select("*").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
        supabase.from("currencies").select("*").eq("tenant_id", tenantId).eq("is_active", true).order("is_base", { ascending: false }),
      ]);
      const mm = (m.data || []) as Method[];
      const cc = (c.data || []) as Currency[];
      setMethods(mm);
      setCurrencies(cc);
      const baseC = cc.find((x) => x.is_base) || cc[0];
      const defaultMethod = mm.find((x) => x.type === "cash") || mm[0];
      setLines([{
        id: crypto.randomUUID(),
        method: defaultMethod?.type || "cash",
        currency: baseC?.code || "CUP",
        amount: amountDue.toFixed(2),
        rate: String(baseC?.exchange_rate || 1),
      }]);
      setNotes("");
    })();
  }, [open, tenantId, amountDue]);

  const addLine = () => {
    const baseC = currencies.find((x) => x.is_base) || currencies[0];
    setLines((p) => [...p, {
      id: crypto.randomUUID(),
      method: methods[0]?.type || "cash",
      currency: baseC?.code || "CUP",
      amount: "0",
      rate: String(baseC?.exchange_rate || 1),
    }]);
  };
  const removeLine = (id: string) => setLines((p) => p.filter((l) => l.id !== id));

  const updateLine = (id: string, patch: Partial<PaymentLine>) => {
    setLines((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      const next = { ...l, ...patch };
      if (patch.currency) {
        const cur = currencies.find((c) => c.code === patch.currency);
        if (cur) next.rate = String(cur.exchange_rate);
      }
      return next;
    }));
  };

  const totalBase = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0) * (parseFloat(l.rate) || 1), 0);
  const remaining = amountDue - totalBase;

  const handleSubmit = async () => {
    if (totalBase <= 0) { toast({ title: t("pos.multiPay.invalidAmount"), variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      for (const l of lines) {
        const amt = parseFloat(l.amount) || 0;
        if (amt <= 0) continue;
        // QW1: clave estable por línea de pago → reintentos no duplican cobros.
        const ctx = beginOperation({
          module: "finance",
          operation: "register_account_payment",
          correlationId: `pay:${partyType}:${partyId}:${referenceId ?? "none"}:${l.id}`,
        });
        const { error } = await callFinancialRpc("register_account_payment", {
          p_party_type: partyType,
          p_party_id: partyId,
          p_amount: amt,
          p_method: l.method,
          p_currency: l.currency,
          p_exchange_rate: parseFloat(l.rate) || 1,
          p_reference_type: referenceType || null,
          p_reference_id: referenceId || null,
          p_notes: notes || null,
        }, ctx);
        if (error) throw new Error(error);
      }

      toast({ title: t("pos.multiPay.registered"), description: t("pos.multiPay.registeredDesc", { total: totalBase.toFixed(2) }) });
      onOpenChange(false);
      onPaid?.();
    } catch (e: any) {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title || t("pos.multiPay.title")}</DialogTitle>
          <DialogDescription>
            {partyName && <span>{t("pos.multiPay.for")}: <b>{partyName}</b> · </span>}
            {t("pos.multiPay.due")}: <b>{amountDue.toFixed(2)}</b>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("pos.multiPay.breakdown")}</Label>
            <Badge variant="outline" className="text-[10px]">{lines.length} {lines.length === 1 ? t("pos.multiPay.line") : t("pos.multiPay.lines")}</Badge>
          </div>
          {lines.map((l, idx) => (
            <div key={l.id} className="grid grid-cols-12 gap-2 items-end p-2 border rounded-lg">
              <div className="col-span-4">
                {idx === 0 && <Label className="text-[10px]">{t("pos.multiPay.method")}</Label>}
                <Select value={l.method} onValueChange={(v) => updateLine(l.id, { method: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {methods.map((m) => <SelectItem key={m.id} value={m.type}>{m.name}</SelectItem>)}
                    {methods.length === 0 && <>
                      <SelectItem value="cash">{t("payment.cash")}</SelectItem>
                      <SelectItem value="card">{t("payment.card")}</SelectItem>
                      <SelectItem value="qr">{t("payment.qr")}</SelectItem>
                      <SelectItem value="transfer">{t("payment.transfer")}</SelectItem>
                    </>}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3">
                {idx === 0 && <Label className="text-[10px]">{t("pos.multiPay.currency")}</Label>}
                <Select value={l.currency} onValueChange={(v) => updateLine(l.id, { currency: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {currencies.map((c) => <SelectItem key={c.id} value={c.code}>{c.code}</SelectItem>)}
                    {currencies.length === 0 && <SelectItem value="CUP">CUP</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3">
                {idx === 0 && <Label className="text-[10px]">{t("pos.multiPay.amount")}</Label>}
                <Input type="number" className="h-8 text-xs" value={l.amount} onChange={(e) => updateLine(l.id, { amount: e.target.value })} />
              </div>
              <div className="col-span-1">
                {idx === 0 && <Label className="text-[10px]">{t("pos.multiPay.rate")}</Label>}
                <Input type="number" className="h-8 text-xs" value={l.rate} onChange={(e) => updateLine(l.id, { rate: e.target.value })} />
              </div>
              <div className="col-span-1 flex justify-end">
                {lines.length > 1 && (
                  <button onClick={() => removeLine(l.id)} className="p-1 rounded hover:bg-destructive/10 text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addLine} className="gap-1 text-xs w-full">
            <Plus className="h-3 w-3" /> {t("pos.multiPay.addLine")}
          </Button>


          <div className="flex items-center justify-between p-2 rounded-lg bg-muted text-xs">
            <span>{t("pos.multiPay.convertedTotal")}</span>
            <Badge variant={totalBase >= amountDue ? "default" : "secondary"}>{totalBase.toFixed(2)}</Badge>
          </div>
          {Math.abs(remaining) > 0.01 && (
            <div className={`text-xs ${remaining > 0 ? "text-warning" : "text-emerald-600"}`}>
              {remaining > 0
                ? t("pos.multiPay.partialPending", { n: remaining.toFixed(2) })
                : t("pos.multiPay.change", { n: (-remaining).toFixed(2) })}
            </div>
          )}

          <div>
            <Label className="text-xs">{t("pos.multiPay.notes")}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-xs" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("pos.multiPay.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gradient-brand text-primary-foreground">
            {submitting ? t("pos.multiPay.processing") : t("pos.multiPay.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
