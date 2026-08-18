import { Fragment, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Lightbulb, Search, Undo2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { EntityForm } from "@/lib/dataCenter";
import { rowLevel, type StagingRow } from "@/lib/dataCenterStaging";

type Filter = "all" | "valid" | "warning" | "error" | "create" | "update" | "unchanged" | "suggested" | "excluded";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "valid", label: "Válidos" },
  { key: "warning", label: "Con advertencias" },
  { key: "error", label: "Con errores" },
  { key: "create", label: "Nuevos" },
  { key: "update", label: "Actualizaciones" },
  { key: "unchanged", label: "Sin cambios" },
  { key: "suggested", label: "Con sugerencias" },
  { key: "excluded", label: "Excluidos" },
];

const PAGE_SIZES = [25, 50, 100];

interface Props {
  form: EntityForm;
  rows: StagingRow[];
  categories: string[];
  onPatch: (ids: string[], patch: Record<string, unknown>) => void;
  onToggleInclude: (ids: string[], included: boolean) => void;
  onApplySuggestion: (id: string, suggestionId: string) => void;
  onDismissSuggestion: (id: string, suggestionId: string) => void;
  onAcceptWarnings: (ids: string[], accepted: boolean) => void;
  onApplyAllSuggestions: (ids: string[]) => void;
}

export function ImportReviewTable({
  form, rows, categories, onPatch, onToggleInclude,
  onApplySuggestion, onDismissSuggestion, onAcceptWarnings, onApplyAllSuggestions,
}: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");

  const fields = useMemo(
    () => form.fields.filter((fd) => rows.some((r) => fd.key in r.values)),
    [form, rows],
  );

  const counts = useMemo(() => ({
    all: rows.length,
    valid: rows.filter((r) => rowLevel(r) === "ok").length,
    warning: rows.filter((r) => rowLevel(r) === "warning").length,
    error: rows.filter((r) => rowLevel(r) === "error").length,
    create: rows.filter((r) => r.op === "create").length,
    update: rows.filter((r) => r.op === "update").length,
    unchanged: rows.filter((r) => r.op === "unchanged").length,
    suggested: rows.filter((r) => r.suggestions.length > 0).length,
    excluded: rows.filter((r) => !r.included).length,
  }), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const lvl = rowLevel(r);
      if (filter === "valid" && lvl !== "ok") return false;
      if (filter === "warning" && lvl !== "warning") return false;
      if (filter === "error" && lvl !== "error") return false;
      if (filter === "create" && r.op !== "create") return false;
      if (filter === "update" && r.op !== "update") return false;
      if (filter === "unchanged" && r.op !== "unchanged") return false;
      if (filter === "suggested" && r.suggestions.length === 0) return false;
      if (filter === "excluded" && r.included) return false;
      if (q && !Object.values(r.values).some((v) => String(v ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, filter, search]);

  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const selectedIds = Array.from(selected);
  const visibleIds = pageRows.map((r) => r.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggleSel = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleExp = (id: string) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const targets = () => (selectedIds.length ? selectedIds : []);

  return (
    <TooltipProvider>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.key} size="sm"
              variant={filter === f.key ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => { setFilter(f.key); setPage(0); }}
            >
              {f.label} <Badge variant="secondary" className="ml-2 px-1.5">{counts[f.key]}</Badge>
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 h-9" placeholder="Buscar en los datos…"
              value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
            <SelectTrigger className="h-9 w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s} / página</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {/* ---- bulk actions ---- */}
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium">{selectedIds.length} seleccionados</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!selectedIds.length}
              onClick={() => onApplyAllSuggestions(targets())}>
              <Lightbulb className="h-3.5 w-3.5 mr-1" /> Aceptar sugerencias
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!selectedIds.length}
              onClick={() => onAcceptWarnings(targets(), true)}>
              Ignorar advertencias
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!selectedIds.length}
              onClick={() => onToggleInclude(targets(), false)}>
              Excluir de la importación
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!selectedIds.length}
              onClick={() => onToggleInclude(targets(), true)}>
              <Undo2 className="h-3.5 w-3.5 mr-1" /> Volver a incluir
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={!selectedIds.length}
              onClick={() => setSelected(new Set())}>Limpiar selección</Button>
          </div>
          {fields.some((f) => f.key === "category") && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Asignar categoría a la selección</Label>
                <Select value={bulkCategory} onValueChange={setBulkCategory}>
                  <SelectTrigger className="h-8 w-[220px] text-xs"><SelectValue placeholder="Elegir categoría" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!selectedIds.length || !bulkCategory}
                onClick={() => onPatch(targets(), { category: bulkCategory })}>
                Aplicar
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-md border overflow-auto max-h-[60vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={(v) => setSelected((prev) => {
                      const n = new Set(prev);
                      visibleIds.forEach((id) => (v ? n.add(id) : n.delete(id)));
                      return n;
                    })}
                  />
                </TableHead>
                <TableHead className="w-8" />
                <TableHead className="w-14 text-xs">Fila</TableHead>
                <TableHead className="w-24 text-xs">Estado</TableHead>
                <TableHead className="w-28 text-xs">Acción</TableHead>
                {fields.map((fd) => (
                  <TableHead key={fd.key} className="text-xs whitespace-nowrap">
                    {fd.header}{fd.required && <span className="text-destructive"> *</span>}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 && (
                <TableRow><TableCell colSpan={fields.length + 5} className="text-center text-sm text-muted-foreground py-8">
                  Ningún registro con este filtro.
                </TableCell></TableRow>
              )}
              {pageRows.map((r) => {
                const lvl = rowLevel(r);
                const open = expanded.has(r.id);
                return (
                  <Fragment key={r.id}>
                    <TableRow className={!r.included ? "opacity-50" : lvl === "error" ? "bg-destructive/5" : ""}>
                      <TableCell><Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleSel(r.id)} /></TableCell>
                      <TableCell>
                        {(r.issues.length > 0 || r.suggestions.length > 0) && (
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => toggleExp(r.id)}>
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.rowNo}</TableCell>
                      <TableCell>
                        {lvl === "error" ? (
                          <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Error</Badge>
                        ) : lvl === "warning" ? (
                          <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600">
                            <AlertTriangle className="h-3 w-3" /> {r.warningsAccepted ? "Aceptado" : "Aviso"}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Listo</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {!r.included ? <Badge variant="outline">Excluido</Badge>
                          : r.op === "create" ? <Badge className="bg-primary/15 text-primary hover:bg-primary/15">Nuevo</Badge>
                          : r.op === "update" ? (
                            <Tooltip>
                              <TooltipTrigger asChild><Badge variant="secondary">Actualiza</Badge></TooltipTrigger>
                              <TooltipContent>Coincide con «{r.matchLabel}»</TooltipContent>
                            </Tooltip>
                          ) : <Badge variant="outline">Sin cambios</Badge>}
                        {r.suggestions.length > 0 && (
                          <Badge variant="outline" className="ml-1 gap-1 border-primary/40 text-primary">
                            <Lightbulb className="h-3 w-3" /> {r.suggestions.length}
                          </Badge>
                        )}
                      </TableCell>
                      {fields.map((fd) => {
                        const issue = r.issues.find((i) => i.field === fd.key);
                        return (
                          <TableCell key={fd.key} className="p-1">
                            <Input
                              value={String(r.values[fd.key] ?? "")}
                              onChange={(e) => onPatch([r.id], { [fd.key]: e.target.value })}
                              title={issue?.message}
                              className={`h-8 min-w-[130px] text-xs ${issue ? (issue.level === "error" ? "border-destructive" : "border-amber-500") : ""}`}
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                    {open && (
                      <TableRow key={`${r.id}-detail`} className="bg-muted/30">
                        <TableCell colSpan={fields.length + 5} className="space-y-2 py-3">
                          {r.issues.map((i, idx) => (
                            <p key={idx} className={`text-xs flex items-start gap-2 ${i.level === "error" ? "text-destructive" : "text-amber-600"}`}>
                              {i.level === "error" ? <XCircle className="h-3.5 w-3.5 mt-0.5" /> : <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />}
                              <span><strong>{i.message}.</strong> {i.fix}</span>
                            </p>
                          ))}
                          {r.suggestions.map((s) => (
                            <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2">
                              <Lightbulb className="h-4 w-4 text-primary" />
                              <span className="text-xs flex-1 min-w-[200px]">{s.message}</span>
                              {s.kind === "fill" && s.options?.length ? (
                                <Select onValueChange={(v) => onPatch([r.id], { [s.field ?? "category"]: v })}>
                                  <SelectTrigger className="h-7 w-[180px] text-xs"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                                  <SelectContent>{s.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                                </Select>
                              ) : (
                                <Button size="sm" className="h-7 text-xs" onClick={() => onApplySuggestion(r.id, s.id)}>{s.action}</Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onDismissSuggestion(r.id, s.id)}>
                                Rechazar
                              </Button>
                            </div>
                          ))}
                          {rowLevel(r) === "warning" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs"
                              onClick={() => onAcceptWarnings([r.id], !r.warningsAccepted)}>
                              {r.warningsAccepted ? "Revocar aceptación de avisos" : "Aceptar avisos de esta fila"}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 text-xs"
                            onClick={() => onToggleInclude([r.id], !r.included)}>
                            {r.included ? "Excluir esta fila" : "Incluir esta fila"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{filtered.length} registros · página {page + 1} de {pages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
