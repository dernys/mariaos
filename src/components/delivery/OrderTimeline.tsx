import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  History, Send, Loader2, ShoppingBag, RefreshCw, Bike, StickyNote, Pencil, Receipt, Ban, Sparkles,
} from "lucide-react";

interface OrderEvent {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  metadata: Record<string, any> | null;
  actor_label: string | null;
  created_at: string;
}

const EVENT_META: Record<string, { label: string; icon: any }> = {
  order_created: { label: "Pedido recibido", icon: ShoppingBag },
  status_changed: { label: "Cambio de estado", icon: RefreshCw },
  order_edited: { label: "Pedido editado", icon: Pencil },
  note_added: { label: "Nota interna", icon: StickyNote },
  sale_linked: { label: "Venta generada", icon: Receipt },
  delivery_created: { label: "Entrega creada", icon: Bike },
  delivery_status_changed: { label: "Estado de la entrega", icon: Bike },
  delivery_reassigned: { label: "Repartidor reasignado", icon: RefreshCw },
  delivery_cancelled: { label: "Entrega cancelada", icon: Ban },
  auto_assigned: { label: "Asignación automática", icon: Sparkles },
};

export function OrderTimeline({ orderId, refreshKey = 0 }: { orderId: string; refreshKey?: number }) {
  const { toast } = useToast();
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase.from as any)("online_order_events")
      .select("id,event_type,from_status,to_status,note,metadata,actor_label,created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });
    setEvents(((data as any) || []) as OrderEvent[]);
    setLoading(false);
  }, [orderId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const addNote = async () => {
    if (!note.trim()) return;
    setSaving(true);
    const { error } = await (supabase.rpc as any)("add_online_order_note", { p_order_id: orderId, p_note: note.trim() });
    setSaving(false);
    if (error) return toast({ title: "No se pudo guardar la nota", description: error.message, variant: "destructive" });
    setNote("");
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold">
        <History className="h-3.5 w-3.5 text-primary" /> Historial y actividad
        <Badge variant="outline" className="text-[10px]">{events.length}</Badge>
      </div>

      <div className="flex gap-2">
        <Input
          value={note}
          placeholder="Añadir nota interna o seguimiento…"
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNote(); } }}
        />
        <Button size="icon" variant="outline" onClick={addNote} disabled={saving || !note.trim()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>

      {loading ? (
        <div className="py-6 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
      ) : events.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Aún no hay actividad registrada.</p>
      ) : (
        <ol className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {events.map((ev) => {
            const meta = EVENT_META[ev.event_type] ?? { label: ev.event_type, icon: History };
            const Icon = meta.icon;
            return (
              <li key={ev.id} className="flex gap-2 rounded-lg border p-2">
                <Icon className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">
                    {meta.label}
                    {ev.from_status && ev.to_status && (
                      <span className="text-muted-foreground font-normal"> · {ev.from_status} → {ev.to_status}</span>
                    )}
                    {!ev.from_status && ev.to_status && (
                      <span className="text-muted-foreground font-normal"> · {ev.to_status}</span>
                    )}
                  </p>
                  {ev.note && <p className="text-[11px] text-muted-foreground break-words">{ev.note}</p>}
                  <p className="text-[10px] text-muted-foreground">
                    {format(new Date(ev.created_at), "dd/MM/yy HH:mm")}
                    {ev.actor_label ? ` · ${ev.actor_label}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
