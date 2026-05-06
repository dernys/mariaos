import { LucideIcon } from "lucide-react";

interface MiniStatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "destructive" | "primary";
}

const toneClasses: Record<string, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  primary: "text-primary",
};

export function MiniStatCard({ label, value, icon: Icon, tone = "default" }: MiniStatCardProps) {
  return (
    <div className="bg-card border rounded-lg p-3 shadow-sm flex items-center gap-3 min-w-0">
      {Icon && (
        <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium truncate">{label}</p>
        <p className={`text-base font-heading font-bold leading-tight truncate ${toneClasses[tone]}`}>{value}</p>
      </div>
    </div>
  );
}

interface StatRowProps {
  children: React.ReactNode;
}

export function StatRow({ children }: StatRowProps) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">{children}</div>;
}
