import { tr as trPT } from "@/i18n/tr";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Download, WifiOff, Wifi, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { getDeviceName } from "@/lib/offline/device";
import type { OpStatus } from "@/lib/offline/db";

const STATUS: Record<OpStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendiente", variant: "secondary" },
  syncing: { label: "Enviando", variant: "outline" },
  synced: { label: "Sincronizada", variant: "default" },
  failed: { label: "Error", variant: "destructive" },
  conflict: { label: "Conflicto", variant: "destructive" },
};

export default function Sincronizacion() {
  const { tenantId } = useTenantContext();
  const { online, ops, stats, syncing, lastSync, ready, flush, prefetch, retryOp, retryAll } = useOfflineQueue(tenantId);

  return (
    <AppLayout title={trPT("Centro de sincronización")}>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{trPT("Conexión")}</CardTitle></CardHeader>
            <CardContent className="flex items-center gap-2">
              {online ? <Wifi className="h-5 w-5 text-emerald-500" /> : <WifiOff className="h-5 w-5 text-destructive" />}
              <span className="text-lg font-bold">{online ? trPT("En línea") : trPT("Offline")}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Pendientes</CardTitle></CardHeader>
            <CardContent className="flex items-center gap-2"><Clock className="h-5 w-5 text-amber-500" /><span className="text-lg font-bold">{stats.pending}</span></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{trPT("Requieren revisión")}</CardTitle></CardHeader>
            <CardContent className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" /><span className="text-lg font-bold">{stats.failed + stats.conflict}</span></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{trPT("Datos offline")}</CardTitle></CardHeader>
            <CardContent className="flex items-center gap-2">
              <CheckCircle2 className={`h-5 w-5 ${ready ? "text-emerald-500" : "text-muted-foreground"}`} />
              <span className="text-sm">{ready ? trPT("Listos") : trPT("No preparados")}</span>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>{trPT("Cola de operaciones")}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {trPT("Dispositivo:")} {getDeviceName()} · {lastSync ? `datos actualizados ${new Date(lastSync).toLocaleString()}` : trPT("sin precarga")}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void prefetch(true)} disabled={!online}>
                <Download className="h-4 w-4 mr-1" /> {trPT("Precargar datos")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void retryAll()} disabled={stats.failed + stats.conflict === 0}>
                {trPT("Reintentar fallidas")}
              </Button>
              <Button size="sm" onClick={() => void flush()} disabled={syncing || !online}>
                <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} /> Sincronizar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{trPT("Operación")}</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  <TableHead>Creada</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {ops.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                      {trPT("No hay operaciones en la cola. Todo está sincronizado.")}
                    </TableCell></TableRow>
                  )}
                  {ops.map((op) => (
                    <TableRow key={op.client_uuid}>
                      <TableCell className="text-sm font-medium">{trPT(op.title)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{op.type}</TableCell>
                      <TableCell className="text-sm text-right">{op.amount != null ? op.amount.toFixed(2) : "—"}</TableCell>
                      <TableCell className="text-xs">{new Date(op.created_at).toLocaleString()}</TableCell>
                      <TableCell><Badge variant={STATUS[op.status].variant}>{trPT(STATUS[op.status].label)}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate" title={op.last_error || ""}>
                        {op.last_error || (op.attempts ? `${op.attempts} intento(s)` : "—")}
                      </TableCell>
                      <TableCell className="text-right">
                        {(op.status === "failed" || op.status === "conflict") && (
                          <Button size="sm" variant="ghost" onClick={() => void retryOp(op.client_uuid)}>Reintentar</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
