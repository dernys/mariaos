/**
 * Client-side staging engine for the Data Center import studio.
 *
 * Rows live here (in memory) until the user commits: normalisation, suggestions,
 * validation and preview all run against this staging dataset — never the database.
 */
import type { EntityForm, FieldDef } from "./dataCenter";

export type Level = "error" | "warning";

export interface Issue {
  field?: string;
  level: Level;
  message: string;
  fix?: string;
}

export interface Suggestion {
  id: string;
  field?: string;
  kind: "normalize" | "category" | "duplicate" | "fill" | "price" | "unit";
  message: string;
  action: string;
  /** Values merged into the row when the suggestion is accepted. */
  patch: Record<string, unknown>;
  /** Extra options offered to the user (e.g. existing categories). */
  options?: string[];
}

export interface StagingRow {
  id: string;
  rowNo: number;
  values: Record<string, any>;
  included: boolean;
  op: "create" | "update" | "unchanged";
  matchId: string | null;
  matchLabel?: string;
  issues: Issue[];
  suggestions: Suggestion[];
  appliedSuggestions: string[];
  dismissedSuggestions: string[];
  warningsAccepted: boolean;
  edited: boolean;
}

export interface ImportContext {
  existing: Record<string, any>[];
  categories: string[];
  units: string[];
}

export const EXAMPLE_MARKER = "EJEMPLO - BORRA ESTA FILA";

export const isNumericField = (fd: FieldDef) => typeof fd.example === "number";
export const isBoolField = (fd: FieldDef) =>
  /^(si|sí|no)$/i.test(String(fd.example ?? "")) || /\bsi\s*\/\s*no\b/i.test(fd.hint ?? "");

const norm = (s: unknown) =>
  String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

/** 0..1 similarity based on Levenshtein distance over normalised text. */
export function similarity(a: string, b: string) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const m = x.length, n = y.length;
  const prev = new Array(n + 1).fill(0).map((_, i) => i);
  const cur = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return 1 - prev[n] / Math.max(m, n);
}

/** Proposed canonical value for a cell (never applied automatically). */
export function normalizeValue(fd: FieldDef, raw: unknown): string | number | null {
  if (raw === null || raw === undefined) return null;
  let v = String(raw).replace(/\s+/g, " ").trim();
  if (v === "") return null;
  if (isNumericField(fd)) {
    const cleaned = v.replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".").replace(/[^0-9.\-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : v;
  }
  if (isBoolField(fd)) {
    if (/^(si|sí|yes|true|1|x|activo)$/i.test(v)) return "si";
    if (/^(no|false|0|inactivo)$/i.test(v)) return "no";
    return v;
  }
  if (fd.key === "email") return v.toLowerCase();
  if (fd.key === "phone") return v.replace(/[^\d+ ]/g, "");
  if (/date|valid_from|valid_until/.test(fd.key)) {
    const dmy = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  return v;
}

export function buildStagingRows(rows: Record<string, any>[], mapping: Record<string, string>): StagingRow[] {
  return rows
    .filter((r) => !Object.values(r).some((v) => String(v ?? "").toUpperCase().includes(EXAMPLE_MARKER)))
    .map((r, i) => {
      const values: Record<string, any> = {};
      Object.entries(mapping).forEach(([header, key]) => {
        if (key) values[key] = r[header] ?? "";
      });
      return {
        id: `r${i}-${r.__row ?? i}`,
        rowNo: Number(r.__row ?? i + 2),
        values,
        included: true,
        op: "create" as const,
        matchId: null,
        issues: [],
        suggestions: [],
        appliedSuggestions: [],
        dismissedSuggestions: [],
        warningsAccepted: false,
        edited: false,
      };
    });
}

function labelOf(row: Record<string, any>) {
  return String(row.name ?? row.sku ?? row.code ?? row.id ?? "");
}

/** Recomputes op, issues and suggestions for every staging row. */
export function analyze(form: EntityForm, rows: StagingRow[], ctx: ImportContext): StagingRow[] {
  const naturalKeys: string[][] = form.fields.some((f) => f.key === "sku")
    ? [["sku"], ["name"]]
    : form.fields.some((f) => f.key === "code")
      ? [["code"], ["name"]]
      : [["email"], ["name"]];
  const keyCount = new Map<string, number>();
  rows.forEach((r) => {
    for (const keys of naturalKeys) {
      const k = keys.map((x) => norm(r.values[x])).join("|");
      if (k.replace(/\|/g, "")) { keyCount.set(k, (keyCount.get(k) ?? 0) + 1); break; }
    }
  });

  return rows.map((row) => {
    const issues: Issue[] = [];
    const suggestions: Suggestion[] = [];
    const v = row.values;

    // --- per-field validation + normalisation proposals
    for (const fd of form.fields) {
      if (!(fd.key in v)) continue;
      const raw = v[fd.key];
      const isEmpty = raw === null || raw === undefined || String(raw).trim() === "";
      if (fd.required && isEmpty) {
        issues.push({ field: fd.key, level: "error", message: `${fd.header} es obligatorio`, fix: "Escribe un valor en la celda" });
      }
      if (isEmpty) continue;
      const proposed = normalizeValue(fd, raw);
      if (proposed !== null && String(proposed) !== String(raw)) {
        suggestions.push({
          id: `norm:${fd.key}`, field: fd.key, kind: "normalize",
          message: `${fd.header}: "${raw}" → "${proposed}"`, action: "Normalizar",
          patch: { [fd.key]: proposed },
        });
      }
      if (isNumericField(fd)) {
        const n = Number(String(proposed ?? raw));
        if (!Number.isFinite(n)) {
          issues.push({ field: fd.key, level: "error", message: `${fd.header} debe ser numérico`, fix: "Usa punto decimal, sin símbolos" });
        } else if (n < 0 && /price|cost|stock|rate|quantity|salary|capacity|credit/.test(fd.key)) {
          issues.push({ field: fd.key, level: "error", message: `${fd.header} no puede ser negativo`, fix: "Corrige el número" });
        }
      }
      if (fd.key === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(raw).trim())) {
        issues.push({ field: "email", level: "warning", message: "Correo con formato dudoso", fix: "Revisa la dirección" });
      }
    }

    // --- price vs cost sanity
    const price = Number(v.price), cost = Number(v.cost);
    if (Number.isFinite(price) && Number.isFinite(cost) && cost > 0 && price < cost) {
      issues.push({ field: "price", level: "warning", message: "El precio de venta es menor que el costo", fix: "Confirma que es intencional" });
      suggestions.push({
        id: "price:swap", field: "price", kind: "price",
        message: `¿Están invertidos? Precio ${price} / Costo ${cost}`, action: "Intercambiar",
        patch: { price: cost, cost: price },
      });
    }

    // --- category resolution
    if ("category" in v) {
      const cat = String(v.category ?? "").trim();
      if (!cat) {
        suggestions.push({
          id: "cat:fill", field: "category", kind: "fill",
          message: "Falta la categoría", action: "Elegir", patch: {}, options: ctx.categories,
        });
      } else if (!ctx.categories.some((c) => norm(c) === norm(cat))) {
        const near = ctx.categories.map((c) => ({ c, s: similarity(c, cat) })).sort((a, b) => b.s - a.s)[0];
        if (near && near.s >= 0.8) {
          suggestions.push({
            id: "cat:near", field: "category", kind: "category",
            message: `Categoría "${cat}" no existe. ¿Quisiste decir "${near.c}"? (${Math.round(near.s * 100)}%)`,
            action: `Usar "${near.c}"`, patch: { category: near.c }, options: ctx.categories,
          });
        } else {
          issues.push({ field: "category", level: "warning", message: `Categoría "${cat}" no existe todavía`, fix: "Se creará al importar si lo autorizas" });
          suggestions.push({
            id: "cat:create", field: "category", kind: "category",
            message: `Crear la categoría "${cat}"`, action: "Crear al importar", patch: { __create_category: true },
            options: ctx.categories,
          });
        }
      }
    }

    // --- unit check
    if ("unit_code" in v && String(v.unit_code ?? "").trim() && ctx.units.length) {
      const u = String(v.unit_code).trim();
      if (!ctx.units.some((x) => norm(x) === norm(u))) {
        issues.push({ field: "unit_code", level: "warning", message: `Unidad "${u}" no está configurada`, fix: `Unidades válidas: ${ctx.units.join(", ")}` });
      }
    }

    // --- in-file duplicates
    let dupKey = "";
    for (const keys of naturalKeys) {
      const k = keys.map((x) => norm(v[x])).join("|");
      if (k.replace(/\|/g, "")) { dupKey = k; break; }
    }
    if (dupKey && (keyCount.get(dupKey) ?? 0) > 1) {
      issues.push({ level: "warning", message: "Este registro aparece más de una vez en el archivo", fix: "Excluye o corrige la fila duplicada" });
    }

    // --- match against existing DB rows
    let matchId: string | null = null;
    let matchLabel = "";
    for (const keys of naturalKeys) {
      if (keys.some((k) => !String(v[k] ?? "").trim())) continue;
      const hit = ctx.existing.find((e) => keys.every((k) => norm(e[k]) === norm(v[k])));
      if (hit) { matchId = String(hit.id); matchLabel = labelOf(hit); break; }
    }
    if (!matchId && String(v.name ?? "").trim()) {
      const near = ctx.existing
        .map((e) => ({ e, s: similarity(labelOf(e), String(v.name)) }))
        .sort((a, b) => b.s - a.s)[0];
      if (near && near.s >= 0.85) {
        issues.push({ field: "name", level: "warning", message: `Posible duplicado de "${labelOf(near.e)}" (${Math.round(near.s * 100)}%)`, fix: "Usa el existente o confirma que es nuevo" });
        suggestions.push({
          id: "dup:use", field: "name", kind: "duplicate",
          message: `Coincide con "${labelOf(near.e)}" al ${Math.round(near.s * 100)}%`,
          action: "Usar el existente",
          patch: { name: labelOf(near.e), ...(near.e.sku && "sku" in v ? { sku: near.e.sku } : {}) },
        });
      }
    }

    let op: StagingRow["op"] = matchId ? "update" : "create";
    if (matchId) {
      const hit = ctx.existing.find((e) => String(e.id) === matchId)!;
      const changed = Object.keys(v).some((k) => {
        if (k.startsWith("__")) return false;
        const a = v[k] === "" || v[k] === undefined ? null : v[k];
        const b = hit[k] === "" || hit[k] === undefined ? null : hit[k];
        if (a === null && b === null) return false;
        return String(a ?? "").trim().toLowerCase() !== String(b ?? "").trim().toLowerCase();
      });
      if (!changed) op = "unchanged";
    }

    const live = suggestions.filter((s) => !row.dismissedSuggestions.includes(s.id) && !row.appliedSuggestions.includes(s.id));
    return { ...row, issues, suggestions: live, op, matchId, matchLabel };
  });
}

export const rowLevel = (r: StagingRow): "error" | "warning" | "ok" => {
  if (r.issues.some((i) => i.level === "error")) return "error";
  if (r.issues.some((i) => i.level === "warning")) return "warning";
  return "ok";
};

export interface StagingSummary {
  total: number; included: number; excluded: number; valid: number;
  create: number; update: number; unchanged: number;
  errors: number; warnings: number; suggestions: number;
  newCategories: string[];
  blocked: boolean;
}

export function summarize(rows: StagingRow[], knownCategories: string[]): StagingSummary {
  const inc = rows.filter((r) => r.included);
  const errors = inc.filter((r) => rowLevel(r) === "error").length;
  const known = new Set(knownCategories.map((c) => norm(c)));
  const newCategories = Array.from(
    new Set(inc.map((r) => String(r.values.category ?? "").trim()).filter((c) => c && !known.has(norm(c)))),
  );
  return {
    total: rows.length,
    included: inc.length,
    excluded: rows.length - inc.length,
    create: inc.filter((r) => r.op === "create" && rowLevel(r) !== "error").length,
    update: inc.filter((r) => r.op === "update" && rowLevel(r) !== "error").length,
    unchanged: inc.filter((r) => r.op === "unchanged").length,
    errors,
    warnings: inc.filter((r) => rowLevel(r) === "warning" && !r.warningsAccepted).length,
    suggestions: inc.reduce((s, r) => s + r.suggestions.length, 0),
    newCategories,
    blocked: errors > 0,
  };
}

/** Rows that will actually be sent to the server. */
export function commitPayload(rows: StagingRow[]) {
  return rows
    .filter((r) => r.included && rowLevel(r) !== "error" && r.op !== "unchanged")
    .map((r) => {
      const out: Record<string, unknown> = { __row: r.rowNo };
      Object.entries(r.values).forEach(([k, val]) => {
        if (k.startsWith("__")) return;
        out[k] = val === "" ? null : val;
      });
      return out;
    });
}
