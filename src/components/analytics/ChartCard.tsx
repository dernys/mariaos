// Contenedor consistente para gráficas y tablas analíticas.

import { ReactNode } from "react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyText?: string;
  className?: string;
  height?: number;
  children: ReactNode;
}

export function ChartCard({
  title,
  subtitle,
  actions,
  loading,
  empty,
  emptyText = "Sin datos en el período seleccionado",
  className = "",
  height = 240,
  children,
}: Props) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`bg-card border rounded-xl shadow-card p-4 ${className}`}
    >
      <header className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="font-heading font-semibold text-sm truncate">{title}</h3>
          {subtitle && <p className="text-[10px] text-muted-foreground truncate">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </header>
      {loading ? (
        <Skeleton className="w-full" style={{ height }} />
      ) : empty ? (
        <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ height }}>
          {emptyText}
        </div>
      ) : (
        children
      )}
    </motion.section>
  );
}
