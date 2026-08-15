import { motion } from "framer-motion";
import { Clock, Play, ArrowRight, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveShift } from "@/hooks/useActiveShift";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es, enUS, ptBR } from "date-fns/locale";
import { useTranslation } from "react-i18next";

interface ShiftRequiredGateProps {
  children: React.ReactNode;
  /** Visual hint about the business type for messaging */
  variant?: "bar" | "restaurant" | "empresa";
}

export function ShiftRequiredGate({ children, variant = "empresa" }: ShiftRequiredGateProps) {
  const { t, i18n } = useTranslation();
  const { shift, openShifts, selectShift, loading } = useActiveShift();
  const nav = useNavigate();
  const dateLocale = i18n.language.startsWith("pt") ? ptBR : i18n.language.startsWith("en") ? enUS : es;


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
          <h2 className="font-heading font-bold text-lg mb-2">{t(`pos.shift.${variant}.title`)}</h2>
          <p className="text-sm text-muted-foreground mb-6">{t(`pos.shift.${variant}.sub`)}</p>
          <Button onClick={() => nav("/turnos")} className="w-full gap-2 gradient-brand text-primary-foreground font-heading">
            <Play className="h-4 w-4" /> {t("pos.shift.openNow")} <ArrowRight className="h-4 w-4 ml-auto" />
          </Button>
          <p className="text-[10px] text-muted-foreground mt-4">
            {t("pos.shift.footer")}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 text-xs flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2 w-2 rounded-full bg-success animate-pulse shrink-0" />
          <span className="truncate">
            <b>{t("pos.shift.active")}</b>
            {shift.store_name ? ` · ${shift.store_name}` : ""}
            {" · "}
            <span className="text-muted-foreground">
              {t("pos.shift.since", { time: format(new Date(shift.opened_at), "HH:mm", { locale: dateLocale }) })}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {openShifts.length > 1 && (
            <Select value={shift.id} onValueChange={(v) => selectShift(v)}>
              <SelectTrigger className="h-7 text-xs w-[190px]">
                <Store className="h-3 w-3 mr-1 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {openShifts.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {s.store_name || "—"} · {format(new Date(s.opened_at), "HH:mm")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <button onClick={() => nav(`/turnos/${shift.id}`)} className="text-primary font-medium hover:underline">
            {t("pos.shift.view")}
          </button>
        </div>
      </div>
      {children}
    </div>
  );

}
