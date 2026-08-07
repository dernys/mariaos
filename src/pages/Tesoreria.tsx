import { AppLayout } from "@/components/AppLayout";
import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
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
import { Plus, Banknote, ArrowUpRight, ArrowDownRight, Link2, EyeOff, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

interface BankAccount { id: string; name: string; bank_name: string | null; account_number: string | null; currency: string; current_balance: number; is_active: boolean; }
interface BankTx { id: string; bank_account_id: string; transaction_date: string; description: string | null; reference: string | null; amount: number; direction: string; status: string; matched_payment_id: string | null; }
interface AccountPayment { id: string; amount_in_base: number; direction: string; method: string; party_type: string; created_at: string; notes: string | null; }
interface Forecast { id: string; due_date: string; direction: string; category: string | null; description: string | null; amount: number; currency: string; status: string; }

export default function Tesoreria() {
  const { t } = useTranslation();
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

  const errTitle = t("modules.treasury.errors.generic");
  const statusLabel = (s: string) => {
    const k = `modules.treasury.statuses.${s}`;
    const v = t(k);
    return v === k ? s : v;
  };

  const createAccount = async () => {
    if (!accForm.name) return;
    const { error } = await supabase.from("bank_accounts" as any).insert({ ...accForm, tenant_id: tenantId });
    if (error) { toast({ title: errTitle, description: error.message, variant: "destructive" }); return; }
    setOpenNewAcc(false); setAccForm({ name: "", bank_name: "", account_number: "", currency: "CUP" }); load();
  };
  const createTx = async () => {
    if (!txForm.bank_account_id || !txForm.amount) return;
    const { error } = await supabase.from("bank_transactions" as any).insert({
      tenant_id: tenantId, bank_account_id: txForm.bank_account_id, transaction_date: txForm.transaction_date,
      description: txForm.description, reference: txForm.reference, amount: parseFloat(txForm.amount), direction: txForm.direction,
    });
    if (error) { toast({ title: errTitle, description: error.message, variant: "destructive" }); return; }
    setOpenNewTx(false); load();
  };
  const createFc = async () => {
    if (!fcForm.amount) return;
    const { error } = await supabase.from("treasury_forecast" as any).insert({ ...fcForm, amount: parseFloat(fcForm.amount), tenant_id: tenantId });
    if (error) { toast({ title: errTitle, description: error.message, variant: "destructive" }); return; }
    setOpenNewFc(false); load();
  };
  const doMatch = async (paymentId: string) => {
    if (!matchTx) return;
    const { error } = await (supabase as any).rpc("match_bank_transaction", { p_tx_id: matchTx.id, p_payment_id: paymentId });
    if (error) { toast({ title: errTitle, description: error.message, variant: "destructive" }); return; }
    toast({ title: t("modules.treasury.match.reconciled") }); setMatchTx(null); load();
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
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("modules.treasury.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("modules.treasury.subtitle")}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><div className="text-xs text-muted-foreground">{t("modules.treasury.stats.totalBalance")}</div><div className="text-xl font-bold">{totalBalance.toFixed(2)}</div></div><Banknote className="h-5 w-5 text-primary" /></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><div className="text-xs text-muted-foreground">{t("modules.treasury.stats.unmatched")}</div><div className="text-xl font-bold">{unmatched}</div></div><Link2 className="h-5 w-5 text-warning" /></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><div className="text-xs text-muted-foreground">{t("modules.treasury.stats.income30")}</div><div className="text-xl font-bold text-success">{upcomingIn.toFixed(2)}</div></div><ArrowDownRight className="h-5 w-5 text-success" /></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><div className="text-xs text-muted-foreground">{t("modules.treasury.stats.payments30")}</div><div className="text-xl font-bold text-destructive">{upcomingOut.toFixed(2)}</div></div><ArrowUpRight className="h-5 w-5 text-destructive" /></div></CardContent></Card>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="cuentas">{t("modules.treasury.tabs.accounts")}</TabsTrigger>
            <TabsTrigger value="movimientos">{t("modules.treasury.tabs.movements")} {unmatched > 0 && <Badge variant="secondary" className="ml-2">{unmatched}</Badge>}</TabsTrigger>
            <TabsTrigger value="forecast">{t("modules.treasury.tabs.forecast")}</TabsTrigger>
          </TabsList>

          <TabsContent value="cuentas" className="space-y-3">
            <div className="flex justify-end"><Button onClick={() => setOpenNewAcc(true)} size="sm" className="gap-1"><Plus className="h-4 w-4" /> {t("modules.treasury.actions.newAccount")}</Button></div>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>{t("modules.treasury.accounts.name")}</TableHead><TableHead>{t("modules.treasury.accounts.bank")}</TableHead><TableHead>{t("modules.treasury.accounts.account")}</TableHead><TableHead>{t("modules.treasury.accounts.currency")}</TableHead><TableHead className="text-right">{t("modules.treasury.accounts.balance")}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {accounts.map((a) => (
                    <TableRow key={a.id}><TableCell className="font-medium">{a.name}</TableCell><TableCell>{a.bank_name || "—"}</TableCell><TableCell className="font-mono text-xs">{a.account_number || "—"}</TableCell><TableCell>{a.currency}</TableCell><TableCell className="text-right font-mono">{Number(a.current_balance).toFixed(2)}</TableCell></TableRow>
                  ))}
                  {accounts.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">{t("modules.treasury.accounts.empty")}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="movimientos" className="space-y-3">
            <div className="flex justify-end"><Button onClick={() => setOpenNewTx(true)} size="sm" className="gap-1" disabled={accounts.length === 0}><Plus className="h-4 w-4" /> {t("modules.treasury.actions.newMovement")}</Button></div>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>{t("modules.treasury.movements.date")}</TableHead><TableHead>{t("modules.treasury.movements.description")}</TableHead><TableHead>{t("modules.treasury.movements.ref")}</TableHead><TableHead className="text-right">{t("modules.treasury.movements.amount")}</TableHead><TableHead>{t("modules.treasury.movements.status")}</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {txs.map((t2) => (
                    <TableRow key={t2.id}>
                      <TableCell>{format(new Date(t2.transaction_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{t2.description || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{t2.reference || "—"}</TableCell>
                      <TableCell className={`text-right font-mono ${t2.direction === "in" ? "text-success" : "text-destructive"}`}>{t2.direction === "in" ? "+" : "-"}{Number(t2.amount).toFixed(2)}</TableCell>
                      <TableCell><Badge variant={t2.status === "matched" ? "default" : t2.status === "ignored" ? "outline" : "secondary"}>{statusLabel(t2.status)}</Badge></TableCell>
                      <TableCell className="text-right">
                        {t2.status === "unmatched" && <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => setMatchTx(t2)}><Link2 className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => ignoreTx(t2.id)}><EyeOff className="h-3.5 w-3.5" /></Button>
                        </div>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {txs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">{t("modules.treasury.movements.empty")}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="forecast" className="space-y-3">
            <CashflowForecastPanel weeks={8} />
            <div className="flex justify-end"><Button onClick={() => setOpenNewFc(true)} size="sm" className="gap-1"><Plus className="h-4 w-4" /> {t("modules.treasury.actions.schedule")}</Button></div>

            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>{t("modules.treasury.forecast.due")}</TableHead><TableHead>{t("modules.treasury.forecast.type")}</TableHead><TableHead>{t("modules.treasury.forecast.category")}</TableHead><TableHead>{t("modules.treasury.forecast.description")}</TableHead><TableHead className="text-right">{t("modules.treasury.forecast.amount")}</TableHead><TableHead>{t("modules.treasury.forecast.status")}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {forecast.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell>{format(new Date(f.due_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell><Badge variant={f.direction === "in" ? "default" : "destructive"}>{f.direction === "in" ? t("modules.treasury.directions.income") : t("modules.treasury.directions.payment")}</Badge></TableCell>
                      <TableCell>{f.category || "—"}</TableCell>
                      <TableCell>{f.description || "—"}</TableCell>
                      <TableCell className="text-right font-mono">{Number(f.amount).toFixed(2)} {f.currency}</TableCell>
                      <TableCell><Badge variant="outline">{statusLabel(f.status)}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {forecast.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">{t("modules.treasury.forecast.empty")}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
        </Tabs>

        {/* New Account */}
        <Dialog open={openNewAcc} onOpenChange={setOpenNewAcc}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("modules.treasury.accounts.dialogTitle")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{t("modules.treasury.accounts.name")}</Label><Input value={accForm.name} onChange={(e) => setAccForm({ ...accForm, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>{t("modules.treasury.accounts.bank")}</Label><Input value={accForm.bank_name} onChange={(e) => setAccForm({ ...accForm, bank_name: e.target.value })} /></div>
                <div><Label>{t("modules.treasury.accounts.currency")}</Label><Input value={accForm.currency} onChange={(e) => setAccForm({ ...accForm, currency: e.target.value })} /></div>
              </div>
              <div><Label>{t("modules.treasury.accounts.accountNumber")}</Label><Input value={accForm.account_number} onChange={(e) => setAccForm({ ...accForm, account_number: e.target.value })} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpenNewAcc(false)}>{t("modules.treasury.actions.cancel")}</Button><Button onClick={createAccount}>{t("modules.treasury.actions.create")}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* New Tx */}
        <Dialog open={openNewTx} onOpenChange={setOpenNewTx}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("modules.treasury.movements.dialogTitle")}</DialogTitle><DialogDescription>{t("modules.treasury.movements.dialogDesc")}</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <div><Label>{t("modules.treasury.movements.accountLabel")}</Label>
                <Select value={txForm.bank_account_id} onValueChange={(v) => setTxForm({ ...txForm, bank_account_id: v })}>
                  <SelectTrigger><SelectValue placeholder={t("modules.treasury.movements.selectAccount")} /></SelectTrigger>
                  <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>{t("modules.treasury.movements.date")}</Label><Input type="date" value={txForm.transaction_date} onChange={(e) => setTxForm({ ...txForm, transaction_date: e.target.value })} /></div>
                <div><Label>{t("modules.treasury.movements.typeLabel")}</Label>
                  <Select value={txForm.direction} onValueChange={(v) => setTxForm({ ...txForm, direction: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="in">{t("modules.treasury.directions.in")}</SelectItem><SelectItem value="out">{t("modules.treasury.directions.out")}</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>{t("modules.treasury.movements.amount")}</Label><Input type="number" step="0.01" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} /></div>
              <div><Label>{t("modules.treasury.movements.description")}</Label><Input value={txForm.description} onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} /></div>
              <div><Label>{t("modules.treasury.movements.reference")}</Label><Input value={txForm.reference} onChange={(e) => setTxForm({ ...txForm, reference: e.target.value })} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpenNewTx(false)}>{t("modules.treasury.actions.cancel")}</Button><Button onClick={createTx}>{t("modules.treasury.actions.create")}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* New Forecast */}
        <Dialog open={openNewFc} onOpenChange={setOpenNewFc}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("modules.treasury.forecast.dialogTitle")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><Label>{t("modules.treasury.movements.date")}</Label><Input type="date" value={fcForm.due_date} onChange={(e) => setFcForm({ ...fcForm, due_date: e.target.value })} /></div>
                <div><Label>{t("modules.treasury.movements.typeLabel")}</Label>
                  <Select value={fcForm.direction} onValueChange={(v) => setFcForm({ ...fcForm, direction: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="in">{t("modules.treasury.directions.income")}</SelectItem><SelectItem value="out">{t("modules.treasury.directions.payment")}</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>{t("modules.treasury.movements.amount")}</Label><Input type="number" step="0.01" value={fcForm.amount} onChange={(e) => setFcForm({ ...fcForm, amount: e.target.value })} /></div>
                <div><Label>{t("modules.treasury.accounts.currency")}</Label><Input value={fcForm.currency} onChange={(e) => setFcForm({ ...fcForm, currency: e.target.value })} /></div>
              </div>
              <div><Label>{t("modules.treasury.forecast.category")}</Label><Input value={fcForm.category} onChange={(e) => setFcForm({ ...fcForm, category: e.target.value })} placeholder={t("modules.treasury.forecast.categoryPlaceholder")} /></div>
              <div><Label>{t("modules.treasury.forecast.description")}</Label><Input value={fcForm.description} onChange={(e) => setFcForm({ ...fcForm, description: e.target.value })} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpenNewFc(false)}>{t("modules.treasury.actions.cancel")}</Button><Button onClick={createFc}>{t("modules.treasury.actions.schedule")}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Match dialog */}
        <Dialog open={!!matchTx} onOpenChange={(o) => !o && setMatchTx(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("modules.treasury.match.title")}</DialogTitle>
              <DialogDescription>
                {matchTx && <>{t("modules.treasury.match.amount")}: <b>{Number(matchTx.amount).toFixed(2)}</b> · {matchTx.description}</>}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader><TableRow><TableHead>{t("modules.treasury.match.date")}</TableHead><TableHead>{t("modules.treasury.match.type")}</TableHead><TableHead>{t("modules.treasury.match.method")}</TableHead><TableHead className="text-right">{t("modules.treasury.match.amount")}</TableHead><TableHead></TableHead></TableRow></TableHeader>
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
