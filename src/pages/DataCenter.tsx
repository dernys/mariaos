import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive, CheckCircle2, Clock, Copy, Database, Download, HardDrive, History, Loader2, RefreshCw,
  ShieldCheck, Trash2, Upload, XCircle,
} from "lucide-react";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/hooks/useTenantContext";
import { usePermissions } from "@/hooks/usePermissions";
import { DataImportWizard } from "@/components/datacenter/DataImportWizard";
import {
  EXPORT_ONLY_ENTITIES, callDataCenter, downloadFullTemplate, downloadRows, formsForBusiness,
} from "@/lib/dataCenter";

const fmtBytes = (n?: number | null) => {
  const v = Number(n ?? 0);
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / 1024 / 1024).toFixed(2)} MB`;
};
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" }) : "—");

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default", failed: "destructive", processing: "secondary", committing: "secondary",
  validating: "secondary", pending: "outline", corrupt: "destructive",
};

const KIND_LABEL: Record<string, string> = {
  import: "Importación", export: "Exportación", backup: "Copia de seguridad",
  restore: "Restauración", clone: "Clonación", delete: "Borrado masivo",
};

export default function DataCenter() {
  const { toast } = useToast();
  const { tenantId, tenant, businessType, allTenants } = useTenantContext();
  const { can } = usePermissions();
  const canEdit = can("data_center", "edit");

  const forms = useMemo(() => formsForBusiness(businessType), [businessType]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [backups, setBackups] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // export state
  const [exportEntity, setExportEntity] = useState(forms[0]?.key ?? "products");
  const [exportFormat, setExportFormat] = useState<"xlsx" | "csv" | "json">("xlsx");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // backup / clone state
  const [label, setLabel] = useState("");
  const [cloneTarget, setCloneTarget] = useState("");
  const [confirmRestore, setConfirmRestore] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [d, b, h] = await Promise.all([
        callDataCenter({ action: "dashboard", tenant_id: tenantId }),
        callDataCenter({ action: "backup_list", tenant_id: tenantId }),
        callDataCenter({ action: "history", tenant_id: tenantId }),
      ]);
      setDashboard(d);
      setBackups(b.backups ?? []);
      setHistory(h.operations ?? []);
    } catch (e) {
      toast({ title: "No se pudo cargar el Data Center", description: (e as Error).message, variant: "destructive" });
    }
    setLoading(false);
  }, [tenantId, toast]);

  useEffect(() => { load(); }, [load]);

  const runExport = async () => {
    setBusy("export");
    try {
      const res = await callDataCenter({
        action: "export", entity: exportEntity, tenant_id: tenantId,
        from: from || undefined, to: to || undefined, format: exportFormat,
      });
      if (!res.rows?.length) toast({ title: "Sin datos", description: "No hay registros para los filtros seleccionados." });
      downloadRows(res.rows ?? [], `${exportEntity}-${new Date().toISOString().slice(0, 10)}`, exportFormat);
      load();
    } catch (e) {
      toast({ title: "Error al exportar", description: (e as Error).message, variant: "destructive" });
    }
    setBusy(null);
  };

  const createBackup = async () => {
    setBusy("backup");
    try {
      const res = await callDataCenter({ action: "backup_create", tenant_id: tenantId, label: label || undefined });
      toast({ title: "Copia creada", description: `${res.backup?.record_count ?? 0} registros · ${fmtBytes(res.backup?.size_bytes)}` });
      setLabel("");
      load();
    } catch (e) {
      toast({ title: "Error al crear la copia", description: (e as Error).message, variant: "destructive" });
    }
    setBusy(null);
  };

  const act = async (action: string, backup: any, extra: Record<string, unknown> = {}) => {
    setBusy(`${action}:${backup.id}`);
    try {
      const res = await callDataCenter({ action, tenant_id: tenantId, backup_id: backup.id, ...extra });
      if (action === "backup_download" && res.url) window.open(res.url, "_blank");
      if (action === "backup_verify") {
        toast({
          title: res.valid ? "Integridad verificada" : "Copia corrupta",
          description: res.valid ? "El checksum coincide con el original." : "El checksum no coincide; no uses esta copia.",
          variant: res.valid ? "default" : "destructive",
        });
      }
      if (action === "backup_restore") toast({ title: "Restauración completada", description: `${res.restored} registros restaurados.` });
      if (action === "backup_delete") toast({ title: "Copia eliminada" });
      load();
    } catch (e) {
      toast({ title: "Operación fallida", description: (e as Error).message, variant: "destructive" });
    }
    setBusy(null);
  };

  const runClone = async () => {
    if (!cloneTarget) return;
    setBusy("clone");
    try {
      const res = await callDataCenter({ action: "clone", tenant_id: tenantId, target_tenant_id: cloneTarget });
      toast({ title: "Clonación completada", description: `${res.copied} registros maestros copiados.` });
      load();
    } catch (e) {
      toast({ title: "Error al clonar", description: (e as Error).message, variant: "destructive" });
    }
    setBusy(null);
  };

  const stats = [
    { label: "Última copia", value: dashboard?.last_backup ? fmtDate(dashboard.last_backup.created_at) : "Nunca", icon: Archive },
    { label: "Copias almacenadas", value: String(backups.length), icon: HardDrive },
    { label: "Espacio usado", value: fmtBytes(dashboard?.storage_bytes), icon: Database },
    { label: "Operaciones registradas", value: String(history.length), icon: History },
  ];

  return (
    <div className="space-y-6">
      <Seo
        title="Data Center | MarIA OS"
        description="Importación masiva, exportación, copias de seguridad y clonación de negocios con trazabilidad completa."
        path="/data-center"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Database className="h-6 w-6 text-primary" /> Data Center
          </h1>
          <p className="text-sm text-muted-foreground">
            Tus datos de {tenant?.name ?? "el negocio"}: importar, exportar, respaldar y clonar con auditoría completa.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />} Actualizar
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-lg font-semibold">{s.value}</p>
                </div>
                <s.icon className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!dashboard?.last_backup && !loading && (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Aún no tienes copias de seguridad</AlertTitle>
          <AlertDescription>
            Crea la primera copia antes de importar datos: te permite volver atrás con un clic.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="import">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="import"><Upload className="h-4 w-4 mr-2" /> Importar</TabsTrigger>
          <TabsTrigger value="export"><Download className="h-4 w-4 mr-2" /> Exportar</TabsTrigger>
          <TabsTrigger value="backups"><Archive className="h-4 w-4 mr-2" /> Copias</TabsTrigger>
          <TabsTrigger value="clone"><Copy className="h-4 w-4 mr-2" /> Clonar</TabsTrigger>
          <TabsTrigger value="history"><History className="h-4 w-4 mr-2" /> Historial</TabsTrigger>
        </TabsList>

        {/* ---------------- IMPORT ---------------- */}
        <TabsContent value="import" className="space-y-4 mt-4">
          {!canEdit ? (
            <Alert>
              <AlertTitle>Solo lectura</AlertTitle>
              <AlertDescription>Tu rol no permite importar datos. Solicita acceso al administrador del negocio.</AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadFullTemplate(forms)}>
                  <Download className="h-4 w-4 mr-2" /> Plantilla del negocio completo
                </Button>
              </div>
              <DataImportWizard forms={forms} tenantId={tenantId} onDone={load} />
            </>
          )}
        </TabsContent>

        {/* ---------------- EXPORT ---------------- */}
        <TabsContent value="export" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Exportar datos</CardTitle>
              <CardDescription>Descarga cualquier entidad de tu negocio en Excel, CSV o JSON.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label>Entidad</Label>
                  <Select value={exportEntity} onValueChange={setExportEntity}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {forms.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                      {EXPORT_ONLY_ENTITIES.map((e) => <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Formato</Label>
                  <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as typeof exportFormat)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                      <SelectItem value="csv">CSV</SelectItem>
                      <SelectItem value="json">JSON</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Desde</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Hasta</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </div>
              <Button onClick={runExport} disabled={busy === "export"}>
                {busy === "export" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Exportar
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- BACKUPS ---------------- */}
        <TabsContent value="backups" className="space-y-4 mt-4">
          {canEdit && (
            <Card>
              <CardHeader>
                <CardTitle>Nueva copia de seguridad</CardTitle>
                <CardDescription>Incluye todos los datos maestros del negocio con checksum de integridad.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <div className="space-y-2 flex-1 min-w-[220px]">
                  <Label>Etiqueta (opcional)</Label>
                  <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Antes de la migración de precios" />
                </div>
                <Button onClick={createBackup} disabled={busy === "backup"}>
                  {busy === "backup" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Archive className="h-4 w-4 mr-2" />}
                  Crear copia
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Copias disponibles</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Etiqueta</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Registros</TableHead>
                      <TableHead>Tamaño</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backups.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Todavía no hay copias.</TableCell></TableRow>
                    )}
                    {backups.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">
                          {b.label}
                          <div className="text-xs text-muted-foreground">{b.kind === "pre_operation" ? "Punto de restauración" : b.scope === "full" ? "Completa" : "Parcial"}</div>
                        </TableCell>
                        <TableCell className="text-sm">{fmtDate(b.created_at)}</TableCell>
                        <TableCell>{b.record_count ?? 0}</TableCell>
                        <TableCell>{fmtBytes(b.size_bytes)}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[b.status] ?? "outline"}>{b.status}</Badge>
                          {b.verified_at && <div className="text-xs text-muted-foreground mt-1">Verificada</div>}
                        </TableCell>
                        <TableCell className="text-right space-x-1 whitespace-nowrap">
                          <Button size="sm" variant="ghost" onClick={() => act("backup_verify", b)} disabled={!!busy}>
                            <ShieldCheck className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => act("backup_download", b)} disabled={!!busy}>
                            <Download className="h-4 w-4" />
                          </Button>
                          {canEdit && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => setConfirmRestore(b)} disabled={!!busy}>
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(b)} disabled={!!busy}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- CLONE ---------------- */}
        <TabsContent value="clone" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Clonar datos maestros</CardTitle>
              <CardDescription>
                Copia catálogo, categorías, impuestos, unidades, tiendas y almacenes a otro negocio. Nunca se copian ventas,
                movimientos financieros, turnos ni credenciales.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!canEdit ? (
                <Alert><AlertTitle>Solo lectura</AlertTitle><AlertDescription>Tu rol no permite clonar negocios.</AlertDescription></Alert>
              ) : (
                <>
                  <div className="space-y-2 max-w-md">
                    <Label>Negocio destino</Label>
                    <Select value={cloneTarget} onValueChange={setCloneTarget}>
                      <SelectTrigger><SelectValue placeholder="Selecciona el negocio destino" /></SelectTrigger>
                      <SelectContent>
                        {allTenants.filter((t) => t.id !== tenantId).map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={runClone} disabled={!cloneTarget || busy === "clone"}>
                    {busy === "clone" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Copy className="h-4 w-4 mr-2" />}
                    Clonar datos maestros
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- HISTORY ---------------- */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Historial de operaciones</CardTitle>
              <CardDescription>Cada importación, exportación, copia y restauración queda registrada y auditada.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Entidad</TableHead>
                      <TableHead>Resultado</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Sin operaciones registradas.</TableCell></TableRow>
                    )}
                    {history.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-xs">{o.code ?? "—"}</TableCell>
                        <TableCell>{KIND_LABEL[o.kind] ?? o.kind}</TableCell>
                        <TableCell className="text-sm">{o.entity ?? "—"}</TableCell>
                        <TableCell className="text-sm">
                          {o.kind === "export"
                            ? `${o.total_rows ?? 0} registros`
                            : `${o.created_count ?? 0} nuevos · ${o.updated_count ?? 0} act. · ${o.error_count ?? 0} err.`}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[o.status] ?? "outline"} className="gap-1">
                            {o.status === "completed" ? <CheckCircle2 className="h-3 w-3" /> : o.status === "failed" ? <XCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                            {o.status}
                          </Badge>
                          {o.error && <div className="text-xs text-destructive mt-1 max-w-xs truncate">{o.error}</div>}
                        </TableCell>
                        <TableCell className="text-sm">{fmtDate(o.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!confirmRestore} onOpenChange={(o) => !o && setConfirmRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Restaurar «{confirmRestore?.label}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Los datos actuales se sobrescribirán con el contenido de la copia. Antes de restaurar se guarda
              automáticamente el estado actual como punto de retorno.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const b = confirmRestore; setConfirmRestore(null); if (b) act("backup_restore", b); }}>
              Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar «{confirmDelete?.label}»?</AlertDialogTitle>
            <AlertDialogDescription>La copia y su archivo se borrarán de forma permanente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const b = confirmDelete; setConfirmDelete(null); if (b) act("backup_delete", b); }}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
