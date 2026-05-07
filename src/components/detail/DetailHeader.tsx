import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface KPI {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "warning" | "destructive" | "primary";
}

interface Props {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  badges?: { label: string; variant?: "default" | "secondary" | "destructive" | "outline" }[];
  kpis?: KPI[];
  actions?: ReactNode;
  backTo?: string;
}

const toneClass: Record<string, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  primary: "text-primary",
};

export function DetailHeader({ icon: Icon, title, subtitle, badges, kpis, actions, backTo }: Props) {
  const nav = useNavigate();
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button size="icon" variant="ghost" onClick={() => (backTo ? nav(backTo) : nav(-1))} className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="h-12 w-12 rounded-xl gradient-brand flex items-center justify-center shrink-0">
            <Icon className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-heading font-bold leading-tight">{title}</h1>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            {badges && badges.length > 0 && (
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                {badges.map((b, i) => (
                  <Badge key={i} variant={b.variant || "secondary"} className="text-[10px]">{b.label}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
      </div>

      {kpis && kpis.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {kpis.map((k, i) => (
            <div key={i} className="bg-card rounded-xl border shadow-card p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-heading">{k.label}</p>
              <p className={`text-lg font-heading font-bold mt-1 ${toneClass[k.tone || "default"]}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
