import { motion } from "framer-motion";
import { Clock, Play, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveShift } from "@/hooks/useActiveShift";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface ShiftRequiredGateProps {
  children: React.ReactNode;
  /** Visual hint about the business type for messaging */
  variant?: "bar" | "restaurant" | "empresa";
}

const VARIANT_COPY: Record<NonNullable<ShiftRequiredGateProps["variant"]>, { title: string; sub: string }> = {
  bar: {
    title: "Abre la barra para empezar a cobrar",
    sub: "Necesitas un turno abierto para registrar consumos, dividir cuentas y cuadrar la caja al cierre.",
  },
  restaurant: {
    title: "Inicia el turno del salón",
    sub: "Para tomar comandas, enviar a cocina y cobrar mesas, primero debe haber un turno activo asignado a un cajero.",
  },
  empresa: {
    title: "Abre un turno de venta",
    sub: "El POS exige un turno abierto para registrar ventas, descontar inventario y dejar trazabilidad de la caja.",
  },
};

export function ShiftRequiredGate({ children, variant = "empresa" }: ShiftRequiredGateProps) {
  const { shift, loading } = useActiveShift();
  const nav = useNavigate();
  const copy = VARIANT_COPY[variant];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!shift) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-card rounded-2xl shadow-elevated border p-8 text-center"
        >
          <div className="mx-auto h-14 w-14 rounded-2xl gradient-brand flex items-center justify-center mb-4">
            <Clock className="h-7 w-7 text-primary-foreground" />
          </div>
          <h2 className="font-heading font-bold text-lg mb-2">{copy.title}</h2>
          <p className="text-sm text-muted-foreground mb-6">{copy.sub}</p>
          <Button onClick={() => nav("/turnos")} className="w-full gap-2 gradient-brand text-primary-foreground font-heading">
            <Play className="h-4 w-4" /> Abrir turno ahora <ArrowRight className="h-4 w-4 ml-auto" />
          </Button>
          <p className="text-[10px] text-muted-foreground mt-4">
            Solo un turno abierto por usuario. Al cerrarlo se hace el arqueo automático.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2 w-2 rounded-full bg-success animate-pulse shrink-0" />
          <span className="truncate">
            <b>Turno activo</b>
            {shift.store_name ? ` · ${shift.store_name}` : ""}
            {" · "}
            <span className="text-muted-foreground">
              desde {format(new Date(shift.opened_at), "HH:mm", { locale: es })}
            </span>
          </span>
        </div>
        <button onClick={() => nav(`/turnos/${shift.id}`)} className="text-primary font-medium hover:underline shrink-0">
          Ver turno
        </button>
      </div>
      {children}
    </div>
  );
}
