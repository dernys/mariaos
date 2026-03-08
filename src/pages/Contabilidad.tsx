import { AppLayout } from "@/components/AppLayout";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Edit2, Trash2, BookOpen, ArrowUpDown, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { format } from "date-fns";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  balance: number;
  is_active: boolean;
}

interface JournalEntry {
  id: string;
  entry_number: string;
  date: string;
  description: string | null;
  status: string;
  created_at: string;
}

interface EntryLine {
  id: string;
  account_id: string;
  debit: number;
  credit: number;
  description: string | null;
}

const ACCOUNT_TYPES = [
  { value: "asset", label: "Activo", color: "text-primary" },
  { value: "liability", label: "Pasivo", color: "text-destructive" },
  { value: "equity", label: "Capital", color: "text-muted-foreground" },
  { value: "income", label: "Ingreso", color: "text-success" },
  { value: "expense", label: "Gasto", color: "text-warning" },
];

const typeLabel = (t: string) => ACCOUNT_TYPES.find((a) => a.value === t)?.label || t;
const typeColor = (t: string) => ACCOUNT_TYPES.find((a) => a.value === t)?.color || "";

const Contabilidad = () => {
  const { user } = useAuth();
  const tenantId = useTenant();
  const { toast } = useToast();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Account dialog
  const [accDialogOpen, setAccDialogOpen] = useState(false);
  const [editingAcc, setEditingAcc] = useState<Account | null>(null);
  const [accForm, setAccForm] = useState({ code: "", name: "", type: "asset" });

  // Entry dialog
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [entryForm, setEntryForm] = useState({ description: "", date: new Date().toISOString().slice(0, 10) });
  const [entryLines, setEntryLines] = useState<{ account_id: string; debit: string; credit: string; description: string }[]>([
    { account_id: "", debit: "", credit: "", description: "" },
    { account_id: "", debit: "", credit: "", description: "" },
  ]);

  // Detail
  const [detailEntry, setDetailEntry] = useState<JournalEntry | null>(null);
  const [detailLines, setDetailLines] = useState<EntryLine[]>([]);

  const fetchData = async () => {
    const [accRes, entRes] = await Promise.all([
      supabase.from("accounting_accounts").select("*").order("code"),
      supabase.from("journal_entries").select("*").order("date", { ascending: false }).limit(100),
    ]);
    if (accRes.data) setAccounts(accRes.data as Account[]);
    if (entRes.data) setEntries(entRes.data as JournalEntry[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // ---- Accounts ----
  const openNewAcc = () => { setEditingAcc(null); setAccForm({ code: "", name: "", type: "asset" }); setAccDialogOpen(true); };
  const openEditAcc = (a: Account) => { setEditingAcc(a); setAccForm({ code: a.code, name: a.name, type: a.type }); setAccDialogOpen(true); };

  const saveAccount = async () => {
    if (!accForm.code.trim() || !accForm.name.trim()) { toast({ title: "Error", description: "Código y nombre requeridos", variant: "destructive" }); return; }
    const payload = { code: accForm.code.trim(), name: accForm.name.trim(), type: accForm.type, tenant_id: tenantId };
    if (editingAcc) {
      await supabase.from("accounting_accounts").update(payload).eq("id", editingAcc.id);
    } else {
      await supabase.from("accounting_accounts").insert(payload);
    }
    toast({ title: editingAcc ? "Cuenta actualizada" : "Cuenta creada" });
    setAccDialogOpen(false);
    fetchData();
  };

  const deleteAccount = async (id: string) => {
    await supabase.from("accounting_accounts").delete().eq("id", id);
    toast({ title: "Cuenta eliminada" });
    fetchData();
  };

  // ---- Entries ----
  const openNewEntry = () => {
    setEntryForm({ description: "", date: new Date().toISOString().slice(0, 10) });
    setEntryLines([
      { account_id: "", debit: "", credit: "", description: "" },
      { account_id: "", debit: "", credit: "", description: "" },
    ]);
    setEntryDialogOpen(true);
  };

  const addLine = () => setEntryLines([...entryLines, { account_id: "", debit: "", credit: "", description: "" }]);
  const removeLine = (idx: number) => setEntryLines(entryLines.filter((_, i) => i !== idx));
  const updateLine = (idx: number, field: string, value: string) => {
    const updated = [...entryLines];
    updated[idx] = { ...updated[idx], [field]: value };
    setEntryLines(updated);
  };

  const totalDebits = entryLines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredits = entryLines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

  const saveEntry = async () => {
    if (!isBalanced) { toast({ title: "Error", description: "Los débitos y créditos deben ser iguales", variant: "destructive" }); return; }
    if (totalDebits === 0) { toast({ title: "Error", description: "Agrega al menos una línea con monto", variant: "destructive" }); return; }

    const entryNumber = `JE-${Date.now().toString(36).toUpperCase()}`;
    const { data: entry, error } = await supabase.from("journal_entries").insert({
      entry_number: entryNumber,
      date: entryForm.date,
      description: entryForm.description || null,
      status: "posted",
      tenant_id: tenantId,
      created_by: user?.id,
    }).select("id").single();

    if (error || !entry) { toast({ title: "Error", description: error?.message || "Error creando asiento", variant: "destructive" }); return; }

    const lines = entryLines
      .filter((l) => l.account_id && ((parseFloat(l.debit) || 0) > 0 || (parseFloat(l.credit) || 0) > 0))
      .map((l) => ({
        entry_id: entry.id,
        account_id: l.account_id,
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
        description: l.description || null,
      }));

    await supabase.from("journal_entry_lines").insert(lines);

    // Update account balances
    for (const l of lines) {
      const acc = accounts.find((a) => a.id === l.account_id);
      if (acc) {
        const isDebitNature = acc.type === "asset" || acc.type === "expense";
        const delta = isDebitNature ? l.debit - l.credit : l.credit - l.debit;
        await supabase.from("accounting_accounts").update({ balance: acc.balance + delta }).eq("id", acc.id);
      }
    }

    toast({ title: "Asiento contable registrado" });
    setEntryDialogOpen(false);
    fetchData();
  };

  const openEntryDetail = async (e: JournalEntry) => {
    setDetailEntry(e);
    const { data } = await supabase.from("journal_entry_lines").select("*").eq("entry_id", e.id);
    setDetailLines((data as EntryLine[]) || []);
  };

  const getAccountName = (id: string) => {
    const a = accounts.find((a) => a.id === id);
    return a ? `${a.code} - ${a.name}` : "—";
  };

  // Summaries
  const totalAssets = accounts.filter((a) => a.type === "asset").reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = accounts.filter((a) => a.type === "liability").reduce((s, a) => s + a.balance, 0);
  const totalIncome = accounts.filter((a) => a.type === "income").reduce((s, a) => s + a.balance, 0);
  const totalExpenses = accounts.filter((a) => a.type === "expense").reduce((s, a) => s + a.balance, 0);

  return (
    <AppLayout title="Contabilidad">
      <div className="space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Activos</p>
                <p className="font-heading font-bold text-lg">${totalAssets.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                <ArrowUpDown className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Pasivos</p>
                <p className="font-heading font-bold text-lg">${totalLiabilities.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Ingresos</p>
                <p className="font-heading font-bold text-lg">${totalIncome.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Gastos</p>
                <p className="font-heading font-bold text-lg">${totalExpenses.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="accounts" className="space-y-4">
          <TabsList>
            <TabsTrigger value="accounts">Plan de Cuentas</TabsTrigger>
            <TabsTrigger value="entries">Asientos Contables</TabsTrigger>
          </TabsList>

          {/* Accounts Tab */}
          <TabsContent value="accounts" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{accounts.length} cuentas</p>
              <Button size="sm" onClick={openNewAcc} className="gap-1 text-xs gradient-brand text-primary-foreground">
                <Plus className="h-3.5 w-3.5" /> Nueva Cuenta
              </Button>
            </div>

            <div className="bg-card rounded-xl shadow-card border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Código</TableHead>
                    <TableHead className="text-xs">Nombre</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Saldo</TableHead>
                    <TableHead className="text-xs w-20">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs font-heading font-semibold">{a.code}</TableCell>
                      <TableCell className="text-xs font-medium">{a.name}</TableCell>
                      <TableCell><Badge variant="outline" className={`text-[10px] ${typeColor(a.type)}`}>{typeLabel(a.type)}</Badge></TableCell>
                      <TableCell className="text-xs font-heading font-bold">${a.balance.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <button onClick={() => openEditAcc(a)} className="p-1.5 rounded hover:bg-muted transition-colors"><Edit2 className="h-3.5 w-3.5" /></button>
                          <button onClick={() => deleteAccount(a.id)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {accounts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-xs">
                        <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        No hay cuentas contables
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Entries Tab */}
          <TabsContent value="entries" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{entries.length} asientos</p>
              <Button size="sm" onClick={openNewEntry} disabled={accounts.length === 0} className="gap-1 text-xs gradient-brand text-primary-foreground">
                <Plus className="h-3.5 w-3.5" /> Nuevo Asiento
              </Button>
            </div>

            <div className="bg-card rounded-xl shadow-card border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Número</TableHead>
                    <TableHead className="text-xs">Fecha</TableHead>
                    <TableHead className="text-xs">Descripción</TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.id} className="cursor-pointer hover:bg-muted/20" onClick={() => openEntryDetail(e)}>
                      <TableCell className="text-xs font-heading font-semibold">{e.entry_number}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{format(new Date(e.date), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="text-xs">{e.description || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={e.status === "posted" ? "default" : "secondary"} className="text-[10px]">
                          {e.status === "posted" ? "Registrado" : e.status === "draft" ? "Borrador" : e.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {entries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-xs">Sin asientos contables</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Account Dialog */}
      <Dialog open={accDialogOpen} onOpenChange={setAccDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingAcc ? "Editar" : "Nueva"} Cuenta Contable</DialogTitle>
            <DialogDescription>Plan de cuentas</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Código *</Label><Input value={accForm.code} onChange={(e) => setAccForm({ ...accForm, code: e.target.value })} placeholder="1100" /></div>
              <div>
                <Label>Tipo *</Label>
                <Select value={accForm.type} onValueChange={(v) => setAccForm({ ...accForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Nombre *</Label><Input value={accForm.name} onChange={(e) => setAccForm({ ...accForm, name: e.target.value })} placeholder="Caja" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveAccount} className="gradient-brand text-primary-foreground">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Entry Dialog */}
      <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Asiento Contable</DialogTitle>
            <DialogDescription>Los débitos y créditos deben ser iguales</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Fecha</Label><Input type="date" value={entryForm.date} onChange={(e) => setEntryForm({ ...entryForm, date: e.target.value })} /></div>
              <div><Label>Descripción</Label><Input value={entryForm.description} onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })} /></div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-heading font-semibold">Líneas</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLine} className="text-xs gap-1"><Plus className="h-3 w-3" /> Línea</Button>
              </div>

              {entryLines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 bg-muted/40 rounded-lg p-2 items-end">
                  <div className="col-span-5">
                    <Label className="text-[10px]">Cuenta</Label>
                    <Select value={line.account_id} onValueChange={(v) => updateLine(idx, "account_id", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px]">Débito</Label>
                    <Input type="number" className="h-8 text-xs" value={line.debit} onChange={(e) => updateLine(idx, "debit", e.target.value)} placeholder="0" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px]">Crédito</Label>
                    <Input type="number" className="h-8 text-xs" value={line.credit} onChange={(e) => updateLine(idx, "credit", e.target.value)} placeholder="0" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px]">Nota</Label>
                    <Input className="h-8 text-xs" value={line.description} onChange={(e) => updateLine(idx, "description", e.target.value)} />
                  </div>
                  <div className="col-span-1">
                    {entryLines.length > 2 && (
                      <button onClick={() => removeLine(idx)} className="p-1 text-destructive hover:bg-destructive/10 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                </div>
              ))}

              <div className="flex justify-between text-xs bg-muted/60 rounded-lg p-3">
                <span>Débitos: <strong className="font-heading">${totalDebits.toLocaleString()}</strong></span>
                <span>Créditos: <strong className="font-heading">${totalCredits.toLocaleString()}</strong></span>
                <Badge variant={isBalanced ? "default" : "destructive"} className="text-[10px]">{isBalanced ? "Balanceado ✓" : "No balanceado"}</Badge>
              </div>
            </div>

            <Button onClick={saveEntry} disabled={!isBalanced || totalDebits === 0} className="w-full gradient-brand text-primary-foreground font-heading font-semibold">
              Registrar Asiento
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Entry Detail Dialog */}
      <Dialog open={!!detailEntry} onOpenChange={() => setDetailEntry(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Asiento {detailEntry?.entry_number}</DialogTitle>
            <DialogDescription>{detailEntry?.description || "Sin descripción"} · {detailEntry?.date && format(new Date(detailEntry.date), "dd/MM/yyyy")}</DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Cuenta</TableHead>
                <TableHead className="text-xs text-right">Débito</TableHead>
                <TableHead className="text-xs text-right">Crédito</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detailLines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs">{getAccountName(l.account_id)}</TableCell>
                  <TableCell className="text-xs text-right font-heading font-semibold">{l.debit > 0 ? `$${l.debit.toLocaleString()}` : ""}</TableCell>
                  <TableCell className="text-xs text-right font-heading font-semibold">{l.credit > 0 ? `$${l.credit.toLocaleString()}` : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Contabilidad;
