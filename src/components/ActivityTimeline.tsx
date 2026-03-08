import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Clock } from "lucide-react";

interface Activity {
  id: string;
  action: string;
  description: string | null;
  created_at: string;
  metadata: any;
}

interface Props {
  entityType: string;
  entityId: string;
}

export function ActivityTimeline({ entityType, entityId }: Props) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("activity_log")
      .select("id, action, description, created_at, metadata")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setActivities(data);
        setLoading(false);
      });
  }, [entityType, entityId]);

  if (loading) return <p className="text-xs text-muted-foreground">Cargando historial...</p>;
  if (activities.length === 0) return <p className="text-xs text-muted-foreground">Sin actividad registrada</p>;

  return (
    <div className="space-y-3 max-h-64 overflow-y-auto">
      {activities.map((a) => (
        <div key={a.id} className="flex gap-3">
          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <Clock className="h-3 w-3 text-primary" />
          </div>
          <div>
            <p className="text-xs font-medium">{a.action}</p>
            {a.description && <p className="text-[10px] text-muted-foreground">{a.description}</p>}
            <p className="text-[10px] text-muted-foreground/60">
              {format(new Date(a.created_at), "dd MMM yyyy HH:mm", { locale: es })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
