import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Bike, MapPin, Star, Clock, CheckCircle2, XCircle, Navigation, Package } from "lucide-react";
import { format } from "date-fns";
import { useRiderProfile, riderStats, RIDER_STATUS_LABEL, AVAILABILITY_LABEL, VEHICLE_LABEL } from "@/hooks/useRiderProfile";

interface Job {
  assignment_id: string;
  online_order_id: string;
  business_name: string;
  pickup_address: string | null;
  dropoff_address: string | null;
  total: number;
  delivery_fee: number;
  distance_to_pickup: number | null;
  extra_distance: number | null;
  score: number;
}

const Repartidor = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile, loading, reload } = useRiderProfile();
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    document_id: "",
    vehicle_type: "moto",
    vehicle_plate: "",
    experience_years: "0",
    preferred_zone: "",
    bio: "",
  });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [mine, setMine] = useState<any[]>([]);

  useEffect(() => {
    if (!user) navigate("/auth");
  }, [user, navigate]);

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name,
        phone: profile.phone,
        email: profile.email ?? "",
        document_id: profile.document_id ?? "",
        vehicle_type: profile.vehicle_type,
        vehicle_plate: profile.vehicle_plate ?? "",
        experience_years: String(profile.experience_years ?? 0),
        preferred_zone: profile.preferred_zone ?? "",
        bio: profile.bio ?? "",
      });
    } else if (user) {
      setForm((f) => ({
        ...f,
        full_name: f.full_name || (user.user_metadata?.full_name ?? ""),
        email: f.email || (user.email ?? ""),
      }));
    }
  }, [profile, user]);

  const loadJobs = useCallback(async () => {
    if (!profile || profile.status !== "approved") return;
    const [rec, own] = await Promise.all([
      supabase.rpc("recommend_orders_for_rider" as any, { p_limit: 10 }),
      supabase
        .from("delivery_assignments")
        .select("*, online_orders(customer_name,total,delivery_address,status)")
        .eq("rider_profile_id", profile.id)
        .order("assigned_at", { ascending: false })
        .limit(50),
    ]);
    setJobs(((rec.data as any) || []) as Job[]);
    setMine(((own.data as any) || []) as any[]);
  }, [profile]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const apply = async () => {
    const { error } = await supabase.rpc("apply_as_rider" as any, {
      p_full_name: form.full_name,
      p_phone: form.phone,
      p_vehicle_type: form.vehicle_type,
      p_email: form.email || null,
      p_document_id: form.document_id || null,
      p_vehicle_plate: form.vehicle_plate || null,
      p_vehicle_details: null,
      p_experience_years: Number(form.experience_years) || 0,
      p_preferred_zone: form.preferred_zone || null,
      p_bio: form.bio || null,
      p_avatar_url: null,
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Solicitud enviada", description: "Un administrador revisará tu solicitud." });
    reload();
  };

  const setAvailability = async (value: string) => {
    const { error } = await supabase.rpc("set_rider_availability" as any, { p_availability: value });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    reload();
    loadJobs();
  };

  const shareLocation = () => {
    if (!navigator.geolocation) return toast({ title: "Geolocalización no disponible", variant: "destructive" });
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const { error } = await supabase.rpc("update_rider_location" as any, {
          p_lat: p.coords.latitude,
          p_lng: p.coords.longitude,
          p_heading: p.coords.heading ?? null,
          p_speed: p.coords.speed ?? null,
          p_accuracy: p.coords.accuracy ?? null,
          p_battery: null,
        });
        if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
        toast({ title: "Ubicación actualizada" });
        reload();
        loadJobs();
      },
      (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const respond = async (assignmentId: string, accept: boolean) => {
    const { error } = await supabase.rpc("rider_respond_assignment" as any, {
      p_assignment_id: assignmentId,
      p_accept: accept,
      p_reason: accept ? null : "Rechazado por el repartidor",
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: accept ? "Entrega aceptada" : "Entrega rechazada" });
    reload();
    loadJobs();
  };

  const advance = async (assignmentId: string, status: string) => {
    const { error } = await supabase.rpc("rider_advance_delivery" as any, {
      p_assignment_id: assignmentId,
      p_status: status,
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    reload();
    loadJobs();
  };

  const stats = riderStats(profile);
  const active = mine.filter((a) => ["assigned", "accepted", "picked_up", "in_transit"].includes(a.status));
  const history = mine.filter((a) => ["delivered", "cancelled", "rejected"].includes(a.status));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/70 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/n" className="flex items-center gap-2 text-sm font-medium">
            <ArrowLeft className="h-4 w-4" /> Marketplace
          </Link>
          <Link to="/n/mis-pedidos" className="text-sm text-muted-foreground hover:text-foreground">
            Mis pedidos
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Bike className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Repartidor</h1>
          {profile && <Badge variant="outline">{RIDER_STATUS_LABEL[profile.status]}</Badge>}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : !profile || ["pending", "reviewing", "rejected"].includes(profile.status) ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {!profile ? "Quiero ser repartidor" : `Solicitud: ${RIDER_STATUS_LABEL[profile.status]}`}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {profile?.review_notes && (
                <p className="text-xs text-muted-foreground">Nota de revisión: {profile.review_notes}</p>
              )}
              {profile && profile.status !== "rejected" && (
                <p className="text-sm text-muted-foreground">
                  Tu solicitud está en proceso. Puedes actualizar tus datos mientras se revisa.
                </p>
              )}
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label>Nombre completo *</Label>
                  <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                </div>
                <div>
                  <Label>Teléfono *</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div>
                  <Label>Correo</Label>
                  <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <Label>Documento de identidad</Label>
                  <Input value={form.document_id} onChange={(e) => setForm({ ...form, document_id: e.target.value })} />
                </div>
                <div>
                  <Label>Medio de transporte</Label>
                  <Select value={form.vehicle_type} onValueChange={(v) => setForm({ ...form, vehicle_type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(VEHICLE_LABEL).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Matrícula / identificación del vehículo</Label>
                  <Input value={form.vehicle_plate} onChange={(e) => setForm({ ...form, vehicle_plate: e.target.value })} />
                </div>
                <div>
                  <Label>Años de experiencia</Label>
                  <Input
                    type="number"
                    value={form.experience_years}
                    onChange={(e) => setForm({ ...form, experience_years: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Zona habitual</Label>
                  <Input value={form.preferred_zone} onChange={(e) => setForm({ ...form, preferred_zone: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Sobre ti</Label>
                <Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
              </div>
              <Button className="rounded-full" onClick={apply} disabled={!form.full_name.trim() || !form.phone.trim()}>
                {profile ? "Actualizar solicitud" : "Enviar solicitud"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="panel">
            <TabsList>
              <TabsTrigger value="panel">Panel</TabsTrigger>
              <TabsTrigger value="jobs">Pedidos recomendados</TabsTrigger>
              <TabsTrigger value="history">Historial</TabsTrigger>
            </TabsList>

            <TabsContent value="panel" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Valoración", value: `${Number(profile.rating_avg).toFixed(1)} (${profile.ratings_count})` },
                  { label: "Entregas completadas", value: profile.deliveries_completed },
                  { label: "Aceptación", value: `${stats.acceptance}%` },
                  { label: "Puntualidad", value: `${stats.punctuality}%` },
                ].map((k) => (
                  <Card key={k.label}>
                    <CardContent className="p-3">
                      <p className="text-[11px] text-muted-foreground">{k.label}</p>
                      <p className="text-lg font-bold">{k.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardContent className="p-4 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Disponibilidad:</span>
                    <Select value={profile.availability} onValueChange={setAvailability}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(AVAILABILITY_LABEL).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button size="sm" variant="outline" className="rounded-full" onClick={shareLocation}>
                    <Navigation className="h-4 w-4 mr-1" /> Compartir ubicación
                  </Button>
                  {profile.location_updated_at && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Actualizada {format(new Date(profile.location_updated_at), "HH:mm")}
                    </span>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-3">
                <h2 className="text-sm font-semibold">Entregas activas</h2>
                {active.length === 0 && <p className="text-sm text-muted-foreground">Sin entregas activas.</p>}
                {active.map((a) => (
                  <Card key={a.id}>
                    <CardContent className="p-4 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{a.online_orders?.customer_name}</p>
                        <Badge variant="outline">{a.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> Recogida: {a.pickup_address ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> Entrega: {a.dropoff_address ?? a.online_orders?.delivery_address ?? "—"}
                      </p>
                      {a.instructions && <p className="text-xs text-muted-foreground">Instrucciones: {a.instructions}</p>}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {a.status === "assigned" && (
                          <>
                            <Button size="sm" className="rounded-full" onClick={() => respond(a.id, true)}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Aceptar
                            </Button>
                            <Button size="sm" variant="outline" className="rounded-full" onClick={() => respond(a.id, false)}>
                              <XCircle className="h-3.5 w-3.5 mr-1" /> Rechazar
                            </Button>
                          </>
                        )}
                        {a.status === "accepted" && (
                          <Button size="sm" className="rounded-full" onClick={() => advance(a.id, "picked_up")}>
                            Marcar recogido
                          </Button>
                        )}
                        {a.status === "picked_up" && (
                          <Button size="sm" className="rounded-full" onClick={() => advance(a.id, "in_transit")}>
                            En camino
                          </Button>
                        )}
                        {["picked_up", "in_transit"].includes(a.status) && (
                          <Button size="sm" variant="outline" className="rounded-full" onClick={() => advance(a.id, "delivered")}>
                            Entregado
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="jobs" className="space-y-3 pt-4">
              {jobs.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No hay pedidos compatibles ahora. Marca tu disponibilidad y comparte tu ubicación para recibir mejores
                  recomendaciones.
                </p>
              )}
              {jobs.map((j) => (
                <Card key={j.assignment_id}>
                  <CardContent className="p-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-medium flex items-center gap-2">
                        <Package className="h-4 w-4 text-primary" /> {j.business_name}
                      </p>
                      <Badge variant="outline">Compatibilidad {Number(j.score).toFixed(0)}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Recogida: {j.pickup_address ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">Destino: {j.dropoff_address ?? "—"}</p>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      {j.distance_to_pickup != null && (
                        <span className="flex items-center gap-1">
                          <Navigation className="h-3 w-3" /> {Number(j.distance_to_pickup).toFixed(1)} km a la recogida
                        </span>
                      )}
                      {j.extra_distance != null && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Tramo {Number(j.extra_distance).toFixed(1)} km
                        </span>
                      )}
                    </div>
                    <p className="text-xs">Envío: ${Number(j.delivery_fee ?? 0).toFixed(2)}</p>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="history" className="space-y-3 pt-4">
              {history.length === 0 && <p className="text-sm text-muted-foreground">Sin entregas registradas.</p>}
              {history.map((a) => (
                <Card key={a.id}>
                  <CardContent className="p-4 flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{a.online_orders?.customer_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.delivered_at ? format(new Date(a.delivered_at), "dd/MM/yy HH:mm") : "—"} ·{" "}
                        {a.actual_minutes ? `${a.actual_minutes} min` : "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{a.status}</Badge>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Star className="h-3 w-3 text-amber-500" /> {Number(profile.rating_avg).toFixed(1)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
};

export default Repartidor;
