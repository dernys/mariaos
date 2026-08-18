import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  IMPORT_FIELDS, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, autoMap, downloadTemplate,
  errorReportCsv, parseWorkbook, validateRow, type ImportRow, type RowIssue,
} from "@/lib/productImport";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";

type Step = 1 | 2 | 3 | 4 | 5;
type Strategy = "skip" | "update" | "fail";

const STEP_LABELS: Record<Step, string> = {
  1: "Subir archivo",
  2: "Mapear columnas",
  3: "Revisar y corregir",
  4: "Confirmar",
  5: "Resumen",
};

export function ProductImportWizard({
  open, onOpenChange, tenantId, onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string | null;
  onImported?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [strategy, setStrategy] = useState<Strategy>("skip");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);

  const reset = () => {
    setStep(1); setFileName(""); setHeaders([]); setMapping({}); setRawRows([]);
    setRows([]); setResult(null); setProgress(0); setOnlyProblems(false);
  };

  const close = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const handleFile = async (file: File) => {
    if (!/\.(xlsx|xls)$/i.test(file.name)) { toast.error("Solo se admiten archivos .xlsx o .xls"); return; }
    if (file.size > MAX_IMPORT_BYTES) { toast.error("El archivo supera los 5 MB permitidos"); return; }
    try {
      const buf = await file.arrayBuffer();
      const { headers: h, rows: r } = parseWorkbook(buf);
      if (r.length === 0) { toast.error("El archivo no contiene filas de datos"); return; }
      if (r.length > MAX_IMPORT_ROWS) { toast.error(`Máximo ${MAX_IMPORT_ROWS} filas por archivo`); return; }
      setFileName(file.name);
      setHeaders(h);
      setMapping(autoMap(h));
      setRawRows(r);
      setStep(2);
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo leer el archivo");
    }
  };

  const applyMapping = () => {
    const mapped = Object.values(mapping);
    const missing = IMPORT_FIELDS.filter((f) => f.required && !mapped.includes(f.key));
    if (missing.length) { toast.error(`Falta mapear: ${missing.map((m) => m.header).join(", ")}`); return; }
    const out: ImportRow[] = rawRows.map((r, i) => {
      const o: ImportRow = { __row: i + 2 } as ImportRow;
      Object.entries(mapping).forEach(([header, key]) => { if (key) o[key] = String(r[header] ?? "").trim(); });
      return o;
    });
    setRows(out);
    setStep(3);
  };

  const issues = useMemo(() => rows.map((r, i) => validateRow(r, i, rows)), [rows]);
  const errorCount = issues.filter((i) => i.some((x) => x.level === "error")).length;
  const warningCount = issues.filter((i) => i.some((x) => x.level === "warning")).length;
  const validRows = rows.filter((_, i) => !issues[i].some((x) => x.level === "error"));

  const editCell = (index: number, key: string, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  };

  const downloadErrors = () => {
    const data = rows
      .map((r, i) => ({ row: Number(r.__row ?? i + 2), sku: String(r.sku ?? ""), messages: issues[i].map((x) => `${x.level === "error" ? "ERROR" : "AVISO"}: ${x.field ?? ""} ${x.message}`) }))
      .filter((x) => x.messages.length > 0);
    const blob = new Blob([errorReportCsv(data)], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "reporte-importacion.csv";
    a.click();
  };

  const runImport = async (dryRun: boolean) => {
    setBusy(true);
    setProgress(dryRun ? 30 : 45);
    try {
      const { data, error } = await supabase.functions.invoke("import-products", {
        body: { rows: validRows, strategy, dry_run: dryRun, tenant_id: tenantId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setProgress(100);
      if (dryRun) { setResult({ ...data, dry_run: true }); setStep(4); }
      else { setResult(data); setStep(5); onImported?.(); toast.success(`Importación completada: ${data.created} creados, ${data.updated} actualizados`); }
    } catch (e: any) {
      toast.error(e.message ?? "Error al importar");
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 800);
    }
  };

  const retryFailed = () => {
    const failedRows = new Set<number>((result?.failed ?? []).map((f: any) => f.row));
    setRows(rows.filter((r) => failedRows.has(Number(r.__row))));
    setResult(null);
    setStep(3);
  };

  const previewFields = IMPORT_FIELDS.filter((f) => Object.values(mapping).includes(f.key));

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" /> Importación masiva de productos
          </DialogTitle>
          <DialogDescription>
            Paso {step} de 5 — {STEP_LABELS[step]}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {([1, 2, 3, 4, 5] as Step[]).map((s) => (
            <div key={s} className={`flex-1 h-1.5 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>

        {progress > 0 && <Progress value={progress} className="h-1.5" />}

        <ScrollArea className="flex-1 -mx-1 px-1">
          {step === 1 && (
            <div className="space-y-4 py-2">
              <div className="rounded-xl border border-dashed p-6 text-center space-y-3">
                <FileSpreadsheet className="h-8 w-8 mx-auto text-primary" />
                <p className="text-sm text-muted-foreground">
                  Descarga la plantilla, complétala y vuelve a subirla. Formatos admitidos: .xlsx y .xls (máx. 5 MB, {MAX_IMPORT_ROWS} filas).
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => downloadTemplate()} className="gap-1">
                    <Download className="h-3.5 w-3.5" /> Descargar plantilla Excel
                  </Button>
                  <Button size="sm" className="gap-1" onClick={() => fileRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5" /> Subir archivo
                  </Button>
                </div>
                <input
                  ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
                />
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-semibold mb-2">Columnas de la plantilla</p>
                <div className="grid gap-1 sm:grid-cols-2">
                  {IMPORT_FIELDS.map((f) => (
                    <p key={f.key} className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">{f.header}</span>
                      {f.required && <span className="text-destructive"> *</span>} — {f.hint}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3 py-2">
              <p className="text-xs text-muted-foreground">
                Archivo <span className="font-medium text-foreground">{fileName}</span> — {rawRows.length} filas detectadas.
                Ajusta el mapeo si alguna columna no se reconoció.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {headers.map((h) => (
                  <div key={h} className="flex items-center gap-2">
                    <Label className="text-xs w-1/2 truncate" title={h}>{h}</Label>
                    <Select
                      value={mapping[h] ?? "__ignore__"}
                      onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v === "__ignore__" ? "" : v }))}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__ignore__">Ignorar columna</SelectItem>
                        {IMPORT_FIELDS.map((f) => (
                          <SelectItem key={f.key} value={f.key}>
                            {f.header}{f.required ? " *" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[11px]">{rows.length} filas</Badge>
                <Badge variant={errorCount ? "destructive" : "outline"} className="text-[11px]">{errorCount} con error</Badge>
                <Badge variant="outline" className="text-[11px] text-amber-600">{warningCount} con avisos</Badge>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setOnlyProblems((v) => !v)}>
                  {onlyProblems ? "Ver todas" : "Ver solo problemas"}
                </Button>
                <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={downloadErrors}>
                  <Download className="h-3 w-3" /> Reporte
                </Button>
                <div className="flex items-center gap-2 ml-auto">
                  <Label className="text-xs">Duplicados</Label>
                  <Select value={strategy} onValueChange={(v) => setStrategy(v as Strategy)}>
                    <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip">Omitir existentes</SelectItem>
                      <SelectItem value="update">Actualizar existentes</SelectItem>
                      <SelectItem value="fail">Marcar como error</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-lg border overflow-auto max-h-[45vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px] w-14">Fila</TableHead>
                      {previewFields.map((f) => (
                        <TableHead key={f.key} className="text-[11px] whitespace-nowrap">
                          {f.header}{f.required && <span className="text-destructive"> *</span>}
                        </TableHead>
                      ))}
                      <TableHead className="text-[11px]">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => {
                      const rowIssues: RowIssue[] = issues[i];
                      if (onlyProblems && rowIssues.length === 0) return null;
                      const hasError = rowIssues.some((x) => x.level === "error");
                      return (
                        <TableRow key={i} className={hasError ? "bg-destructive/5" : ""}>
                          <TableCell className="text-[11px] text-muted-foreground">{String(r.__row)}</TableCell>
                          {previewFields.map((f) => {
                            const fieldIssue = rowIssues.find((x) => x.field === f.key);
                            return (
                              <TableCell key={f.key} className="p-1">
                                <Input
                                  value={String(r[f.key] ?? "")}
                                  onChange={(e) => editCell(i, f.key, e.target.value)}
                                  className={`h-7 text-[11px] min-w-28 ${fieldIssue ? (fieldIssue.level === "error" ? "border-destructive" : "border-amber-500") : ""}`}
                                  title={fieldIssue?.message}
                                />
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-[11px]">
                            {rowIssues.length === 0 ? (
                              <span className="text-primary inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Listo</span>
                            ) : (
                              <span className={`inline-flex items-start gap-1 ${hasError ? "text-destructive" : "text-amber-600"}`}>
                                <AlertTriangle className="h-3 w-3 mt-0.5" />
                                <span>{rowIssues.map((x) => x.message).join("; ")}</span>
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Las filas con error no se importan. Corrige los valores directamente en la tabla o descarga el reporte.
              </p>
            </div>
          )}

          {step === 4 && result?.dry_run && (
            <div className="space-y-3 py-2">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Se crearán</p><p className="text-xl font-bold text-primary">{result.to_create}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Se actualizarán</p><p className="text-xl font-bold">{result.to_update}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Se omitirán</p><p className="text-xl font-bold text-muted-foreground">{result.skipped}</p></div>
              </div>
              {(result.errors ?? []).length > 0 && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-1">
                  <p className="text-xs font-semibold text-destructive">Rechazadas por el servidor ({result.errors.length})</p>
                  {result.errors.slice(0, 8).map((e: any) => (
                    <p key={e.row} className="text-[11px] text-muted-foreground">Fila {e.row} ({e.sku}): {e.messages.join("; ")}</p>
                  ))}
                </div>
              )}
              {(result.warnings ?? []).length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-1">
                  <p className="text-xs font-semibold text-amber-600">Advertencias ({result.warnings.length})</p>
                  {result.warnings.slice(0, 8).map((w: any) => (
                    <p key={w.row} className="text-[11px] text-muted-foreground">Fila {w.row} ({w.sku}): {w.messages.join("; ")}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 5 && result && (
            <div className="space-y-3 py-2">
              <div className="grid gap-2 sm:grid-cols-4">
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Creados</p><p className="text-xl font-bold text-primary">{result.created}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Actualizados</p><p className="text-xl font-bold">{result.updated}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Omitidos</p><p className="text-xl font-bold text-muted-foreground">{result.skipped}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Fallidos</p><p className="text-xl font-bold text-destructive">{(result.failed ?? []).length}</p></div>
              </div>
              {(result.failed ?? []).length > 0 && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-1">
                  {result.failed.slice(0, 10).map((f: any) => (
                    <p key={f.row} className="text-[11px] text-muted-foreground">Fila {f.row} ({f.sku}): {f.messages.join("; ")}</p>
                  ))}
                  <Button size="sm" variant="outline" className="text-xs h-7 mt-1" onClick={retryFailed}>
                    Reintentar solo fallidos
                  </Button>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <Button variant="ghost" size="sm" onClick={() => close(false)} className="gap-1 text-xs">
            <X className="h-3.5 w-3.5" /> Cerrar
          </Button>
          <div className="flex items-center gap-2">
            {step > 1 && step < 5 && (
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setStep((s) => (s - 1) as Step)}>Atrás</Button>
            )}
            {step === 2 && <Button size="sm" className="text-xs" onClick={applyMapping}>Previsualizar</Button>}
            {step === 3 && (
              <Button size="sm" className="text-xs gap-1" disabled={busy || validRows.length === 0} onClick={() => runImport(true)}>
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Validar en servidor ({validRows.length})
              </Button>
            )}
            {step === 4 && (
              <Button size="sm" className="text-xs gap-1" disabled={busy} onClick={() => runImport(false)}>
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Importar ahora
              </Button>
            )}
            {step === 5 && <Button size="sm" className="text-xs" onClick={() => close(false)}>Finalizar</Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
