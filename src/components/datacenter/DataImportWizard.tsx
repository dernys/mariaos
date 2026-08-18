import { useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
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
  EntityForm, autoMapHeaders, callDataCenter, downloadEntityTemplate, errorReportCsv, parseSheet, sha256Hex,
} from "@/lib/dataCenter";

type Strategy = "upsert" | "create" | "update" | "skip" | "fail";

interface Props {
  forms: EntityForm[];
  tenantId: string | null;
  onDone?: () => void;
}

interface RowError { row: number; field?: string; value?: string; problem: string; fix: string }

const MAX_ROWS = 5000;
const MAX_BYTES = 6 * 1024 * 1024;

export function DataImportWizard({ forms, tenantId, onDone }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [entity, setEntity] = useState(forms[0]?.key ?? "products");
  const [fileName, setFileName] = useState("");
  const [checksum, setChecksum] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [strategy, setStrategy] = useState<Strategy>("upsert");
  const [restorePoint, setRestorePoint] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ total: number; to_create: number; to_update: number; skipped: number; errors: number; error_rows: RowError[] } | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number; errors: number } | null>(null);

  const form = useMemo(() => forms.find((f) => f.key === entity) ?? forms[0], [forms, entity]);

  const reset = () => {
    setStep(1); setFileName(""); setHeaders([]); setRawRows([]); setMapping({});
    setPreview(null); setResult(null); setChecksum("");
  };

  const onFile = async (file: File) => {
    if (file.size > MAX_BYTES) { toast({ title: "Archivo demasiado grande", description: "El límite es 6 MB.", variant: "destructive" }); return; }
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseSheet(buf);
      if (parsed.rows.length === 0) throw new Error("El archivo no contiene filas con datos.");
      if (parsed.rows.length > MAX_ROWS) throw new Error(`Máximo ${MAX_ROWS} filas por archivo.`);
      setFileName(file.name);
      setChecksum(await sha256Hex(buf));
      setHeaders(parsed.headers);
      setRawRows(parsed.rows);
      setMapping(autoMapHeaders(form, parsed.headers));
      setStep(2);
    } catch (e) {
      toast({ title: "No se pudo leer el archivo", description: (e as Error).message, variant: "destructive" });
    }
  };

  const mappedRows = () =>
    rawRows.map((r) => {
      const o: Record<string, unknown> = { __row: r.__row };
      Object.entries(mapping).forEach(([header, key]) => { if (key) o[key] = r[header]; });
      return o;
    });

  const missingRequired = form.fields.filter((fd) => fd.required && !Object.values(mapping).includes(fd.key));

  const runValidation = async () => {
    setBusy(true);
    try {
      const res = await callDataCenter({ action: "import", entity: form.key, tenant_id: tenantId, rows: mappedRows(), strategy, dry_run: true });
      setPreview(res);
      setStep(3);
    } catch (e) {
      toast({ title: "Error al validar", description: (e as Error).message, variant: "destructive" });
    }
    setBusy(false);
  };

  const commit = async () => {
    setBusy(true);
    try {
      const res = await callDataCenter({
        action: "import", entity: form.key, tenant_id: tenantId, rows: mappedRows(),
        strategy, dry_run: false, create_restore_point: restorePoint, file_name: fileName, file_checksum: checksum,
      });
      setResult({ created: res.created ?? 0, updated: res.updated ?? 0, skipped: res.skipped ?? 0, errors: res.errors ?? 0 });
      setStep(4);
      onDone?.();
      toast({ title: "Importación completada", description: `${res.created ?? 0} creados · ${res.updated ?? 0} actualizados` });
    } catch (e) {
      toast({ title: "Importación fallida", description: (e as Error).message, variant: "destructive" });
    }
    setBusy(false);
  };

  const downloadErrors = (errors: RowError[]) => {
    const blob = new Blob([errorReportCsv(errors)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `errores-${form.key}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" /> Importación asistida
        </CardTitle>
        <CardDescription>
          Paso {step} de 4 · {["Origen", "Mapeo de columnas", "Validación", "Resultado"][step - 1]}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>¿Qué vas a importar?</Label>
                <Select value={entity} onValueChange={(v) => { setEntity(v); reset(); }}>
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

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => downloadEntityTemplate(form)}>
                <Download className="h-4 w-4 mr-2" /> Descargar plantilla de {form.label}
              </Button>
            </div>

            <div
              className="rounded-lg border border-dashed p-8 text-center cursor-pointer hover:bg-muted/40 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
            >
              <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Arrastra tu archivo Excel o CSV aquí</p>
              <p className="text-xs text-muted-foreground mt-1">Máximo {MAX_ROWS} filas · 6 MB</p>
              <input
                ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ""; }}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm">
                <span className="font-medium">{fileName}</span>
                <span className="text-muted-foreground"> · {rawRows.length} filas · {headers.length} columnas</span>
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>Cambiar archivo</Button>
            </div>

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
                              <SelectItem key={fd.key} value={fd.key}>
                                {fd.header}{fd.required ? " *" : ""}
                              </SelectItem>
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
              <Button onClick={runValidation} disabled={busy || missingRequired.length > 0}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                Validar sin guardar
              </Button>
            </div>
          </div>
        )}

        {step === 3 && preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Se crearán", value: preview.to_create },
                { label: "Se actualizarán", value: preview.to_update },
                { label: "Se omitirán", value: preview.skipped },
                { label: "Con errores", value: preview.errors },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-semibold">{s.value}</p>
                </div>
              ))}
            </div>

            {preview.errors > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{preview.errors} filas no se importarán</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>Descarga el informe, corrige el archivo y vuelve a subirlo.</p>
                  <Button size="sm" variant="outline" onClick={() => downloadErrors(preview.error_rows)}>
                    <Download className="h-4 w-4 mr-2" /> Informe de errores (CSV)
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {preview.error_rows.length > 0 && (
              <div className="rounded-md border max-h-64 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Fila</TableHead><TableHead>Problema</TableHead><TableHead>Cómo corregirlo</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.error_rows.slice(0, 50).map((e, i) => (
                      <TableRow key={i}>
                        <TableCell><Badge variant="outline">{e.row}</Badge></TableCell>
                        <TableCell className="text-sm">{e.problem}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.fix}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={restorePoint} onCheckedChange={(v) => setRestorePoint(!!v)} />
              Crear punto de restauración antes de guardar (recomendado)
            </label>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4 mr-2" /> Revisar mapeo</Button>
              <Button onClick={commit} disabled={busy || preview.to_create + preview.to_update === 0}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Confirmar importación
              </Button>
            </div>
          </div>
        )}

        {step === 4 && result && (
          <div className="space-y-4 text-center py-6">
            <CheckCircle2 className="h-12 w-12 mx-auto text-primary" />
            <div>
              <p className="text-lg font-semibold">Importación completada</p>
              <p className="text-sm text-muted-foreground">
                {result.created} creados · {result.updated} actualizados · {result.skipped} omitidos · {result.errors} con errores
              </p>
            </div>
            <Button onClick={reset}>Importar otro archivo</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
