import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Download, FileSpreadsheet, Loader2, ShieldCheck, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  EntityForm, autoMapHeaders, callDataCenter, downloadEntityTemplate, entityForSheet, errorReportCsv,
  parseSheet, sha256Hex,
} from "@/lib/dataCenter";
import {
  ImportContext, StagingRow, analyze, buildStagingRows, commitPayload, rowLevel, summarize,
} from "@/lib/dataCenterStaging";
import { ImportReviewTable } from "./ImportReviewTable";

type Strategy = "upsert" | "create" | "update" | "fail";

interface Props {
  forms: EntityForm[];
  tenantId: string | null;
  onDone?: () => void;
}

const MAX_ROWS = 5000;
const MAX_BYTES = 6 * 1024 * 1024;
const STEPS = ["Origen", "Mapeo", "Revisión y edición", "Preview final", "Resultado"];

export function DataImportWizard({ forms, tenantId, onDone }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const bufferRef = useRef<ArrayBuffer | null>(null);

  const [step, setStep] = useState(1);
  const [entity, setEntity] = useState(forms[0]?.key ?? "products");
  const [fileName, setFileName] = useState("");
  const [checksum, setChecksum] = useState("");
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheet, setSheet] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [strategy, setStrategy] = useState<Strategy>("upsert");
  const [restorePoint, setRestorePoint] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ctx, setCtx] = useState<ImportContext>({ existing: [], categories: [], units: [] });
  const [rows, setRows] = useState<StagingRow[]>([]);
  const [serverPreview, setServerPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [createCategories, setCreateCategories] = useState(true);

  const form = useMemo(() => forms.find((f) => f.key === entity) ?? forms[0], [forms, entity]);
  const summary = useMemo(() => summarize(rows, ctx.categories), [rows, ctx.categories]);

  const reset = () => {
    bufferRef.current = null;
    setStep(1); setFileName(""); setHeaders([]); setRawRows([]); setMapping({});
    setRows([]); setServerPreview(null); setResult(null); setChecksum(""); setSheets([]); setSheet("");
  };

  const logEvent = (event: string, description: string, metadata: Record<string, unknown> = {}) =>
    callDataCenter({ action: "import_event", tenant_id: tenantId, entity: form.key, event, description, metadata })
      .catch(() => undefined);

  const loadSheet = (buf: ArrayBuffer, sheetName?: string) => {
    const parsed = parseSheet(buf, sheetName);
    if (parsed.rows.length === 0) throw new Error("La hoja no contiene filas con datos.");
    if (parsed.rows.length > MAX_ROWS) throw new Error(`Máximo ${MAX_ROWS} filas por hoja.`);
    const detected = entityForSheet(forms, parsed.sheet);
    const target = detected ?? form;
    setEntity(target.key);
    setSheets(parsed.sheets);
    setSheet(parsed.sheet);
    setHeaders(parsed.headers);
    setRawRows(parsed.rows);
    setMapping(autoMapHeaders(target, parsed.headers));
    return { parsed, target };
  };

  const onFile = async (file: File) => {
    if (file.size > MAX_BYTES) { toast({ title: "Archivo demasiado grande", description: "El límite es 6 MB.", variant: "destructive" }); return; }
    try {
      const buf = await file.arrayBuffer();
      bufferRef.current = buf;
      const all = parseSheet(buf);
      const first = all.sheets.find((s) => entityForSheet(forms, s)) ?? all.sheets[0];
      loadSheet(buf, first);
      setFileName(file.name);
      setChecksum(await sha256Hex(buf));
      setStep(2);
    } catch (e) {
      toast({ title: "No se pudo leer el archivo", description: (e as Error).message, variant: "destructive" });
    }
  };

  const changeSheet = (name: string) => {
    if (!bufferRef.current) return;
    try { loadSheet(bufferRef.current, name); }
    catch (e) { toast({ title: "Hoja no utilizable", description: (e as Error).message, variant: "destructive" }); }
  };

  const missingRequired = form.fields.filter((fd) => fd.required && !Object.values(mapping).includes(fd.key));

  /** Loads the tenant context and builds the staging dataset (nothing is written). */
  const startReview = async () => {
    setBusy(true);
    try {
      const context = await callDataCenter<ImportContext>({ action: "import_context", entity: form.key, tenant_id: tenantId });
      const safeCtx: ImportContext = {
        existing: context.existing ?? [], categories: context.categories ?? [], units: context.units ?? [],
      };
      setCtx(safeCtx);
      const staged = analyze(form, buildStagingRows(rawRows, mapping), safeCtx);
      setRows(staged);
      setStep(3);
      logEvent("IMPORT_REVIEWED", `Revisión previa de ${form.label}: ${staged.length} filas analizadas`, {
        entity: form.key, rows: staged.length, file_name: fileName,
      });
    } catch (e) {
      toast({ title: "No se pudo preparar la revisión", description: (e as Error).message, variant: "destructive" });
    }
    setBusy(false);
  };

  const reanalyze = (next: StagingRow[]) => setRows(analyze(form, next, ctx));

  const patch = (ids: string[], values: Record<string, unknown>) => {
    reanalyze(rows.map((r) => (ids.includes(r.id)
      ? { ...r, values: { ...r.values, ...values }, edited: true }
      : r)));
  };

  const toggleInclude = (ids: string[], included: boolean) =>
    reanalyze(rows.map((r) => (ids.includes(r.id) ? { ...r, included } : r)));

  const acceptWarnings = (ids: string[], accepted: boolean) =>
    reanalyze(rows.map((r) => (ids.includes(r.id) ? { ...r, warningsAccepted: accepted } : r)));

  const applySuggestion = (id: string, suggestionId: string) => {
    reanalyze(rows.map((r) => {
      if (r.id !== id) return r;
      const s = r.suggestions.find((x) => x.id === suggestionId);
      if (!s) return r;
      const { __create_category, ...rest } = s.patch as Record<string, unknown>;
      return {
        ...r,
        values: { ...r.values, ...rest },
        edited: true,
        warningsAccepted: __create_category ? true : r.warningsAccepted,
        appliedSuggestions: [...r.appliedSuggestions, suggestionId],
      };
    }));
  };

  const dismissSuggestion = (id: string, suggestionId: string) =>
    reanalyze(rows.map((r) => (r.id === id ? { ...r, dismissedSuggestions: [...r.dismissedSuggestions, suggestionId] } : r)));

  const applyAllSuggestions = (ids: string[]) => {
    reanalyze(rows.map((r) => {
      if (!ids.includes(r.id) || r.suggestions.length === 0) return r;
      const values = { ...r.values };
      const applied = [...r.appliedSuggestions];
      let warn = r.warningsAccepted;
      r.suggestions.forEach((s) => {
        if (s.kind === "fill") return;
        const { __create_category, ...rest } = s.patch as Record<string, unknown>;
        Object.assign(values, rest);
        if (__create_category) warn = true;
        applied.push(s.id);
      });
      return { ...r, values, edited: true, warningsAccepted: warn, appliedSuggestions: applied };
    }));
  };

  const goPreview = async () => {
    setBusy(true);
    try {
      const payload = commitPayload(rows);
      if (payload.length === 0) throw new Error("No hay filas válidas seleccionadas para importar.");
      const res = await callDataCenter({
        action: "import", entity: form.key, tenant_id: tenantId, rows: payload, strategy, dry_run: true,
      });
      setServerPreview(res);
      setStep(4);
      const edited = rows.filter((r) => r.edited).length;
      if (edited) logEvent("IMPORT_MODIFIED", `${edited} filas corregidas manualmente antes de confirmar`, { entity: form.key, edited });
    } catch (e) {
      toast({ title: "Error al validar en el servidor", description: (e as Error).message, variant: "destructive" });
    }
    setBusy(false);
  };

  const commit = async () => {
    setBusy(true);
    try {
      const res = await callDataCenter({
        action: "import", entity: form.key, tenant_id: tenantId, rows: commitPayload(rows),
        strategy, dry_run: false, create_restore_point: restorePoint,
        create_categories: createCategories ? summary.newCategories : [],
        file_name: fileName, file_checksum: checksum,
      });
      setResult(res);
      setStep(5);
      onDone?.();
      toast({ title: "Importación completada", description: `${res.created ?? 0} creados · ${res.updated ?? 0} actualizados` });
    } catch (e) {
      toast({ title: "Importación fallida", description: (e as Error).message, variant: "destructive" });
    }
    setBusy(false);
  };

  const cancel = () => {
    logEvent("IMPORT_CANCELLED", `Importación de ${form.label} cancelada antes de confirmar`, { entity: form.key, rows: rows.length });
    reset();
    toast({ title: "Importación cancelada", description: "No se modificó ningún dato." });
  };

  const downloadErrors = () => {
    const errs = rows.flatMap((r) => r.issues.map((i) => ({
      row: r.rowNo, field: i.field, value: String(r.values[i.field ?? ""] ?? ""),
      problem: `${i.level === "error" ? "ERROR" : "AVISO"}: ${i.message}`, fix: i.fix ?? "",
    })));
    const blob = new Blob([errorReportCsv(errs)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `revision-${form.key}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" /> Estudio de importación
        </CardTitle>
        <CardDescription>Paso {step} de 5 · {STEPS[step - 1]}</CardDescription>
        <div className="flex gap-1 pt-2">
          {STEPS.map((s, i) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ------------------- 1. ORIGEN ------------------- */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>¿Qué vas a importar?</Label>
                <Select value={entity} onValueChange={(v) => { setEntity(v); reset(); setEntity(v); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {forms.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{form.description}</p>
              </div>
              <div className="space-y-2">
                <Label>Duplicados</Label>
                <Select value={strategy} onValueChange={(v) => setStrategy(v as Strategy)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upsert">Crear nuevos y actualizar existentes</SelectItem>
                    <SelectItem value="create">Solo crear nuevos (ignorar existentes)</SelectItem>
                    <SelectItem value="update">Solo actualizar existentes</SelectItem>
                    <SelectItem value="fail">Detener si hay duplicados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button variant="outline" size="sm" onClick={() => downloadEntityTemplate(form)}>
              <Download className="h-4 w-4 mr-2" /> Descargar plantilla de {form.label}
            </Button>

            <div
              className="rounded-lg border border-dashed p-8 text-center cursor-pointer hover:bg-muted/40 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
            >
              <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Arrastra tu Excel, CSV o la plantilla del negocio completo</p>
              <p className="text-xs text-muted-foreground mt-1">Máximo {MAX_ROWS} filas por hoja · 6 MB</p>
              <input
                ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ""; }}
              />
            </div>
          </div>
        )}

        {/* ------------------- 2. MAPEO ------------------- */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="text-sm">
                <span className="font-medium">{fileName}</span>
                <span className="text-muted-foreground"> · {rawRows.length} filas · {headers.length} columnas</span>
              </div>
              {sheets.length > 1 && (
                <div className="space-y-1">
                  <Label className="text-xs">Hoja del archivo</Label>
                  <Select value={sheet} onValueChange={changeSheet}>
                    <SelectTrigger className="h-8 w-[240px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {sheets.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}{entityForSheet(forms, s) ? "" : " (no reconocida)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={reset}>Cambiar archivo</Button>
            </div>

            <Alert>
              <AlertTitle className="text-sm">Destino: {form.label}</AlertTitle>
              <AlertDescription className="text-xs">
                Detectado a partir de la hoja «{sheet}». Puedes cambiar la hoja o volver atrás para elegir otra entidad.
              </AlertDescription>
            </Alert>

            {missingRequired.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Faltan columnas obligatorias</AlertTitle>
                <AlertDescription>{missingRequired.map((f) => f.header).join(", ")}</AlertDescription>
              </Alert>
            )}

            <div className="rounded-md border max-h-80 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Columna del archivo</TableHead>
                    <TableHead>Campo del sistema</TableHead>
                    <TableHead>Primer valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {headers.map((h) => (
                    <TableRow key={h}>
                      <TableCell className="font-medium">{h}</TableCell>
                      <TableCell>
                        <Select
                          value={mapping[h] ?? "__ignore"}
                          onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v === "__ignore" ? "" : v }))}
                        >
                          <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__ignore">— Ignorar —</SelectItem>
                            {form.fields.map((fd) => (
                              <SelectItem key={fd.key} value={fd.key}>{fd.header}{fd.required ? " *" : ""}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs truncate max-w-[200px]">
                        {String(rawRows[0]?.[h] ?? "")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4 mr-2" /> Atrás</Button>
              <Button onClick={startReview} disabled={busy || missingRequired.length > 0}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                Analizar y revisar
              </Button>
            </div>
          </div>
        )}

        {/* ------------------- 3. REVISIÓN ------------------- */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Registros encontrados", value: summary.total },
                { label: "Válidos", value: summary.valid ?? summary.total - summary.errors - summary.warnings },
                { label: "Con sugerencias", value: summary.suggestions },
                { label: "Con errores", value: summary.errors },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-semibold">{s.value as number}</p>
                </div>
              ))}
            </div>

            {summary.errors > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{summary.errors} filas con errores críticos</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>Corrige las celdas marcadas o excluye esas filas para poder continuar.</p>
                  <Button size="sm" variant="outline" onClick={downloadErrors}>
                    <Download className="h-4 w-4 mr-2" /> Informe de revisión (CSV)
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <ImportReviewTable
              form={form} rows={rows} categories={ctx.categories}
              onPatch={patch} onToggleInclude={toggleInclude}
              onApplySuggestion={applySuggestion} onDismissSuggestion={dismissSuggestion}
              onAcceptWarnings={acceptWarnings} onApplyAllSuggestions={applyAllSuggestions}
            />

            <div className="flex flex-wrap justify-between gap-2">
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4 mr-2" /> Mapeo</Button>
                <Button variant="ghost" onClick={cancel}>Cancelar</Button>
              </div>
              <Button onClick={goPreview} disabled={busy || summary.blocked || summary.create + summary.update === 0}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                Ver preview final
              </Button>
            </div>
            {summary.blocked && (
              <p className="text-xs text-destructive">
                No puedes continuar mientras existan errores críticos en filas incluidas.
              </p>
            )}
          </div>
        )}

        {/* ------------------- 4. PREVIEW ------------------- */}
        {step === 4 && serverPreview && (
          <div className="space-y-4">
            <div className="rounded-lg border divide-y">
              <div className="p-3 font-medium text-sm">Resumen de importación</div>
              {[
                ["Nuevos", serverPreview.to_create],
                ["Actualizaciones", serverPreview.to_update],
                ["Sin cambios", summary.unchanged],
                ["Excluidos", summary.excluded],
                ["Advertencias aceptadas", rows.filter((r) => r.warningsAccepted).length],
                ["Errores", serverPreview.errors],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-semibold tabular-nums">{Number(v ?? 0)}</span>
                </div>
              ))}
            </div>

            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>¿Qué va a cambiar?</AlertTitle>
              <AlertDescription className="text-sm space-y-1">
                <p>{form.label}: {serverPreview.to_create} nuevos y {serverPreview.to_update} actualizados.</p>
                {summary.newCategories.length > 0 && (
                  <p>Categorías nuevas detectadas: {summary.newCategories.join(", ")}</p>
                )}
                <p>Los registros excluidos y las filas con errores no se tocan.</p>
              </AlertDescription>
            </Alert>

            {summary.newCategories.length > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={createCategories} onCheckedChange={(v) => setCreateCategories(!!v)} />
                Crear las {summary.newCategories.length} categorías nuevas al importar
              </label>
            )}

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={restorePoint} onCheckedChange={(v) => setRestorePoint(!!v)} />
              Crear punto de restauración antes de guardar (si falla, la importación se cancela)
            </label>

            {serverPreview.errors > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>El servidor rechazó {serverPreview.errors} filas</AlertTitle>
                <AlertDescription className="text-xs">
                  {(serverPreview.error_rows ?? []).slice(0, 5).map((e: any, i: number) => (
                    <p key={i}>Fila {e.row}: {e.problem}</p>
                  ))}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap justify-between gap-2">
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(3)}><ArrowLeft className="h-4 w-4 mr-2" /> Volver a revisar</Button>
                <Button variant="ghost" onClick={cancel}>Cancelar</Button>
              </div>
              <Button onClick={commit} disabled={busy || serverPreview.errors > 0 || serverPreview.to_create + serverPreview.to_update === 0}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Confirmar e importar
              </Button>
            </div>
          </div>
        )}

        {/* ------------------- 5. RESULTADO ------------------- */}
        {step === 5 && result && (
          <div className="space-y-4 text-center py-6">
            <CheckCircle2 className="h-12 w-12 mx-auto text-primary" />
            <div className="space-y-1">
              <p className="text-lg font-semibold">Importación completada</p>
              <p className="text-sm text-muted-foreground">
                {result.created ?? 0} creados · {result.updated ?? 0} actualizados · {summary.excluded} excluidos
                {result.categories_created ? ` · ${result.categories_created} categorías nuevas` : ""}
              </p>
              {result.restore_point_id && (
                <Badge variant="outline" className="mt-2">Punto de restauración creado</Badge>
              )}
            </div>
            <Button onClick={reset}>Importar otro archivo</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
