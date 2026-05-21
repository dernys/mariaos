import { WifiOff, CloudUpload, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { useTenantContext } from "@/hooks/useTenantContext";

/**
 * Persistent badge shown in the app header when the user is offline
 * or has pending operations waiting to sync.
 */
export function OfflineBanner() {
  const { tenantId } = useTenantContext();
  const { online, pending, syncing, flush } = useOfflineQueue(tenantId);

  if (online && pending === 0) return null;

  return (
    <div className={`flex items-center gap-2 px-2.5 h-8 rounded-full text-xs font-medium border ${
      !online
        ? "bg-destructive/10 border-destructive/40 text-destructive"
        : "bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400"
    }`}>
      {!online ? <WifiOff className="h-3.5 w-3.5" /> : <CloudUpload className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">
        {!online ? "Modo offline" : `${pending} pend.`}
      </span>
      {pending > 0 && online && (
        <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => void flush()} disabled={syncing}>
          <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
        </Button>
      )}
      {pending > 0 && (
        <span className="text-[10px] opacity-70 sm:hidden">{pending}</span>
      )}
    </div>
  );
}
