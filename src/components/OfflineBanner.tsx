import { WifiOff, CloudUpload, RefreshCw, Wifi, CheckCircle2, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { useTenantContext } from "@/hooks/useTenantContext";

/**
 * Indicador permanente de conectividad y sincronización en la cabecera.
 * Siempre visible: verde (todo sincronizado), ámbar (pendientes) o rojo (offline).
 */
export function OfflineBanner() {
  const { tenantId } = useTenantContext();
  const { online, pending, stats, syncing, lastSync, ready, flush } = useOfflineQueue(tenantId);

  const tone = !online
    ? "bg-destructive/10 border-destructive/40 text-destructive"
    : pending > 0
      ? "bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400"
      : "bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400";

  const Icon = !online ? WifiOff : pending > 0 ? CloudUpload : Wifi;
  const label = !online ? "Offline" : pending > 0 ? `${pending} pend.` : "En línea";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`flex items-center gap-2 px-2.5 h-8 rounded-full text-xs font-medium border transition-colors ${tone}`}
          aria-label="Estado de sincronización"
        >
          <Icon className={`h-3.5 w-3.5 ${syncing ? "animate-pulse" : ""}`} />
          <span className="hidden sm:inline">{label}</span>
          {pending > 0 && <span className="sm:hidden text-[10px]">{pending}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold flex items-center gap-2">
            {!online ? <WifiOff className="h-4 w-4 text-destructive" /> : <Wifi className="h-4 w-4 text-emerald-500" />}
            {!online ? "Modo offline" : "Conectado"}
          </p>
          <p className="text-xs text-muted-foreground">
            {!online
              ? "Puedes seguir vendiendo y registrando movimientos; todo se enviará al recuperar la conexión."
              : ready ? "Datos del negocio precargados para trabajar sin conexión." : "Preparando datos para uso sin conexión…"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border p-2">
            <p className="text-muted-foreground">Pendientes</p>
            <p className="font-bold text-base">{stats.pending}</p>
          </div>
          <div className="rounded-md border p-2">
            <p className="text-muted-foreground">Sincronizadas</p>
            <p className="font-bold text-base">{stats.synced}</p>
          </div>
          {(stats.failed > 0 || stats.conflict > 0) && (
            <div className="col-span-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span>{stats.failed + stats.conflict} requieren revisión</span>
            </div>
          )}
        </div>

        {lastSync && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Datos actualizados {new Date(lastSync).toLocaleTimeString()}
          </p>
        )}

        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => void flush()} disabled={syncing || !online}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncing ? "animate-spin" : ""}`} />
            Sincronizar
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/sincronizacion">Centro</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
