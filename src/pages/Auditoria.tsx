import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useSuperadmin } from "@/hooks/useSuperadmin";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, Filter, RefreshCw, Download, ShieldAlert, Building2, User as UserIcon, Clock,
  MoreHorizontal, Eye, History, UserSearch, Layers, ExternalLink, X, Activity, AlertCircle, CheckCircle2, Trash2, Edit, Plus,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { motion } from "framer-motion";

interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  description: string | null;
  metadata: any;
  performed_by: string | null;
  tenant_id: string | null;
  created_at: string;
  user_email: string | null;
  user_name: string | null;
  tenant_name: string | null;
}

const PAGE_SIZE = 50;
const ENTITY_TYPES = ["sale", "purchase", "product", "customer", "employee", "shift", "invoice", "tenant", "user", "transfer", "payment", "stock", "table", "order"];

const ENTITY_ROUTES: Record<string, (id: string) => string> = {
  sale: (id) => `/ventas/${id}`,
  customer: (id) => `/clientes/${id}`,
  employee: (id) => `/empleados/${id}`,
  supplier: (id) => `/proveedores/${id}`,
  invoice: () => `/facturas`,
  shift: (id) => `/turnos/${id}`,
  product: () => `/inventario`,
  purchase: () => `/compras`,
  transfer: () => `/transferencias`,
};

function actionIcon(action: string) {
  const a = action.toLowerCase();
  if (a.includes("cancel") || a.includes("anul") || a.includes("delet") || a.includes("elim")) return <Trash2 className="h-3 w-3" />;
  if (a.includes("crea") || a.includes("alta") || a.includes("nuev") || a.includes("regist")) return <Plus className="h-3 w-3" />;
  if (a.includes("actual") || a.includes("edit") || a.includes("modif")) return <Edit className="h-3 w-3" />;
  if (a.includes("error") || a.includes("fall")) return <AlertCircle className="h-3 w-3" />;
  if (a.includes("complet") || a.includes("cerr") || a.includes("pag")) return <CheckCircle2 className="h-3 w-3" />;
  return <Activity className="h-3 w-3" />;
}

function actionVariant(action: string): "default" | "destructive" | "secondary" | "outline" {
  const a = action.toLowerCase();
  if (a.includes("cancel") || a.includes("anul") || a.includes("delet") || a.includes("elim") || a.includes("error")) return "destructive";
  if (a.includes("crea") || a.includes("alta") || a.includes("complet")) return "default";
  if (a.includes("edit") || a.includes("actual")) return "secondary";
  return "outline";
}

export default function Auditoria() {
  const { t } = useTranslation();
  const { isSuperadmin, loading: saLoading } = useSuperadmin();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);

  const [filters, setFilters] = useState({
    tenant_id: "",
    entity_type: "",
    entity_id: "",
    user_id: "",
    search: "",
    from_date: "",
    to_date: "",
  });

  const [detail, setDetail] = useState<AuditLog | null>(null);
  const [entityHistory, setEntityHistory] = useState<{ open: boolean; log?: AuditLog; logs: AuditLog[]; loading: boolean }>({ open: false, logs: [], loading: false });

  useEffect(() => {
    if (isSuperadmin) {
      supabase.from("tenants").select("id, name").order("name").then(({ data }) => setTenants(data ?? []));
    }
  }, [isSuperadmin]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("audit-logs", {
        body: {
          tenant_id: filters.tenant_id || undefined,
          entity_type: filters.entity_type || undefined,
          entity_id: filters.entity_id || undefined,
          user_id: filters.user_id || undefined,
          search: filters.search || undefined,
          from_date: filters.from_date ? new Date(filters.from_date).toISOString() : undefined,
          to_date: filters.to_date ? new Date(filters.to_date + "T23:59:59").toISOString() : undefined,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
      });
      if (error) throw error;
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
    } catch (e: any) {
      toast.error("Error cargando auditoría: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperadmin) fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperadmin, page]);

  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    const byUser = new Set<string>();
    let destructive = 0;
    logs.forEach(l => {
      byType[l.entity_type] = (byType[l.entity_type] ?? 0) + 1;
      if (l.performed_by) byUser.add(l.performed_by);
      if (actionVariant(l.action) === "destructive") destructive++;
    });
    return { types: Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 5), users: byUser.size, destructive };
  }, [logs]);

  const exportCSV = () => {
    const rows = [
      ["Fecha", "Usuario", "Email", "Empresa", "Entidad", "Entity ID", "Acción", "Descripción", "Metadata"],
      ...logs.map(l => [
        format(new Date(l.created_at), "yyyy-MM-dd HH:mm:ss"),
        l.user_name ?? "",
        l.user_email ?? "",
        l.tenant_name ?? "",
        l.entity_type,
        l.entity_id ?? "",
        l.action,
        l.description ?? "",
        l.metadata ? JSON.stringify(l.metadata) : "",
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auditoria_${format(new Date(), "yyyyMMdd_HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openEntityHistory = async (log: AuditLog) => {
    setEntityHistory({ open: true, log, logs: [], loading: true });
    try {
      const { data, error } = await supabase.functions.invoke("audit-logs", {
        body: { entity_type: log.entity_type, entity_id: log.entity_id, limit: 200 },
      });
      if (error) throw error;
      setEntityHistory({ open: true, log, logs: data.logs ?? [], loading: false });
    } catch (e: any) {
      toast.error("Error: " + e.message);
      setEntityHistory(s => ({ ...s, loading: false }));
    }
  };

  const filterByUser = (log: AuditLog) => {
    if (!log.performed_by) return;
    setPage(0);
    setFilters(f => ({ ...f, user_id: log.performed_by!, entity_id: "" }));
    setTimeout(fetchLogs, 0);
    toast.success(`Filtrado por ${log.user_name ?? log.user_email}`);
  };

  const filterByEntityType = (log: AuditLog) => {
    setPage(0);
    setFilters(f => ({ ...f, entity_type: log.entity_type, entity_id: "" }));
    setTimeout(fetchLogs, 0);
  };

  const goToEntity = (log: AuditLog) => {
    const route = ENTITY_ROUTES[log.entity_type];
    if (route && log.entity_id) navigate(route(log.entity_id));
    else toast.info("No hay vista detallada para este tipo");
  };

  const clearFilters = () => {
    setFilters({ tenant_id: "", entity_type: "", entity_id: "", user_id: "", search: "", from_date: "", to_date: "" });
    setPage(0);
    setTimeout(fetchLogs, 0);
  };

  const hasActiveFilters = Object.values(filters).some(v => v !== "");
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (saLoading) {
    return <AppLayout title={t("nav.items.audit")}><div className="flex justify-center py-16"><div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div></AppLayout>;
  }
  if (!isSuperadmin) return <Navigate to="/" replace />;

  return (
    <AppLayout title={t("nav.items.audit")}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <ShieldAlert className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-heading font-semibold text-sm">Registro de Auditoría</h2>
              <p className="text-[10px] text-muted-foreground">{total.toLocaleString()} eventos · acceso restringido a superadmin</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={fetchLogs} className="gap-1 text-xs">
              <RefreshCw className="h-3.5 w-3.5" /> Actualizar
            </Button>
            <Button size="sm" variant="outline" onClick={exportCSV} className="gap-1 text-xs" disabled={logs.length === 0}>
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="bg-card rounded-xl p-3 border shadow-card">
            <p className="text-[10px] text-muted-foreground uppercase">Eventos página</p>
            <p className="text-lg font-heading font-semibold">{logs.length}</p>
          </div>
          <div className="bg-card rounded-xl p-3 border shadow-card">
            <p className="text-[10px] text-muted-foreground uppercase">Usuarios activos</p>
            <p className="text-lg font-heading font-semibold">{stats.users}</p>
          </div>
          <div className="bg-card rounded-xl p-3 border shadow-card">
            <p className="text-[10px] text-muted-foreground uppercase">Destructivos</p>
            <p className="text-lg font-heading font-semibold text-destructive">{stats.destructive}</p>
          </div>
          <div className="bg-card rounded-xl p-3 border shadow-card">
            <p className="text-[10px] text-muted-foreground uppercase">Top entidad</p>
            <p className="text-sm font-heading font-semibold capitalize truncate">{stats.types[0]?.[0] ?? "—"} <span className="text-muted-foreground text-[10px]">({stats.types[0]?.[1] ?? 0})</span></p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-card rounded-xl p-4 border shadow-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Filtros</span>
              {hasActiveFilters && <Badge variant="secondary" className="text-[10px]">activos</Badge>}
            </div>
            {hasActiveFilters && (
              <Button size="sm" variant="ghost" onClick={clearFilters} className="text-[10px] h-7 gap-1">
                <X className="h-3 w-3" /> Limpiar
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar acción/desc..."
                value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && (setPage(0), fetchLogs())}
                className="pl-8 h-9 text-xs"
              />
            </div>
            <Select value={filters.tenant_id || "all"} onValueChange={v => setFilters(f => ({ ...f, tenant_id: v === "all" ? "" : v }))}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Empresa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las empresas</SelectItem>
                {tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.entity_type || "all"} onValueChange={v => setFilters(f => ({ ...f, entity_type: v === "all" ? "" : v }))}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Tipo entidad" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las entidades</SelectItem>
                {ENTITY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={filters.from_date} onChange={e => setFilters(f => ({ ...f, from_date: e.target.value }))} className="h-9 text-xs" />
            <div className="flex gap-2">
              <Input type="date" value={filters.to_date} onChange={e => setFilters(f => ({ ...f, to_date: e.target.value }))} className="h-9 text-xs flex-1" />
              <Button size="sm" onClick={() => { setPage(0); fetchLogs(); }} className="gradient-brand text-primary-foreground text-xs h-9">Aplicar</Button>
            </div>
          </div>
          {filters.user_id && (
            <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
              <UserSearch className="h-3 w-3" /> Filtrando por usuario: <code className="bg-muted px-1.5 py-0.5 rounded">{filters.user_id.slice(0, 8)}…</code>
              <Button size="sm" variant="ghost" className="h-5 px-1" onClick={() => { setFilters(f => ({ ...f, user_id: "" })); setTimeout(fetchLogs, 0); }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        {/* Logs */}
        <div className="bg-card rounded-xl border shadow-card overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
          ) : logs.length === 0 ? (
            <div className="text-center py-16">
              <ShieldAlert className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Sin eventos para los filtros aplicados</p>
            </div>
          ) : (
            <>
              <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30 border-b font-heading">
                <div className="col-span-2">Fecha</div>
                <div className="col-span-2">Usuario</div>
                <div className="col-span-2">Empresa</div>
                <div className="col-span-2">Entidad</div>
                <div className="col-span-3">Acción / Descripción</div>
                <div className="col-span-1 text-right">Acciones</div>
              </div>
              <div className="divide-y">
                {logs.map((l, i) => (
                  <motion.div
                    key={l.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.01, 0.2) }}
                    className="grid grid-cols-1 md:grid-cols-12 gap-2 px-4 py-3 text-xs hover:bg-muted/30 transition-colors group"
                  >
                    <div className="col-span-2 flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span>{format(new Date(l.created_at), "dd MMM HH:mm:ss", { locale: es })}</span>
                    </div>
                    <div className="col-span-2 flex items-center gap-1.5 min-w-0">
                      <UserIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{l.user_name ?? "Sistema"}</p>
                        {l.user_email && <p className="text-[10px] text-muted-foreground truncate">{l.user_email}</p>}
                      </div>
                    </div>
                    <div className="col-span-2 flex items-center gap-1.5 min-w-0">
                      <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{l.tenant_name ?? "—"}</span>
                    </div>
                    <div className="col-span-2 flex items-center gap-1">
                      <Badge variant="secondary" className="text-[10px] capitalize">{l.entity_type}</Badge>
                      {l.entity_id && (
                        <code className="text-[9px] text-muted-foreground truncate">{l.entity_id.slice(0, 6)}</code>
                      )}
                    </div>
                    <div className="col-span-3">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={actionVariant(l.action)} className="text-[10px] gap-1 px-1.5 py-0">
                          {actionIcon(l.action)} {l.action}
                        </Badge>
                      </div>
                      {l.description && <p className="text-[10px] text-muted-foreground line-clamp-2 mt-1">{l.description}</p>}
                    </div>
                    <div className="col-span-1 flex justify-end items-start">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel className="text-[10px]">Acciones</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => setDetail(l)} className="text-xs">
                            <Eye className="h-3.5 w-3.5 mr-2" /> Ver detalle completo
                          </DropdownMenuItem>
                          {l.entity_id && (
                            <DropdownMenuItem onClick={() => openEntityHistory(l)} className="text-xs">
                              <History className="h-3.5 w-3.5 mr-2" /> Historial de esta entidad
                            </DropdownMenuItem>
                          )}
                          {ENTITY_ROUTES[l.entity_type] && l.entity_id && (
                            <DropdownMenuItem onClick={() => goToEntity(l)} className="text-xs">
                              <ExternalLink className="h-3.5 w-3.5 mr-2" /> Abrir entidad
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {l.performed_by && (
                            <DropdownMenuItem onClick={() => filterByUser(l)} className="text-xs">
                              <UserSearch className="h-3.5 w-3.5 mr-2" /> Filtrar por este usuario
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => filterByEntityType(l)} className="text-xs">
                            <Layers className="h-3.5 w-3.5 mr-2" /> Filtrar por tipo "{l.entity_type}"
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </motion.div>
                ))}
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t text-xs">
                <span className="text-muted-foreground">
                  Página {page + 1} de {Math.max(1, totalPages)} · {total.toLocaleString()} eventos
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="text-xs h-8">Anterior</Button>
                  <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)} className="text-xs h-8">Siguiente</Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!detail} onOpenChange={o => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {detail && actionIcon(detail.action)} {detail?.action}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {detail && format(new Date(detail.created_at), "PPPp", { locale: es })}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <Tabs defaultValue="info" className="w-full">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="info" className="text-xs">Información</TabsTrigger>
                <TabsTrigger value="meta" className="text-xs">Metadata JSON</TabsTrigger>
              </TabsList>
              <TabsContent value="info" className="space-y-3 mt-3">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground text-[10px] uppercase">Usuario</p>
                    <p className="font-medium">{detail.user_name ?? "Sistema"}</p>
                    {detail.user_email && <p className="text-[10px] text-muted-foreground">{detail.user_email}</p>}
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[10px] uppercase">Empresa</p>
                    <p className="font-medium">{detail.tenant_name ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[10px] uppercase">Tipo entidad</p>
                    <Badge variant="secondary" className="capitalize">{detail.entity_type}</Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[10px] uppercase">Entity ID</p>
                    <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded break-all">{detail.entity_id ?? "—"}</code>
                  </div>
                </div>
                {detail.description && (
                  <div>
                    <p className="text-muted-foreground text-[10px] uppercase mb-1">Descripción</p>
                    <p className="text-xs bg-muted/50 p-2 rounded">{detail.description}</p>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="meta" className="mt-3">
                <pre className="text-[10px] bg-muted/50 p-3 rounded overflow-auto max-h-[400px]">
                  {detail.metadata ? JSON.stringify(detail.metadata, null, 2) : "Sin metadata"}
                </pre>
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter className="gap-2 flex-wrap sm:justify-between">
            <div className="flex gap-2 flex-wrap">
              {detail?.entity_id && (
                <Button size="sm" variant="outline" onClick={() => detail && openEntityHistory(detail)} className="text-xs">
                  <History className="h-3.5 w-3.5 mr-1" /> Ver historial
                </Button>
              )}
              {detail && ENTITY_ROUTES[detail.entity_type] && detail.entity_id && (
                <Button size="sm" variant="outline" onClick={() => { goToEntity(detail); setDetail(null); }} className="text-xs">
                  <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir entidad
                </Button>
              )}
            </div>
            <Button size="sm" onClick={() => setDetail(null)} className="text-xs">Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Entity History Dialog */}
      <Dialog open={entityHistory.open} onOpenChange={o => !o && setEntityHistory({ open: false, logs: [], loading: false })}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" /> Historial completo de la entidad
            </DialogTitle>
            <DialogDescription className="text-xs">
              {entityHistory.log && (
                <span>
                  <Badge variant="secondary" className="capitalize mr-1">{entityHistory.log.entity_type}</Badge>
                  <code className="text-[10px]">{entityHistory.log.entity_id}</code>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {entityHistory.loading ? (
            <div className="flex justify-center py-12"><div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
          ) : entityHistory.logs.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">Sin historial</p>
          ) : (
            <div className="relative pl-6 space-y-3 max-h-[500px] overflow-y-auto">
              <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
              {entityHistory.logs.map((l) => (
                <div key={l.id} className="relative">
                  <div className="absolute -left-[18px] top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
                  <div className="bg-muted/30 rounded-lg p-3 border">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Badge variant={actionVariant(l.action)} className="text-[10px] gap-1">
                          {actionIcon(l.action)} {l.action}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(l.created_at), "dd MMM yyyy HH:mm:ss", { locale: es })}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {l.user_name ?? l.user_email ?? "Sistema"}
                      </span>
                    </div>
                    {l.description && <p className="text-xs mt-2">{l.description}</p>}
                    {l.metadata && Object.keys(l.metadata).length > 0 && (
                      <details className="mt-2">
                        <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">Ver metadata</summary>
                        <pre className="text-[9px] bg-background p-2 rounded mt-1 overflow-auto">{JSON.stringify(l.metadata, null, 2)}</pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
