// Sprint C — Estados vacíos / carga / error homogéneos para todos los listados.

import { AlertTriangle, Inbox, LucideIcon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";

interface DataStateProps {
  loading?: boolean;
  error?: Error | null;
  empty?: boolean;
  /** Texto mostrado cuando no hay resultados */
  emptyTitle?: string;
  emptyHint?: string;
  icon?: LucideIcon;
  onRetry?: () => void;
}

export function DataState({
  loading,
  error,
  empty,
  emptyTitle = "Sin resultados",
  emptyHint,
  icon: Icon = Inbox,
  onRetry,
}: DataStateProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <span className="text-xs">Cargando…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        <AlertTriangle className="h-7 w-7 text-destructive" />
        <div className="space-y-1">
          <p className="text-sm font-medium">No se pudieron cargar los datos</p>
          <p className="text-xs text-muted-foreground max-w-sm">{error.message}</p>
        </div>
        {onRetry && (
          <Button size="sm" variant="outline" className="gap-2" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" /> Reintentar
          </Button>
        )}
      </div>
    );
  }
  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <Icon className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium">{emptyTitle}</p>
        {emptyHint && <p className="text-xs text-muted-foreground max-w-sm">{emptyHint}</p>}
      </div>
    );
  }
  return null;
}

/** Igual que DataState pero encajado dentro de un <TableBody>. */
export function TableDataState({ colSpan, ...props }: DataStateProps & { colSpan: number }) {
  const visible = props.loading || props.error || props.empty;
  if (!visible) return null;
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="p-0">
        <DataState {...props} />
      </TableCell>
    </TableRow>
  );
}
