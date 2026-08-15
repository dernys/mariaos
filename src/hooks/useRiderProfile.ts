import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface RiderProfile {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  avatar_url: string | null;
  document_id: string | null;
  vehicle_type: string;
  vehicle_plate: string | null;
  vehicle_details: string | null;
  experience_years: number;
  preferred_zone: string | null;
  bio: string | null;
  status: "pending" | "reviewing" | "approved" | "rejected" | "suspended";
  availability: "available" | "unavailable" | "busy" | "paused";
  max_active_deliveries: number;
  current_lat: number | null;
  current_lng: number | null;
  location_updated_at: string | null;
  rating_avg: number;
  ratings_count: number;
  deliveries_completed: number;
  deliveries_cancelled: number;
  offers_received: number;
  offers_accepted: number;
  on_time_deliveries: number;
  review_notes: string | null;
  created_at: string;
}

export const useRiderProfile = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("rider_profiles" as any)
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    setProfile((data as any) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  return { profile, loading, reload: load };
};

export const riderStats = (p: RiderProfile | null) => ({
  acceptance: p && p.offers_received > 0 ? Math.round((p.offers_accepted / p.offers_received) * 100) : 100,
  punctuality:
    p && p.deliveries_completed > 0 ? Math.round((p.on_time_deliveries / p.deliveries_completed) * 100) : 100,
});

export const RIDER_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  reviewing: "En revisión",
  approved: "Aprobado",
  rejected: "Rechazado",
  suspended: "Suspendido",
};

export const AVAILABILITY_LABEL: Record<string, string> = {
  available: "Disponible",
  unavailable: "No disponible",
  busy: "Ocupado",
  paused: "Pausado",
};

export const VEHICLE_LABEL: Record<string, string> = {
  bike: "Bicicleta",
  moto: "Motocicleta",
  car: "Automóvil",
  walk: "A pie",
  van: "Furgoneta",
};
