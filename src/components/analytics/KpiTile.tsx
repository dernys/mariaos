// KPI con delta vs período anterior y sparkline opcional.

import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";
import { deltaPct } from "@/lib/analytics/chartTheme";

interface Props {
  label: string;
  value: string;
  icon?: LucideIcon;
  current?: number;
  previous?: number;
  hint?: string;
  /** Serie para el sparkline */
  series?: number[];
  invertDelta?: boolean;
  accentIndex?: number;
}

export function KpiTile({
  label,
  value,
  icon: Icon,
  current,
  previous,
  hint,
  series,
  invertDelta,
  accentIndex = 0,
}: Props) {
  const hasDelta = current !== undefined && previous !== undefined;
  const delta = hasDelta ? deltaPct(current!, previous!) : 0;
  const good = invertDelta ? delta < 0 : delta > 0;
  const flat = Math.abs(delta) < 0.05;
  const tone = flat ? "text-muted-foreground" : good ? "text-success" : "text-destructive";
  const DeltaIcon = flat ? Minus : good ? TrendingUp : TrendingDown;
  const color = `hsl(var(--chart-${(accentIndex % 6) + 1}))`;
  const data = (series ?? []).map((v, i) => ({ i, v }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="bg-card border rounded-xl p-4 shadow-card relative overflow-hidden"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium truncate">{label}</p>
          <p className="text-xl font-heading font-bold tracking-tight mt-1 truncate">{value}</p>
          <div className="flex items-center gap-1.5 mt-1">
            {hasDelta && (
              <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${tone}`}>
                <DeltaIcon className="h-3 w-3" />
                {flat ? "0%" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`}
              </span>
            )}
            {hint && <span className="text-[10px] text-muted-foreground truncate">{hint}</span>}
          </div>
        </div>
        {Icon && (
          <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `hsl(var(--chart-${(accentIndex % 6) + 1}) / 0.12)` }}>
            <Icon className="h-4 w-4" style={{ color }} />
          </div>
        )}
      </div>
      {data.length > 1 && (
        <div className="h-9 -mx-4 -mb-4 mt-2 opacity-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`spark-${label.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={1.5}
                fill={`url(#spark-${label.replace(/\s/g, "")})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{children}</div>;
}
