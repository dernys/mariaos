import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Calculator, Loader2, RefreshCw, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatMoney } from "@/lib/analytics/chartTheme";

interface Summary {
  opening_cash: number;
  net_sales: number;
  gross_sales: number;
  tax: number;
  transactions: number;
  cogs: number;
  gross_profit: number;
  expenses: number;
  expenses_cash: number;
  other_income: number;
  operating_result: number;
  returns_total: number;
  returns_cash: number;
  cash_sales: number;
  bank_sales: number;
  digital_pending: number;
  credit_sales: number;
  ar_collections_cash: number;
  ar_collections_total: number;
  ap_payments_cash: number;
  ap_payments_total: number;
  cash_in: number;
  cash_out: number;
  expected_cash: number;
  ar_balance: number;
  ap_balance: number;
  bank_accounts: { id: string; name: string; bank_name: string | null; currency: string; balance: number }[];
  scope: { shifts: number };
}

const today = () => new Date().toISOString().slice(0, 10);

export function DailyFinancialSummary() {
  const { tenantId } = useTenantContext();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [storeId, setStoreId] = useState<string>("all");
  const [shiftId, setShiftId] = useState<string>("all");
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [shifts, setShifts] = useState<{ id: string; label: string }[]>([]);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    supabase.from("stores").select("id,name").eq("tenant_id", tenantId).order("name")
      .then(({ data }) => setStores((data as any) || []));
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    let q = supabase
      .from("sales_shifts")
      .select("id,store_name,opened_at,status")
      .eq("tenant_id", tenantId)
      .order("opened_at", { ascending: false })
      .limit(30);
    if (storeId !== "all") q = q.eq("store_id", storeId);
    q.then(({ data }) =>
      setShifts(
        ((data as any[]) || []).map((s) => ({
          id: s.id,
          label: `${s.store_name || "Local"} · ${new Date(s.opened_at).toLocaleString()} ${s.status === "open" ? "(abierto)" : ""}`,
        })),
      ),
    );
  }, [tenantId, storeId]);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    const { data, error } = await (supabase.rpc as any)("daily_financial_summary", {
      p_tenant: tenantId,
      p_from: from,
      p_to: to,
      p_store: storeId === "all" ? null : storeId,
      p_shift: shiftId === "all" ? null : shiftId,
    });
    if (error) setError(error.message);
    else setData(data as Summary);
    setLoading(false);
  }, [tenantId, from, to, storeId, shiftId]);

  useEffect(() => { load(); }, [load]);

  const money = (n: number) => formatMoney(Number(n || 0));

  const pnl = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Ventas netas (sin impuesto)", value: data.net_sales, strong: false },
      { label: "− Costo de ventas", value: -data.cogs, strong: false },
      { label: "= Utilidad bruta", value: data.gross_profit, strong: true },
      { label: "− Gastos del período", value: -data.expenses, strong: false },
      { label: "+ Otros ingresos", value: data.other_income, strong: false },
      { label: "= Resultado operativo", value: data.operating_result, strong: true },
    ];
  }, [data]);

  const cash = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Saldo inicial de caja (fondo, no es ganancia)", value: data.opening_cash },
      { label: "+ Ventas cobradas en efectivo", value: data.cash_sales },
      { label: "+ Cobros de clientes en efectivo", value: data.ar_collections_cash },
      { label: "+ Otras entradas de caja", value: data.cash_in },
      { label: "− Salidas de caja (gastos/retiros)", value: -data.cash_out },
      { label: "− Pagos a proveedores en efectivo", value: -data.ap_payments_cash },
      { label: "− Devoluciones en efectivo", value: -data.returns_cash },
      { label: "= Efectivo físico esperado en caja", value: data.expected_cash, strong: true },
    ];
  }, [data]);

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" />
          <h2 className="font-heading font-semibold text-sm">Resumen financiero del día</h2>
          {data && <Badge variant="secondary" className="text-[10px]">{data.scope.shifts} turno(s)</Badge>}
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Actualizar
        </Button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px]">Desde</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Hasta</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Local</Label>
          <SearchableSelect
            value={storeId}
            onValueChange={(v) => { setStoreId(v); setShiftId("all"); }}
            options={[{ value: "all", label: "Todos los locales" }, ...stores.map((s) => ({ value: s.id, label: s.name }))]}
            placeholder="Local"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Turno</Label>
          <SearchableSelect
            value={shiftId}
            onValueChange={setShiftId}
            options={[{ value: "all", label: "Todos los turnos" }, ...shifts.map((s) => ({ value: s.id, label: s.label }))]}
            placeholder="Turno"
          />
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Wallet className="h-3 w-3" /> Dinero disponible (caja esperada)</p>
              <p className="font-heading font-bold text-lg">{money(data.expected_cash)}</p>
              <p className="text-[10px] text-muted-foreground">Incluye el fondo inicial de {money(data.opening_cash)}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Banknote className="h-3 w-3" /> Ventas del período</p>
              <p className="font-heading font-bold text-lg">{money(data.gross_sales)}</p>
              <p className="text-[10px] text-muted-foreground">{data.transactions} operaciones · impuesto {money(data.tax)}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Calculator className="h-3 w-3" /> Utilidad bruta</p>
              <p className={`font-heading font-bold text-lg ${data.gross_profit >= 0 ? "text-success" : "text-destructive"}`}>{money(data.gross_profit)}</p>
              <p className="text-[10px] text-muted-foreground">Ventas netas − costo de ventas</p>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground">
            Dinero disponible ≠ ventas ≠ utilidad: el efectivo incluye el fondo inicial y cobros de deudas; la utilidad descuenta costo y gastos.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-1">
              <h3 className="font-heading font-semibold text-xs">Resultado (ventas → utilidad)</h3>
              {pnl.map((r) => (
                <div key={r.label} className={`flex justify-between text-xs py-1 border-b border-border/50 ${r.strong ? "font-heading font-semibold" : ""}`}>
                  <span className={r.strong ? "" : "text-muted-foreground"}>{r.label}</span>
                  <span>{money(r.value)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <h3 className="font-heading font-semibold text-xs">Caja (saldo inicial → saldo final)</h3>
              {cash.map((r) => (
                <div key={r.label} className={`flex justify-between text-xs py-1 border-b border-border/50 ${(r as any).strong ? "font-heading font-semibold" : ""}`}>
                  <span className={(r as any).strong ? "" : "text-muted-foreground"}>{r.label}</span>
                  <span>{money(r.value)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { l: "Digital pendiente de confirmar", v: data.digital_pending },
              { l: "Ventas a crédito (fiado)", v: data.credit_sales },
              { l: "Cuentas por cobrar (total)", v: data.ar_balance },
              { l: "Cuentas por pagar (total)", v: data.ap_balance },
              { l: "Cobros de clientes", v: data.ar_collections_total },
              { l: "Pagos a proveedores", v: data.ap_payments_total },
              { l: "Devoluciones", v: data.returns_total },
              { l: "Gastos pagados en efectivo", v: data.expenses_cash },
            ].map((k) => (
              <div key={k.l} className="rounded-lg bg-muted/40 p-2">
                <p className="text-[10px] text-muted-foreground">{k.l}</p>
                <p className="font-heading font-semibold text-xs">{money(k.v)}</p>
              </div>
            ))}
          </div>

          {data.bank_accounts.length > 0 && (
            <div className="space-y-1">
              <h3 className="font-heading font-semibold text-xs">Saldos por cuenta bancaria / medio digital</h3>
              {data.bank_accounts.map((b) => (
                <div key={b.id} className="flex justify-between text-xs py-1 border-b border-border/50">
                  <span className="text-muted-foreground">{b.name}{b.bank_name ? ` · ${b.bank_name}` : ""} ({b.currency})</span>
                  <span>{money(b.balance)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
