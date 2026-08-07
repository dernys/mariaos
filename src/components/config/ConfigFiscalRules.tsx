// Sprint D — Configuración del motor fiscal: catálogo por país + reglas propias.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useFiscalRules, RULE_TYPE_LABELS, APPLIES_TO_LABELS, type FiscalRule } from "@/hooks/useFiscalRules";
import { usePermissions } from "@/hooks/usePermissions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe, Plus, Scale, Trash2, Edit2 } from "lucide-react";
import { toast } from "sonner";

interface TenantRule {
  id: string;
  code: string;
  name: string;
  rule_type: string;
  rate: number;
  base: string;
  applies_to: string;
  is_default: boolean;
  is_active: boolean;
}

const EMPTY = {
  code: "",
  name: "",
  rule_type: "vat",
  rate: "0",
  base: "net",
  applies_to: "sale",
  is_default: false,
  is_active: true,
};

export function ConfigFiscalRules() {
  const tenantId = useTenant();
  const qc = useQueryClient();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const effective = useFiscalRules();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const tenantInfo = useQuery({
    queryKey: ["tenant-country", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("country_code, name").eq("id", tenantId!).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const ownRules = useQuery({
    queryKey: ["fiscal-rules-own", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<TenantRule[]> => {
      const { data, error } = await supabase
        .from("fiscal_rules")
        .select("id, code, name, rule_type, rate, base, applies_to, is_default, is_active")
        .eq("tenant_id", tenantId!)
        .order("code");
      if (error) throw new Error(error.message);
      return (data ?? []) as TenantRule[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["fiscal-rules"] });
    qc.invalidateQueries({ queryKey: ["fiscal-rules-own"] });
    qc.invalidateQueries({ queryKey: ["tax-breakdown"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Sin empresa activa");
      const payload = {
        tenant_id: tenantId,
        country_code: tenantInfo.data?.country_code ?? "CU",
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        rule_type: form.rule_type,
        rate: Number(form.rate) || 0,
        base: form.base,
        applies_to: form.applies_to,
        is_default: form.is_default,
        is_active: form.is_active,
      };
      if (!payload.code || !payload.name) throw new Error("Código y nombre son obligatorios");
      const q = editingId
        ? supabase.from("fiscal_rules").update(payload).eq("id", editingId)
        : supabase.from("fiscal_rules").insert(payload);
      const { error } = await q;
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(editingId ? "Regla actualizada" : "Regla creada");
      setOpen(false);
      setEditingId(null);
      setForm({ ...EMPTY });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fiscal_rules").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Regla eliminada"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setEditingId(null); setForm({ ...EMPTY }); setOpen(true); };
  const openEdit = (r: TenantRule) => {
    setEditingId(r.id);
    setForm({
      code: r.code, name: r.name, rule_type: r.rule_type, rate: String(r.rate),
      base: r.base, applies_to: r.applies_to, is_default: r.is_default, is_active: r.is_active,
    });
    setOpen(true);
  };

  const rateLabel = (rate: number) => `${rate > 0 ? "" : ""}${rate}%`;
  const sourceBadge = (r: FiscalRule) =>
    r.source === "tenant"
      ? <Badge variant="default" className="text-[10px]">Propia</Badge>
      : <Badge variant="secondary" className="text-[10px]">Catálogo</Badge>;

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Scale className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Motor fiscal</h3>
              <p className="text-xs text-muted-foreground max-w-xl">
                Las reglas se resuelven en el servidor: primero las de tu empresa, después el catálogo
                del país. Nada está codificado en la aplicación.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1 text-xs">
              <Globe className="h-3 w-3" /> {tenantInfo.data?.country_code ?? "—"}
            </Badge>
            {canCreate("configuracion") && (
              <Button size="sm" onClick={openNew} className="gap-1">
                <Plus className="h-4 w-4" /> Nueva regla
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead className="hidden md:table-cell">Tipo</TableHead>
                <TableHead className="hidden sm:table-cell">Ámbito</TableHead>
                <TableHead className="text-right">Tasa</TableHead>
                <TableHead>Origen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(effective.data ?? []).map((r) => (
                <TableRow key={`${r.code}-${r.applies_to}`}>
                  <TableCell className="font-mono text-xs">{r.code}</TableCell>
                  <TableCell className="text-sm">
                    {r.name}
                    {r.is_default && <Badge variant="outline" className="ml-2 text-[10px]">por defecto</Badge>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                    {RULE_TYPE_LABELS[r.rule_type] ?? r.rule_type}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-xs">{APPLIES_TO_LABELS[r.applies_to] ?? r.applies_to}</TableCell>
                  <TableCell className={`text-right font-medium ${Number(r.rate) < 0 ? "text-destructive" : ""}`}>
                    {rateLabel(Number(r.rate))}
                  </TableCell>
                  <TableCell>{sourceBadge(r)}</TableCell>
                </TableRow>
              ))}
              {!effective.isLoading && (effective.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                    Sin reglas vigentes para este país.
                  </TableCell>
                </TableRow>
              )}
              {effective.isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">Cargando…</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h4 className="text-sm font-semibold">Reglas propias de la empresa</h4>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead className="text-right">Tasa</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(ownRules.data ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.code}</TableCell>
                  <TableCell className="text-sm">{r.name}</TableCell>
                  <TableCell className="text-right">{r.rate}%</TableCell>
                  <TableCell>
                    <Badge variant={r.is_active ? "default" : "secondary"} className="text-[10px]">
                      {r.is_active ? "Activa" : "Inactiva"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {canEdit("configuracion") && (
                        <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-muted transition-colors">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canDelete("configuracion") && (
                        <button onClick={() => remove.mutate(r.id)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(ownRules.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                    Aún no has creado reglas propias. Se aplica el catálogo del país.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Editar regla fiscal" : "Nueva regla fiscal"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Código</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="ES_IVA_GEN" />
            </div>
            <div>
              <Label>Nombre</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="IVA general" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.rule_type} onValueChange={(v) => setForm({ ...form, rule_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(RULE_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ámbito</Label>
              <Select value={form.applies_to} onValueChange={(v) => setForm({ ...form, applies_to: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(APPLIES_TO_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tasa (%) · negativa para retenciones</Label>
              <Input type="number" step="0.0001" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
            </div>
            <div>
              <Label>Base de cálculo</Label>
              <Select value={form.base} onValueChange={(v) => setForm({ ...form, base: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="net">Sobre base imponible</SelectItem>
                  <SelectItem value="gross">Sobre importe bruto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border p-2">
              <Label className="text-xs">Aplicar por defecto</Label>
              <Switch checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-2">
              <Label className="text-xs">Activa</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
