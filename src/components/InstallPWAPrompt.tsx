import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, Share, Plus, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

interface Props {
  variant?: "card" | "banner";
  delayMs?: number;
}

export function InstallPWAPrompt({ variant = "card", delayMs = 600 }: Props) {
  const { canInstall, isIOS, promptInstall, dismiss } = useInstallPrompt();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!canInstall) return setShow(false);
    const t = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(t);
  }, [canInstall, delayMs]);

  if (!show) return null;

  const handleInstall = async () => {
    if (isIOS) return; // iOS can't trigger programmatically
    const ok = await promptInstall();
    if (ok) setShow(false);
  };

  const handleClose = () => {
    dismiss();
    setShow(false);
  };

  if (variant === "banner") {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          className="bg-primary text-primary-foreground px-4 py-2 flex items-center justify-between gap-3 text-sm"
        >
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            <span>Instala MarIA OS para una mejor experiencia</span>
          </div>
          <div className="flex items-center gap-2">
            {!isIOS && (
              <Button size="sm" variant="secondary" onClick={handleInstall} className="h-7">
                Instalar
              </Button>
            )}
            <Button size="icon" variant="ghost" onClick={handleClose} className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/10">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        className="bg-card border rounded-2xl shadow-elevated p-4 relative"
      >
        <button
          onClick={handleClose}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl gradient-brand flex items-center justify-center shrink-0">
            <Download className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-heading font-semibold text-sm">Instala MarIA OS</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Acceso rápido, modo offline y notificaciones nativas.
            </p>
            {isIOS ? (
              <div className="mt-3 text-xs space-y-1.5 bg-muted/50 rounded-lg p-2.5">
                <p className="font-medium">Para instalar en iOS:</p>
                <p className="flex items-center gap-1.5">
                  <span>1.</span> Toca <Share className="h-3 w-3 inline" /> Compartir
                </p>
                <p className="flex items-center gap-1.5">
                  <span>2.</span> Selecciona <Plus className="h-3 w-3 inline" /> "Añadir a pantalla de inicio"
                </p>
              </div>
            ) : (
              <Button onClick={handleInstall} size="sm" className="mt-3 gradient-brand text-primary-foreground h-8 w-full">
                <Download className="h-3.5 w-3.5 mr-1.5" /> Instalar ahora
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
