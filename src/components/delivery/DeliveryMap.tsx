import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";

// Fix default icon paths (Vite)
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

const riderIcon = L.divIcon({
  className: "",
  html: `<div style="background:#10b981;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:16px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)">🛵</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

interface RiderLoc {
  rider_id: string;
  latitude: number;
  longitude: number;
  recorded_at: string;
  name?: string;
  vehicle?: string | null;
  is_available?: boolean;
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [points, map]);
  return null;
}

export function DeliveryMap({ tenantId }: { tenantId: string | null }) {
  const [locations, setLocations] = useState<RiderLoc[]>([]);

  const load = async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("driver_last_location" as any)
      .select("*")
      .eq("tenant_id", tenantId);
    if (!data) return;
    const riderIds = (data as any[]).map((d) => d.rider_id);
    let riders: any[] = [];
    if (riderIds.length) {
      const r = await supabase
        .from("delivery_riders")
        .select("id,name,vehicle,is_available")
        .in("id", riderIds);
      riders = r.data || [];
    }
    setLocations(
      (data as any[]).map((d) => {
        const r = riders.find((x) => x.id === d.rider_id);
        return {
          rider_id: d.rider_id,
          latitude: Number(d.latitude),
          longitude: Number(d.longitude),
          recorded_at: d.recorded_at,
          name: r?.name,
          vehicle: r?.vehicle,
          is_available: r?.is_available,
        };
      })
    );
  };

  useEffect(() => {
    load();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const ch = supabase
      .channel("driver-locations-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_locations", filter: `tenant_id=eq.${tenantId}` },
        load
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [tenantId]);

  const center = useMemo<[number, number]>(() => {
    if (locations.length > 0) return [locations[0].latitude, locations[0].longitude];
    return [23.1136, -82.3666]; // Habana fallback
  }, [locations]);

  const points = locations.map((l) => [l.latitude, l.longitude] as [number, number]);

  return (
    <div className="h-[520px] w-full rounded-lg overflow-hidden border">
      <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />
        {locations.map((l) => (
          <Marker key={l.rider_id} position={[l.latitude, l.longitude]} icon={riderIcon}>
            <Popup>
              <div className="text-sm space-y-1">
                <p className="font-bold">{l.name || "Repartidor"}</p>
                <p>Vehículo: {l.vehicle || "—"}</p>
                <p>Estado: {l.is_available ? "🟢 Disponible" : "🔴 Ocupado"}</p>
                <p className="text-xs text-gray-500">Actualizado: {new Date(l.recorded_at).toLocaleTimeString()}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {locations.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="bg-white/90 px-4 py-2 rounded-full text-sm text-gray-600 shadow">
            Esperando ubicaciones GPS de repartidores…
          </p>
        </div>
      )}
    </div>
  );
}
