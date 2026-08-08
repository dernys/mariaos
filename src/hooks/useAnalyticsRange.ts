// Rango de fechas con presets, comparación con período anterior y granularidad.

import { useMemo, useState } from "react";

export type RangePreset = "today" | "7d" | "30d" | "90d" | "mtd" | "qtd" | "ytd" | "custom";
export type Granularity = "day" | "week" | "month";

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function toISODate(d: Date) {
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return x.toISOString().slice(0, 10);
}

export const PRESET_LABELS: Record<Exclude<RangePreset, "custom">, string> = {
  today: "Hoy",
  "7d": "7 días",
  "30d": "30 días",
  "90d": "90 días",
  mtd: "Mes actual",
  qtd: "Trimestre",
  ytd: "Año",
};

function presetRange(preset: Exclude<RangePreset, "custom">) {
  const today = startOfDay(new Date());
  switch (preset) {
    case "today": return { from: today, to: today };
    case "7d": return { from: addDays(today, -6), to: today };
    case "30d": return { from: addDays(today, -29), to: today };
    case "90d": return { from: addDays(today, -89), to: today };
    case "mtd": return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
    case "qtd": return { from: new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1), to: today };
    case "ytd": return { from: new Date(today.getFullYear(), 0, 1), to: today };
  }
}

export interface AnalyticsRange {
  preset: RangePreset;
  setPreset: (p: Exclude<RangePreset, "custom">) => void;
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  compare: boolean;
  setCompare: (v: boolean) => void;
  granularity: Granularity;
  setGranularity: (g: Granularity) => void;
  /** ISO timestamps listos para PostgREST */
  fromIso: string;
  toIso: string;
  prevFromIso: string;
  prevToIso: string;
  days: number;
  label: string;
}

export function useAnalyticsRange(initial: Exclude<RangePreset, "custom"> = "30d"): AnalyticsRange {
  const init = presetRange(initial);
  const [preset, setPresetState] = useState<RangePreset>(initial);
  const [from, setFromState] = useState(toISODate(init.from));
  const [to, setToState] = useState(toISODate(init.to));
  const [compare, setCompare] = useState(true);
  const [granularity, setGranularity] = useState<Granularity>("day");

  const setPreset = (p: Exclude<RangePreset, "custom">) => {
    const r = presetRange(p);
    setPresetState(p);
    setFromState(toISODate(r.from));
    setToState(toISODate(r.to));
  };

  const derived = useMemo(() => {
    const f = startOfDay(new Date(`${from}T00:00:00`));
    const t = endOfDay(new Date(`${to}T00:00:00`));
    const days = Math.max(1, Math.round((startOfDay(t).getTime() - f.getTime()) / 86400000) + 1);
    const prevTo = endOfDay(addDays(f, -1));
    const prevFrom = startOfDay(addDays(f, -days));
    return {
      fromIso: f.toISOString(),
      toIso: t.toISOString(),
      prevFromIso: prevFrom.toISOString(),
      prevToIso: prevTo.toISOString(),
      days,
      label: preset === "custom" ? `${from} → ${to}` : PRESET_LABELS[preset as Exclude<RangePreset, "custom">],
    };
  }, [from, to, preset]);

  return {
    preset,
    setPreset,
    from,
    to,
    setFrom: (v: string) => { setFromState(v); setPresetState("custom"); },
    setTo: (v: string) => { setToState(v); setPresetState("custom"); },
    compare,
    setCompare,
    granularity,
    setGranularity,
    ...derived,
  };
}

/** Agrupa una fecha según la granularidad elegida. */
export function bucketKey(date: string | Date, g: Granularity) {
  const d = new Date(date);
  if (g === "month") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  if (g === "week") {
    const monday = addDays(startOfDay(d), -((d.getDay() + 6) % 7));
    return toISODate(monday);
  }
  return toISODate(startOfDay(d));
}

export function bucketLabel(key: string, g: Granularity) {
  if (g === "month") {
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("es", { month: "short", year: "2-digit" });
  }
  const d = new Date(`${key}T00:00:00`);
  return g === "week"
    ? `sem ${d.toLocaleDateString("es", { day: "2-digit", month: "2-digit" })}`
    : d.toLocaleDateString("es", { day: "2-digit", month: "2-digit" });
}
