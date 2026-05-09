import { useEffect, useState, useMemo } from "react";
import { Navigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useSuperadmin } from "@/hooks/useSuperadmin";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, RefreshCw, Download, ShieldAlert, Building2, User as UserIcon, Clock } from "lucide-react";
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
const ENTITY_TYPES = ["sale", "purchase", "product", "customer", "employee", "shift", "invoice", "tenant", "user", "transfer", "payment"];

export default function Auditoria() {
  const { isSuperadmin, loading: saLoading } = useSuperadmin();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);

  const [filters, setFilters] = useState({
    tenant_id: "",
    entity_type: "",
    search: "",
    from_date: "",
    to_date: "",
  });

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

  const exportCSV = () => {
    const rows = [
      ["Fecha", "Usuario", "Email", "Empresa", "Entidad", "Acción", "Descripción"],
      ...logs.map(l => [
        format(new Date(l.created_at), "yyyy-MM-dd HH:mm:ss"),
        l.user_name ?? "",
        l.user_email ?? "",
        l.tenant_name ?? "",
        l.entity_type,
        l.action,
        l.description ?? "",
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

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (saLoading) {
    return <AppLayout title="Auditoría"><div className="flex justify-center py-16"><div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div></AppLayout>;
  }
  if (!isSuperadmin) return <Navigate to="/app" replace />;

  return (
    <AppLayout title="Auditoría Global">
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-heading font-semibold text-sm">Registro de Auditoría</h2>
              <p className="text-[10px] text-muted-foreground">{total.toLocaleString()} eventos registrados</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={fetchLogs} className="gap-1 text-xs">
              <RefreshCw className="h-3.5 w-3.5" /> Actualizar
            </Button>
            <Button size="sm" variant="outline" onClick={exportCSV} className="gap-1 text-xs" disabled={logs.length === 0}>
              <Download className="h-3.5 w-3.5" /> Exportar CSV
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-card rounded-xl p-4 border shadow-card">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">Filtros</span>
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
                <div className="col-span-4">Acción / Descripción</div>
              </div>
              <div className="divide-y">
                {logs.map((l, i) => (
                  <motion.div
                    key={l.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.01, 0.2) }}
                    className="grid grid-cols-1 md:grid-cols-12 gap-2 px-4 py-3 text-xs hover:bg-muted/30 transition-colors"
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
                    <div className="col-span-2">
                      <Badge variant="secondary" className="text-[10px] capitalize">{l.entity_type}</Badge>
                    </div>
                    <div className="col-span-4">
                      <p className="font-medium">{l.action}</p>
                      {l.description && <p className="text-[10px] text-muted-foreground line-clamp-2">{l.description}</p>}
                    </div>
                  </motion.div>
                ))}
              </div>
              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t text-xs">
                <span className="text-muted-foreground">
                  Página {page + 1} de {Math.max(1, totalPages)}
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
    </AppLayout>
  );
}
