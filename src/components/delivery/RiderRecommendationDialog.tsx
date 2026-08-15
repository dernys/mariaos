import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bike, Star, MapPin, Clock, CheckCircle2, Loader2, Route, Users } from "lucide-react";
import { VEHICLE_LABEL } from "@/hooks/useRiderProfile";

export interface RiderRecommendation {
  rider_profile_id: string;
  full_name: string;
  avatar_url: string | null;
  vehicle_type: string;
  rating_avg: number;
  deliveries_completed: number;
  acceptance_rate: number;
  punctuality: number;
  distance_km: number | null;
  active_deliveries: number;
  score: number;
  reasons: Record<string, any>;
}

const compat = (score: number) =>
  score >= 75 ? "Muy alta" : score >= 55 ? "Alta" : score >= 35 ? "Media" : "Baja";

const compatColor = (score: number) =>
  score >= 75
    ? "bg-emerald-500/15 text-emerald-500"
    : score >= 55
    ? "bg-primary/15 text-primary"
    : score >= 35
    ? "bg-amber-500/15 text-amber-600"
    : "bg-muted text-muted-foreground";

export const explainRecommendation = (r: RiderRecommendation): string[] => {
  const out: string[] = [];
  const dp = Number(r.reasons?.distance_pickup_km ?? -1);
  const dd = Number(r.reasons?.distance_dropoff_km ?? -1);
  if (dp >= 0) out.push(`Está a ${dp.toFixed(1)} km del negocio`);
  if (dd >= 0) out.push(`Está a ${dd.toFixed(1)} km del destino del pedido`);
  if (r.reasons?.zone_match) out.push("Su zona habitual coincide con la zona de entrega");
  out.push("Está disponible");
  if (r.rating_avg > 0) out.push(`Tiene ${Number(r.rating_avg).toFixed(1)} de valoración`);
  if (r.deliveries_completed > 0) out.push(`Ha completado ${r.deliveries_completed} entregas`);
  out.push(`Puntualidad ${r.punctuality}% · Aceptación ${r.acceptance_rate}%`);
  out.push(
    r.active_deliveries === 0
      ? "Sin entregas activas"
      : `Tiene ${r.active_deliveries} entrega(s) activa(s), con capacidad disponible`
  );
  return out;
};

interface Props {
  orderId: string | null;
  onOpenChange: (open: boolean) => void;
  onAssigned?: () => void;
  /** Cancela la entrega activa y crea una nueva con el repartidor elegido */
  reassign?: boolean;
}

export const RiderRecommendationDialog = ({ orderId, onOpenChange, onAssigned, reassign = false }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [recs, setRecs] = useState<RiderRecommendation[]>([]);
  const [assigning, setAssigning] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    setLoading(true);
    supabase
      .rpc("recommend_riders_for_order" as any, { p_order_id: orderId, p_limit: 6 })
      .then(({ data, error }) => {
        if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
        setRecs(((data as any) || []) as RiderRecommendation[]);
        setLoading(false);
      });
  }, [orderId, toast]);

  const assign = async (r: RiderRecommendation) => {
    if (!orderId) return;
    setAssigning(r.rider_profile_id);
    const { error } = reassign
      ? await supabase.rpc("reassign_delivery" as any, {
          p_order_id: orderId,
          p_rider_profile_id: r.rider_profile_id,
          p_reason: "Reasignado por el negocio",
        })
      : await supabase.rpc("request_delivery_assignment" as any, {
          p_order_id: orderId,
          p_rider_profile_id: r.rider_profile_id,
          p_score: r.score,
          p_reasons: r.reasons,
        });
    setAssigning(null);
    if (error) {
      toast({ title: "No se pudo asignar", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: reassign ? "Entrega reasignada" : "Solicitud enviada",
      description: `${r.full_name} debe aceptar la entrega.`,
    });
    onOpenChange(false);
    onAssigned?.();
  };


  return (
    <Dialog open={!!orderId} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Route className="h-5 w-5 text-primary" /> Repartidores recomendados
          </DialogTitle>
          <DialogDescription>
            Sólo se consideran repartidores aprobados, disponibles y con capacidad. La puntuación combina
            proximidad, carga actual, experiencia, valoración y puntualidad.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : recs.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
            No hay repartidores aprobados y disponibles en este momento.
          </div>
        ) : (
          <div className="space-y-3">
            {recs.map((r) => (
              <div key={r.rider_profile_id} className="rounded-xl border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                      {r.avatar_url ? (
                        <img src={r.avatar_url} alt={r.full_name} className="h-full w-full object-cover" />
                      ) : (
                        <Bike className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{r.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {VEHICLE_LABEL[r.vehicle_type] ?? r.vehicle_type}
                        {r.distance_km != null && ` · ${Number(r.distance_km).toFixed(1)} km`}
                      </p>
                    </div>
                  </div>
                  <Badge className={`text-[10px] ${compatColor(r.score)}`}>
                    Compatibilidad: {compat(r.score)} · {Number(r.score).toFixed(0)}
                  </Badge>
                </div>

                <ul className="text-xs text-muted-foreground space-y-1">
                  {explainRecommendation(r).map((line, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <CheckCircle2 className="h-3 w-3 mt-0.5 text-emerald-500 shrink-0" />
                      {line}
                    </li>
                  ))}
                </ul>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3 text-amber-500" /> {Number(r.rating_avg).toFixed(1)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {r.punctuality}%
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {r.active_deliveries} activas
                    </span>
                  </div>
                  <Button
                    size="sm"
                    className="rounded-full"
                    disabled={assigning === r.rider_profile_id}
                    onClick={() => assign(r)}
                  >
                    {assigning === r.rider_profile_id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Solicitar entrega"
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
