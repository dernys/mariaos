import { AppLayout } from "@/components/AppLayout";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Banknote, ArrowUpRight, ArrowDownRight, Link2, EyeOff, CheckCircle2, Calendar } from "lucide-react";
import { format } from "date-fns";

interface BankAccount { id: string; name: string; bank_name: string | null; account_number: string | null; currency: string; current_balance: number; is_active: boolean; }
interface BankTx { id: string; bank_account_id: string; transaction_date: string; description: string | null; reference: string | null; amount: number; direction: string; status: string; matched_payment_id: string | null; }
interface AccountPayment { id: string; amount_in_base: number; direction: string; method: string; party_type: string; created_at: string; notes: string | null; }
interface Forecast { id: string; due_date: string; direction: string; category: string | null; description: string | null; amount: number; currency: string; status: string; }

export default function Tesoreria() {
  const tenantId = useTenant();
  const { toast } = useToast();
  const [tab, setTab] = useState("cuentas");
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [txs, setTxs] = useState<BankTx[]>([]);
  const [payments, setPayments] = useState<AccountPayment[]>([]);
  const [forecast, setForecast] = useState<Forecast[]>([]);
  const [openNewAcc, setOpenNewAcc] = useState(false);
  const [openNewTx, setOpenNewTx] = useState(false);
  const [openNewFc, setOpenNewFc] = useState(false);
  const [matchTx, setMatchTx] = useState<BankTx | null>(null);

  const [accForm, setAccForm] = useState({ name: "", bank_name: "", account_number: "", currency: "CUP" });
  const [txForm, setTxForm] = useState({ bank_account_id: "", transaction_date: format(new Date(), "yyyy-MM-dd"), description: "", reference: "", amount: "", direction: "in" });
  const [fcForm, setFcForm] = useState({ due_date: format(new Date(), "yyyy-MM-dd"), direction: "out", category: "", description: "", amount: "", currency: "CUP" });

  const load = async () => {
    if (!tenantId) return;
    const [a, t, p, f] = await Promise.all([
      supabase.from("bank_accounts" as any).select("*").eq("tenant_id", tenantId).order("name"),
      supabase.from("bank_transactions" as any).select("*").eq("tenant_id", tenantId).order("transaction_date", { ascending: false }).limit(200),
      supabase.from("account_payments").select("id, amount_in_base, direction, method, party_type, created_at, notes").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
      supabase.from("treasury_forecast" as any).select("*").eq("tenant_id", tenantId).order("due_date"),
    ]);
    setAccounts((a.data as any) || []);
    setTxs((t.data as any) || []);
    setPayments((p.data as any) || []);
    setForecast((f.data as any) || []);
  };
  useEffect(() => { load(); }, [tenantId]);

  const totalBalance = useMemo(() => accounts.reduce((s, a) => s + Number(a.current_balance || 0), 0), [accounts]);
  const unmatched = txs.filter((t) => t.status === "unmatched").length;
  const next30 = forecast.filter((f) => f.status === "pending" && new Date(f.due_date) <= new Date(Date.now() + 30 * 86400000));
  const upcomingIn = next30.filter((f) => f.direction === "in").reduce((s, f) => s + Number(f.amount), 0);
  const upcomingOut = next30.filter((f) => f.direction === "out").reduce((s, f) => s + Number(f.amount), 0);

  const createAccount = async () => {
    if (!accForm.name) return;
    const { error } = await supabase.from("bank_accounts" as any).insert({ ...accForm, tenant_id: tenantId });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setOpenNewAcc(false); setAccForm({ name: "", bank_name: "", account_number: "", currency: "CUP" }); load();
  };
  const createTx = async () => {
    if (!txForm.bank_account_id || !txForm.amount) return;
    const { error } = await supabase.from("bank_transactions" as any).insert({
      tenant_id: tenantId, bank_account_id: txForm.bank_account_id, transaction_date: txForm.transaction_date,
      description: txForm.description, reference: txForm.reference, amount: parseFloat(txForm.amount), direction: txForm.direction,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setOpenNewTx(false); load();
  };
  const createFc = async () => {
    if (!fcForm.amount) return;
    const { error } = await supabase.from("treasury_forecast" as any).insert({ ...fcForm, amount: parseFloat(fcForm.amount), tenant_id: tenantId });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setOpenNewFc(false); load();
  };
  const doMatch = async (paymentId: string) => {
    if (!matchTx) return;
    const { error } = await (supabase as any).rpc("match_bank_transaction", { p_tx_id: matchTx.id, p_payment_id: paymentId });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Conciliado" }); setMatchTx(null); load();
  };
  const ignoreTx = async (id: string) => {
    await (supabase as any).rpc("ignore_bank_transaction", { p_tx_id: id });
    load();
  };

  return (
    <AppLayout>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Tesorería</h1>
            <p className="text-sm text-muted-foreground">Bancos, conciliación y proyección de flujo de caja</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><div className="text-xs text-muted-foreground">Saldo total</div><div className="text-xl font-bold">{totalBalance.toFixed(2)}</div></div><Banknote className="h-5 w-5 text-primary" /></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><div className="text-xs text-muted-foreground">Sin conciliar</div><div className="text-xl font-bold">{unmatched}</div></div><Link2 className="h-5 w-5 text-warning" /></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><div className="text-xs text-muted-foreground">Cobros 30d</div><div className="text-xl font-bold text-success">{upcomingIn.toFixed(2)}</div></div><ArrowDownRight className="h-5 w-5 text-success" /></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><div className="text-xs text-muted-foreground">Pagos 30d</div><div className="text-xl font-bold text-destructive">{upcomingOut.toFixed(2)}</div></div><ArrowUpRight className="h-5 w-5 text-destructive" /></div></CardContent></Card>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="cuentas">Cuentas</TabsTrigger>
            <TabsTrigger value="movimientos">Movimientos {unmatched > 0 && <Badge variant="secondary" className="ml-2">{unmatched}</Badge>}</TabsTrigger>
            <TabsTrigger value="forecast">Proyección</TabsTrigger>
          </TabsList>

          <TabsContent value="cuentas" className="space-y-3">
            <div className="flex justify-end"><Button onClick={() => setOpenNewAcc(true)} size="sm" className="gap-1"><Plus className="h-4 w-4" /> Nueva cuenta</Button></div>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Banco</TableHead><TableHead>Cuenta</TableHead><TableHead>Moneda</TableHead><TableHead className="text-right">Saldo</TableHead></TableRow></TableHeader>
                <TableBody>
                  {accounts.map((a) => (
                    <TableRow key={a.id}><TableCell className="font-medium">{a.name}</TableCell><TableCell>{a.bank_name || "—"}</TableCell><TableCell className="font-mono text-xs">{a.account_number || "—"}</TableCell><TableCell>{a.currency}</TableCell><TableCell className="text-right font-mono">{Number(a.current_balance).toFixed(2)}</TableCell></TableRow>
                  ))}
                  {accounts.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">Sin cuentas bancarias</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="movimientos" className="space-y-3">
            <div className="flex justify-end"><Button onClick={() => setOpenNewTx(true)} size="sm" className="gap-1" disabled={accounts.length === 0}><Plus className="h-4 w-4" /> Nuevo movimiento</Button></div>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Descripción</TableHead><TableHead>Ref</TableHead><TableHead className="text-right">Monto</TableHead><TableHead>Estado</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {txs.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{format(new Date(t.transaction_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{t.description || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{t.reference || "—"}</TableCell>
                      <TableCell className={`text-right font-mono ${t.direction === "in" ? "text-success" : "text-destructive"}`}>{t.direction === "in" ? "+" : "-"}{Number(t.amount).toFixed(2)}</TableCell>
                      <TableCell><Badge variant={t.status === "matched" ? "default" : t.status === "ignored" ? "outline" : "secondary"}>{t.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        {t.status === "unmatched" && <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => setMatchTx(t)}><Link2 className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => ignoreTx(t.id)}><EyeOff className="h-3.5 w-3.5" /></Button>
                        </div>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {txs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Sin movimientos</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="forecast" className="space-y-3">
            <div className="flex justify-end"><Button onClick={() => setOpenNewFc(true)} size="sm" className="gap-1"><Plus className="h-4 w-4" /> Programar</Button></div>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Vence</TableHead><TableHead>Tipo</TableHead><TableHead>Categoría</TableHead><TableHead>Descripción</TableHead><TableHead className="text-right">Monto</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
                <TableBody>
                  {forecast.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell>{format(new Date(f.due_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell><Badge variant={f.direction === "in" ? "default" : "destructive"}>{f.direction === "in" ? "Cobro" : "Pago"}</Badge></TableCell>
                      <TableCell>{f.category || "—"}</TableCell>
                      <TableCell>{f.description || "—"}</TableCell>
                      <TableCell className="text-right font-mono">{Number(f.amount).toFixed(2)} {f.currency}</TableCell>
                      <TableCell><Badge variant="outline">{f.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {forecast.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Sin proyecciones</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
        </Tabs>

        {/* New Account */}
        <Dialog open={openNewAcc} onOpenChange={setOpenNewAcc}>
          <DialogContent>
            <DialogHeader><DialogTitle>Nueva cuenta bancaria</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nombre</Label><Input value={accForm.name} onChange={(e) => setAccForm({ ...accForm, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Banco</Label><Input value={accForm.bank_name} onChange={(e) => setAccForm({ ...accForm, bank_name: e.target.value })} /></div>
                <div><Label>Moneda</Label><Input value={accForm.currency} onChange={(e) => setAccForm({ ...accForm, currency: e.target.value })} /></div>
              </div>
              <div><Label>N° cuenta</Label><Input value={accForm.account_number} onChange={(e) => setAccForm({ ...accForm, account_number: e.target.value })} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpenNewAcc(false)}>Cancelar</Button><Button onClick={createAccount}>Crear</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* New Tx */}
        <Dialog open={openNewTx} onOpenChange={setOpenNewTx}>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo movimiento bancario</DialogTitle><DialogDescription>Registra una línea del extracto</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <div><Label>Cuenta</Label>
                <Select value={txForm.bank_account_id} onValueChange={(v) => setTxForm({ ...txForm, bank_account_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                  <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Fecha</Label><Input type="date" value={txForm.transaction_date} onChange={(e) => setTxForm({ ...txForm, transaction_date: e.target.value })} /></div>
                <div><Label>Tipo</Label>
                  <Select value={txForm.direction} onValueChange={(v) => setTxForm({ ...txForm, direction: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="in">Entrada</SelectItem><SelectItem value="out">Salida</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Monto</Label><Input type="number" step="0.01" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} /></div>
              <div><Label>Descripción</Label><Input value={txForm.description} onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} /></div>
              <div><Label>Referencia</Label><Input value={txForm.reference} onChange={(e) => setTxForm({ ...txForm, reference: e.target.value })} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpenNewTx(false)}>Cancelar</Button><Button onClick={createTx}>Crear</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* New Forecast */}
        <Dialog open={openNewFc} onOpenChange={setOpenNewFc}>
          <DialogContent>
            <DialogHeader><DialogTitle>Programar movimiento</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Fecha</Label><Input type="date" value={fcForm.due_date} onChange={(e) => setFcForm({ ...fcForm, due_date: e.target.value })} /></div>
                <div><Label>Tipo</Label>
                  <Select value={fcForm.direction} onValueChange={(v) => setFcForm({ ...fcForm, direction: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="in">Cobro</SelectItem><SelectItem value="out">Pago</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Monto</Label><Input type="number" step="0.01" value={fcForm.amount} onChange={(e) => setFcForm({ ...fcForm, amount: e.target.value })} /></div>
                <div><Label>Moneda</Label><Input value={fcForm.currency} onChange={(e) => setFcForm({ ...fcForm, currency: e.target.value })} /></div>
              </div>
              <div><Label>Categoría</Label><Input value={fcForm.category} onChange={(e) => setFcForm({ ...fcForm, category: e.target.value })} placeholder="alquiler, nómina, IVA..." /></div>
              <div><Label>Descripción</Label><Input value={fcForm.description} onChange={(e) => setFcForm({ ...fcForm, description: e.target.value })} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpenNewFc(false)}>Cancelar</Button><Button onClick={createFc}>Programar</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Match dialog */}
        <Dialog open={!!matchTx} onOpenChange={(o) => !o && setMatchTx(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Conciliar movimiento</DialogTitle>
              <DialogDescription>
                {matchTx && <>Monto: <b>{Number(matchTx.amount).toFixed(2)}</b> · {matchTx.description}</>}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Método</TableHead><TableHead className="text-right">Monto</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {payments.filter((p) => !matchTx || (p.direction === matchTx.direction && Math.abs(Number(p.amount_in_base) - Number(matchTx.amount)) < 0.01)).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{format(new Date(p.created_at), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{p.party_type}</TableCell>
                      <TableCell>{p.method}</TableCell>
                      <TableCell className="text-right font-mono">{Number(p.amount_in_base).toFixed(2)}</TableCell>
                      <TableCell className="text-right"><Button size="sm" onClick={() => doMatch(p.id)}><CheckCircle2 className="h-3.5 w-3.5" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
