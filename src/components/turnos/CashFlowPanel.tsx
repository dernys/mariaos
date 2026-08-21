import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDownCircle, ArrowUpCircle, BookOpenCheck, Wallet, CreditCard, Banknote, TrendingUp, Plus, HandCoins } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { cashCategoryLabel } from "./cashCategories";

export interface ShiftCollection {
  id: string;
  direction: "in" | "out";
  party_type: string;
  party_name: string | null;
  method: string;
  currency: string;
  amount: number;
  amount_in_base: number;
  created_at: string;
}

export interface ShiftSummary {
  opening_cash: number;
  cash_sales: number;
  card_sales: number;
  transfer_sales: number;
  other_payments: number;
  total_sales: number;
  credit_sales: number;
  transactions: number;
  cash_in: number;
  cash_out: number;
  returns_cash: number;
  expected_cash: number;
  collections_cash?: number;
  collections_other?: number;
  collections_total?: number;
  collections_count?: number;
  supplier_payments_cash?: number;
  supplier_payments_other?: number;
  supplier_payments_total?: number;
  collections?: ShiftCollection[];
  movements_by_category?: { category: string; movement_type: string; total: number }[];
}

interface Props {
  summary: ShiftSummary | null;
  movements: any[];
  isOpen?: boolean;
  onNewMovement?: () => void;
}

const money = (n: number) => `$${Number(n || 0).toFixed(2)}`;

export function CashFlowPanel({ summary, movements, isOpen, onNewMovement }: Props) {
  const nav = useNavigate();

  const flow = useMemo(() => {
    if (!summary) return [];
    return [
      { label: "Caja inicial (fondo)", value: summary.opening_cash, sign: 0 as const, icon: Wallet },
      { label: "Ventas en efectivo", value: summary.cash_sales, sign: 1 as const, icon: Banknote },
      { label: "Cobros de deudas en efectivo", value: summary.collections_cash ?? 0, sign: 1 as const, icon: HandCoins },
      { label: "Ingresos de caja", value: summary.cash_in, sign: 1 as const, icon: ArrowDownCircle },
      { label: "Pagos a proveedores en efectivo", value: summary.supplier_payments_cash ?? 0, sign: -1 as const, icon: ArrowUpCircle },
      { label: "Egresos de caja", value: summary.cash_out, sign: -1 as const, icon: ArrowUpCircle },
      { label: "Devoluciones en efectivo", value: summary.returns_cash, sign: -1 as const, icon: ArrowUpCircle },
    ];
  }, [summary]);

  if (!summary) {
    return <div className="bg-card rounded-xl border p-6 text-center text-xs text-muted-foreground">Calculando flujo de caja…</div>;
  }

  const collections = summary.collections ?? [];

  const nonCash = [
    { label: "Tarjeta", value: summary.card_sales, icon: CreditCard },
    { label: "Transferencia / QR", value: summary.transfer_sales, icon: TrendingUp },
    { label: "Otros medios", value: summary.other_payments, icon: TrendingUp },
    { label: "Ventas a crédito (fiado)", value: summary.credit_sales, icon: TrendingUp },
    { label: "Cobros de deudas (no efectivo)", value: summary.collections_other ?? 0, icon: HandCoins },
  ];


  return (
    <div className="space-y-4">
      {/* Waterfall de efectivo */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 bg-card rounded-xl border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading font-semibold text-sm flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" /> Flujo de efectivo del turno
            </h3>
            {isOpen && onNewMovement && (
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={onNewMovement}>
                <Plus className="h-3.5 w-3.5" /> Movimiento
              </Button>
            )}
          </div>
          <div className="space-y-1.5">
            {flow.map((f) => {
              const pct = summary.expected_cash > 0 ? Math.min(100, (Number(f.value) / summary.expected_cash) * 100) : 0;
              return (
                <div key={f.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <f.icon className="h-3.5 w-3.5" /> {f.label}
                    </span>
                    <span className={`font-heading font-bold ${f.sign === 1 ? "text-success" : f.sign === -1 ? "text-destructive" : ""}`}>
                      {f.sign === 1 ? "+" : f.sign === -1 ? "−" : ""}{money(f.value)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${f.sign === -1 ? "bg-destructive/70" : f.sign === 1 ? "bg-success/70" : "bg-primary/50"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 rounded-lg bg-primary/10 border border-primary/20 p-3 flex items-center justify-between">
            <span className="text-xs font-heading font-bold uppercase tracking-wide">Efectivo esperado en caja</span>
            <span className="font-heading font-bold text-lg text-primary">{money(summary.expected_cash)}</span>
          </div>
        </div>

        <div className="bg-card rounded-xl border p-4 space-y-3">
          <h3 className="font-heading font-semibold text-sm">Cobros sin efecto en caja</h3>
          {nonCash.map((n) => (
            <div key={n.label} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5"><n.icon className="h-3.5 w-3.5" /> {n.label}</span>
              <span className="text-xs font-heading font-bold">{money(n.value)}</span>
            </div>
          ))}
          <div className="border-t pt-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Ventas totales · {summary.transactions} tickets</span>
            <span className="font-heading font-bold">{money(summary.total_sales)}</span>
          </div>
        </div>
      </div>

      {/* Cobros de deudas del turno (NO son ventas nuevas) */}
      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="font-heading font-semibold text-sm flex items-center gap-2">
            <HandCoins className="h-4 w-4 text-primary" /> Cobros de deudas y pagos ({collections.length})
          </h3>
          <span className="text-[11px] text-muted-foreground">Reducen la deuda, no se cuentan como venta</span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="text-xs">Hora</TableHead>
              <TableHead className="text-xs">Tipo</TableHead>
              <TableHead className="text-xs">Contraparte</TableHead>
              <TableHead className="text-xs">Método</TableHead>
              <TableHead className="text-xs text-right">Monto</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {collections.map((c) => {
                const isIn = c.direction === "in";
                return (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs">{format(new Date(c.created_at), "dd/MM HH:mm")}</TableCell>
                    <TableCell>
                      <Badge variant={isIn ? "default" : "destructive"} className="text-[10px]">
                        {isIn ? "Cobro" : "Pago"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{c.party_name || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.method}</TableCell>
                    <TableCell className={`text-xs text-right font-bold ${isIn ? "text-success" : "text-destructive"}`}>
                      {isIn ? "+" : "−"}{money(c.amount_in_base ?? c.amount)}
                    </TableCell>
                  </TableRow>
                );
              })}
              {collections.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">Sin cobros de deudas en este turno</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Movimientos con trazabilidad contable */}
      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="font-heading font-semibold text-sm">Movimientos de caja ({movements.length})</h3>
          <span className="text-[11px] text-muted-foreground">Cada movimiento está contabilizado</span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="text-xs">Hora</TableHead>
              <TableHead className="text-xs">Tipo</TableHead>
              <TableHead className="text-xs">Concepto contable</TableHead>
              <TableHead className="text-xs">Justificación</TableHead>
              <TableHead className="text-xs text-right">Monto</TableHead>
              <TableHead className="text-xs text-right">Asiento</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {movements.map((m) => {
                const isIn = m.movement_type === "in";
                return (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs">{format(new Date(m.created_at), "dd/MM HH:mm")}</TableCell>
                    <TableCell>
                      <Badge variant={isIn ? "default" : "destructive"} className="text-[10px] gap-1">
                        {isIn ? <ArrowDownCircle className="h-2.5 w-2.5" /> : <ArrowUpCircle className="h-2.5 w-2.5" />}
                        {isIn ? "Ingreso" : "Egreso"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{cashCategoryLabel(m.category)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">{m.reason || "—"}</TableCell>
                    <TableCell className={`text-xs text-right font-bold ${isIn ? "text-success" : "text-destructive"}`}>
                      {isIn ? "+" : "−"}{money(m.amount_in_base ?? m.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {m.journal_entry_id ? (
                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => nav(`/contabilidad?entry=${m.journal_entry_id}`)}>
                          <BookOpenCheck className="h-3 w-3 text-success" /> {String(m.journal_entry_id).slice(0, 8)}
                        </Button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {movements.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">Sin movimientos de caja registrados</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
