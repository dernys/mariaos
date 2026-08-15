import { useEffect, useState } from "react";
import { useModuleSettings } from "@/hooks/useModuleSettings";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Save, Plus, X } from "lucide-react";

export interface HRSettings {
  levels: string[];
  departments: string[];
  overtime_factor: number;
  night_factor: number;
  holiday_factor: number;
  weekly_hours: number;
  vacation_days_per_year: number;
  default_bonus: number;
  default_deductions: number;
  payment_method: string;
  payment_due_days: number;
  require_payroll_approval: boolean;
}

export const HR_DEFAULTS: HRSettings = {
  levels: ["Junior", "Intermedio", "Senior", "Supervisor", "Gerente"],
  departments: ["Operaciones", "Ventas", "Cocina", "Almacén", "Administración"],
  overtime_factor: 1.5,
  night_factor: 1.25,
  holiday_factor: 2,
  weekly_hours: 40,
  vacation_days_per_year: 30,
  default_bonus: 0,
  default_deductions: 0,
  payment_method: "transfer",
  payment_due_days: 5,
  require_payroll_approval: true,
};

function TagEditor({ label, values, onChange }: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || values.includes(v)) return;
    onChange([...values, v]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <Badge key={v} variant="secondary" className="gap-1 text-[11px]">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Quitar ${v}`}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {values.length === 0 && <span className="text-xs text-muted-foreground">Sin elementos</span>}
      </div>
      <div className="flex gap-2">
        <Input value={draft} placeholder="Añadir…" onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button type="button" variant="outline" size="icon" onClick={add}><Plus className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

export function ConfigHR() {
  const { toast } = useToast();
  const hr = useModuleSettings<HRSettings>("hr", HR_DEFAULTS);
  const [s, setS] = useState<HRSettings>(hr.settings);
  useEffect(() => setS(hr.settings), [hr.settings]);

  const num = (v: string) => parseFloat(v || "0") || 0;

  return (
    <div className="space-y-4 max-w-2xl">
      <Card><CardContent className="p-4 space-y-4">
        <h3 className="text-sm font-heading font-semibold">Estructura organizativa</h3>
        <TagEditor label="Niveles de cargo" values={s.levels} onChange={(levels) => setS({ ...s, levels })} />
        <TagEditor label="Departamentos" values={s.departments} onChange={(departments) => setS({ ...s, departments })} />
      </CardContent></Card>

      <Card><CardContent className="p-4 space-y-3">
        <h3 className="text-sm font-heading font-semibold">Jornada y recargos</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label className="text-xs">Horas semanales</Label><Input type="number" value={s.weekly_hours} onChange={(e) => setS({ ...s, weekly_hours: num(e.target.value) })} /></div>
          <div><Label className="text-xs">Factor horas extra</Label><Input type="number" step="0.05" value={s.overtime_factor} onChange={(e) => setS({ ...s, overtime_factor: num(e.target.value) })} /></div>
          <div><Label className="text-xs">Factor nocturno</Label><Input type="number" step="0.05" value={s.night_factor} onChange={(e) => setS({ ...s, night_factor: num(e.target.value) })} /></div>
          <div><Label className="text-xs">Factor feriado</Label><Input type="number" step="0.05" value={s.holiday_factor} onChange={(e) => setS({ ...s, holiday_factor: num(e.target.value) })} /></div>
        </div>
        <div><Label className="text-xs">Días de vacaciones por año</Label><Input type="number" value={s.vacation_days_per_year} onChange={(e) => setS({ ...s, vacation_days_per_year: num(e.target.value) })} /></div>
      </CardContent></Card>

      <Card><CardContent className="p-4 space-y-3">
        <h3 className="text-sm font-heading font-semibold">Nóminas</h3>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Bono por defecto</Label><Input type="number" step="0.01" value={s.default_bonus} onChange={(e) => setS({ ...s, default_bonus: num(e.target.value) })} /></div>
          <div><Label className="text-xs">Deducción por defecto</Label><Input type="number" step="0.01" value={s.default_deductions} onChange={(e) => setS({ ...s, default_deductions: num(e.target.value) })} /></div>
          <div><Label className="text-xs">Forma de pago por defecto</Label>
            <select className="w-full h-9 rounded-md border bg-background px-2 text-sm" value={s.payment_method} onChange={(e) => setS({ ...s, payment_method: e.target.value })}>
              <option value="transfer">Transferencia</option><option value="cash">Efectivo</option><option value="card">Tarjeta</option>
            </select>
          </div>
          <div><Label className="text-xs">Días para vencimiento de pago</Label><Input type="number" value={s.payment_due_days} onChange={(e) => setS({ ...s, payment_due_days: num(e.target.value) })} /></div>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={s.require_payroll_approval} onCheckedChange={(v) => setS({ ...s, require_payroll_approval: v })} />
          <Label className="text-xs">Requerir aprobación antes de pagar la nómina</Label>
        </div>
      </CardContent></Card>

      <Button onClick={async () => { await hr.save(s); toast({ title: "Ajustes de RRHH guardados" }); }} className="gap-2 gradient-brand text-primary-foreground">
        <Save className="h-3.5 w-3.5" /> Guardar ajustes
      </Button>
    </div>
  );
}
