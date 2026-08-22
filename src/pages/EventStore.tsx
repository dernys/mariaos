import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, AlertTriangle, CheckCircle2, Database, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useShadowEvents } from "@/modules/events/ui/useEventStore";
import {
  CLEAN_RUN_DAYS_REQUIRED,
  READINESS_LABELS,
  SHADOW_EVENT_TYPES,
  eventAmount,
  eventLabel,
} from "@/modules/events/domain/domainEvent";

const READINESS_STYLES: Record<string, string> = {
  no_data: "bg-muted text-muted-foreground",
  diverging: "bg-destructive/15 text-destructive",
  observing: "bg-primary/15 text-primary",
  ready: "bg-primary/20 text-primary",
};

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "dd MMM yyyy HH:mm", { locale: es });
}

export default function EventStore() {
  const [eventType, setEventType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");

  const {
    events,
    divergences,
    summary,
    health,
    runDays,
    readiness,
    byEventType,
    loading,
    refetch,
    isRefetching,
  } = useShadowEvents({ eventType: eventType === "all" ? null : eventType, search: term || null });

  const byType = useMemo(() => summary?.by_type ?? {}, [summary]);

  return (
    <AppLayout>
      <div className="space-y-6 p-4 md:p-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <Database className="h-6 w-6 text-primary" />
              Event Store — Modo sombra
            </h1>
            <p className="text-sm text-muted-foreground">
              Fase 4: los eventos de negocio se registran de forma append-only y se comparan con el estado real.
              Ningún trigger contable se retira hasta {CLEAN_RUN_DAYS_REQUIRED} días sin divergencias.
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Eventos registrados</CardDescription>
              <CardTitle className="text-3xl">{summary?.total_events ?? 0}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Desde {fmtDate(summary?.since)}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Divergencias</CardDescription>
              <CardTitle className="text-3xl">{summary?.divergences ?? 0}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {(summary?.divergences ?? 0) === 0 ? "Estado y eventos cuadran" : "Requiere revisión"}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Salud del shadow run</CardDescription>
              <CardTitle className="text-3xl">{health}%</CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={health} className="h-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Días en observación</CardDescription>
              <CardTitle className="text-3xl">{runDays}</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge className={READINESS_STYLES[readiness]}>{READINESS_LABELS[readiness]}</Badge>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="events">
          <TabsList>
            <TabsTrigger value="events">
              <Activity className="mr-2 h-4 w-4" /> Eventos
            </TabsTrigger>
            <TabsTrigger value="divergences">
              <AlertTriangle className="mr-2 h-4 w-4" /> Divergencias ({divergences.length})
            </TabsTrigger>
            <TabsTrigger value="coverage">
              <ShieldCheck className="mr-2 h-4 w-4" /> Cobertura
            </TabsTrigger>
          </TabsList>

          <TabsContent value="events" className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Buscar por correlación o id de agregado"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && setTerm(search.trim())}
                />
              </div>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger className="sm:w-64">
                  <SelectValue placeholder="Tipo de evento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  {SHADOW_EVENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {eventLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="secondary" onClick={() => setTerm(search.trim())}>
                Buscar
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Evento</TableHead>
                      <TableHead>Agregado</TableHead>
                      <TableHead className="text-right">Monto / cantidad</TableHead>
                      <TableHead>Origen</TableHead>
                      <TableHead>Correlación</TableHead>
                      <TableHead>Ocurrido</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                          Cargando eventos…
                        </TableCell>
                      </TableRow>
                    ) : events.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                          Aún no hay eventos para esta empresa.
                        </TableCell>
                      </TableRow>
                    ) : (
                      pagedEvents.map((e) => {
                        const amount = eventAmount(e);
                        return (
                          <TableRow key={e.id}>
                            <TableCell className="font-medium">{eventLabel(e.event_type)}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {e.aggregate_type} · {e.aggregate_id?.slice(0, 8) ?? "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {amount === null ? "—" : amount.toLocaleString("es-ES")}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{e.source}</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {e.correlation_id?.slice(0, 12) ?? "—"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm">{fmtDate(e.occurred_at)}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
                <TablePagination
                  page={evPage}
                  pageSize={evPageSize}
                  total={events.length}
                  onPageChange={setEvPage}
                  onPageSizeChange={setEvPageSize}
                />
              </CardContent>
            </Card>
          </TabsContent>


          <TabsContent value="divergences">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Panel de divergencias</CardTitle>
                <CardDescription>
                  Eventos sin proyección contable y estado sin evento emitido, desde el inicio del shadow run.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Agregado</TableHead>
                      <TableHead>Detalle</TableHead>
                      <TableHead>Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {divergences.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center">
                          <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-primary" />
                          <span className="text-muted-foreground">Sin divergencias: eventos y estado cuadran.</span>
                        </TableCell>
                      </TableRow>
                    ) : (
                      divergences.map((d, i) => (
                        <TableRow key={`${d.aggregate_id}-${d.divergence_type}-${i}`}>
                          <TableCell>
                            <Badge
                              variant={d.divergence_type === "event_without_projection" ? "destructive" : "outline"}
                            >
                              {d.divergence_type === "event_without_projection"
                                ? "Evento sin asiento"
                                : "Estado sin evento"}
                            </Badge>
                          </TableCell>
                          <TableCell>{eventLabel(d.event_type)}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {d.aggregate_type} · {d.aggregate_id?.slice(0, 8) ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm">{d.detail}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm">{fmtDate(d.detected_for)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="coverage" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Cobertura por tipo de evento</CardTitle>
                <CardDescription>
                  Un tipo de evento solo puede promoverse fuera del modo sombra con 0 divergencias sostenidas.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Evento</TableHead>
                      <TableHead className="text-right">Registrados</TableHead>
                      <TableHead className="text-right">Divergencias</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {SHADOW_EVENT_TYPES.map((t) => {
                      const total = Number(byType[t] ?? 0);
                      const diverging = byEventType.find((r) => r.event_type === t)?.total ?? 0;
                      return (
                        <TableRow key={t}>
                          <TableCell className="font-medium">{eventLabel(t)}</TableCell>
                          <TableCell className="text-right tabular-nums">{total}</TableCell>
                          <TableCell className="text-right tabular-nums">{diverging}</TableCell>
                          <TableCell>
                            {total === 0 ? (
                              <Badge className={READINESS_STYLES.no_data}>Sin datos</Badge>
                            ) : diverging > 0 ? (
                              <Badge className={READINESS_STYLES.diverging}>Divergiendo</Badge>
                            ) : runDays >= CLEAN_RUN_DAYS_REQUIRED ? (
                              <Badge className={READINESS_STYLES.ready}>Listo para promover</Badge>
                            ) : (
                              <Badge className={READINESS_STYLES.observing}>
                                En observación ({runDays}/{CLEAN_RUN_DAYS_REQUIRED} d)
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
