// Barra de filtros unificada para Dashboard / Analytics / Reportes / BI.

import { ReactNode } from "react";
import { CalendarRange, RefreshCw, GitCompareArrows } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  AnalyticsRange,
  Granularity,
  PRESET_LABELS,
  RangePreset,
} from "@/hooks/useAnalyticsRange";

export interface DimensionFilter {
  key: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}

interface Props {
  range: AnalyticsRange;
  filters?: DimensionFilter[];
  showGranularity?: boolean;
  showCompare?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  rightSlot?: ReactNode;
}

const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
];

export function AnalyticsFilterBar({
  range,
  filters = [],
  showGranularity = true,
  showCompare = true,
  onRefresh,
  refreshing,
  rightSlot,
}: Props) {
  const presets = Object.keys(PRESET_LABELS) as Exclude<RangePreset, "custom">[];

  return (
    <Card className="p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          <CalendarRange className="h-3.5 w-3.5" />
          <span className="font-medium">Período</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={range.preset === p ? "default" : "outline"}
              className="h-7 px-2.5 text-xs"
              onClick={() => range.setPreset(p)}
            >
              {PRESET_LABELS[p]}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {showGranularity && (
            <ToggleGroup
              type="single"
              size="sm"
              value={range.granularity}
              onValueChange={(v) => v && range.setGranularity(v as Granularity)}
              className="border rounded-md"
            >
              {GRANULARITIES.map((g) => (
                <ToggleGroupItem key={g.value} value={g.value} className="h-7 px-2.5 text-xs">
                  {g.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          {showCompare && (
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <GitCompareArrows className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="hidden sm:inline text-muted-foreground">Comparar</span>
              <Switch checked={range.compare} onCheckedChange={range.setCompare} />
            </label>
          )}
          {onRefresh && (
            <Button size="sm" variant="outline" className="h-7 px-2" onClick={onRefresh} disabled={refreshing}>
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          )}
          {rightSlot}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Desde</Label>
          <Input type="date" value={range.from} max={range.to} onChange={(e) => range.setFrom(e.target.value)} className="h-8 w-[9.5rem] text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Hasta</Label>
          <Input type="date" value={range.to} min={range.from} onChange={(e) => range.setTo(e.target.value)} className="h-8 w-[9.5rem] text-xs" />
        </div>
        {filters.map((f) => (
          <div key={f.key} className="space-y-1 min-w-[10rem]">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{f.label}</Label>
            <SearchableSelect
              className="h-8 w-full sm:w-48"
              placeholder={`${f.label}: Todos`}
              searchPlaceholder={`Buscar ${f.label.toLowerCase()}...`}
              value={f.value}
              onChange={f.onChange}
              options={[{ value: "__all__", label: `${f.label}: Todos` }, ...f.options]}
            />
          </div>
        ))}
        <p className="text-[10px] text-muted-foreground ml-auto pb-1">
          {range.days} día(s) · {range.compare ? "vs período anterior" : "sin comparación"}
        </p>
      </div>
    </Card>
  );
}
