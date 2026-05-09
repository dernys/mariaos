import { Bell, Check, Trash2, AlertTriangle, Info, CheckCircle2, AlertCircle, BellRing, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useNotifications } from "@/hooks/useNotifications";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const severityIcon = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
} as const;

const severityColor = {
  info: "text-blue-500",
  success: "text-emerald-500",
  warning: "text-amber-500",
  error: "text-destructive",
} as const;

export function NotificationsBell() {
  const { items, unreadCount, markRead, markAllRead, remove } = useNotifications();
  const { supported, permission, enabled, requestPermission, disable } = usePushNotifications();
  const navigate = useNavigate();

  const togglePush = async () => {
    if (enabled) {
      disable();
      toast.success("Notificaciones push desactivadas");
    } else {
      const ok = await requestPermission();
      if (ok) toast.success("Notificaciones activadas");
      else if (permission === "denied") toast.error("Permiso denegado. Habilítalo en ajustes del navegador.");
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2">
            <h3 className="font-heading font-semibold text-sm">Notificaciones</h3>
            {unreadCount > 0 && <Badge variant="secondary">{unreadCount}</Badge>}
          </div>
          <div className="flex items-center gap-1">
            {supported && (
              <Button
                variant="ghost"
                size="sm"
                onClick={togglePush}
                className="h-7 text-xs"
                title={enabled ? "Desactivar push" : "Activar push"}
              >
                {enabled ? <BellRing className="h-3 w-3 text-primary" /> : <BellOff className="h-3 w-3" />}
              </Button>
            )}
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllRead} className="h-7 text-xs">
                <Check className="h-3 w-3 mr-1" /> Marcar todas
              </Button>
            )}
          </div>
        </div>
        {supported && permission === "default" && (
          <div className="p-3 bg-primary/5 border-b text-xs flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Activa notificaciones para recibir alertas en tiempo real.</span>
            <Button size="sm" onClick={togglePush} className="h-7 text-xs gradient-brand text-primary-foreground shrink-0">
              Activar
            </Button>
          </div>
        )}
        <ScrollArea className="h-96">
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Sin notificaciones</div>
          ) : (
            <div className="divide-y">
              {items.map((n) => {
                const Icon = severityIcon[n.severity] || Info;
                return (
                  <div
                    key={n.id}
                    className={cn(
                      "group p-3 hover:bg-muted/50 cursor-pointer flex gap-3",
                      !n.read_at && "bg-primary/5"
                    )}
                    onClick={() => {
                      if (!n.read_at) markRead(n.id);
                      if (n.action_url) navigate(n.action_url);
                    }}
                  >
                    <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", severityColor[n.severity])} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight">{n.title}</p>
                      {n.message && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(n.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
