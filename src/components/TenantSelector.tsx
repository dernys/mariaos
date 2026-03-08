import { useTenantContext } from "@/hooks/useTenantContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Beer, UtensilsCrossed, Briefcase } from "lucide-react";

const typeIcons: Record<string, typeof Building2> = {
  bar: Beer,
  restaurant: UtensilsCrossed,
  empresa: Briefcase,
};

const typeLabels: Record<string, string> = {
  bar: "Bar",
  restaurant: "Restaurante",
  empresa: "Empresa",
};

export function TenantSelector() {
  const { tenantId, allTenants, setActiveTenantId } = useTenantContext();

  if (allTenants.length <= 1) return null;

  return (
    <Select value={tenantId ?? ""} onValueChange={setActiveTenantId}>
      <SelectTrigger className="h-8 text-xs w-full bg-sidebar-accent border-sidebar-border text-sidebar-foreground">
        <SelectValue placeholder="Seleccionar empresa" />
      </SelectTrigger>
      <SelectContent>
        {allTenants.map((t) => {
          const Icon = typeIcons[t.business_type] || Building2;
          return (
            <SelectItem key={t.id} value={t.id}>
              <div className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5" />
                <span>{t.name}</span>
                <span className="text-muted-foreground text-[10px]">({typeLabels[t.business_type] || t.business_type})</span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
