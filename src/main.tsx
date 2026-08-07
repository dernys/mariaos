import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { installGlobalErrorHandlers } from "@/lib/observability";

// QW3 — captura global de errores con contexto (tenant/usuario/módulo/correlation).
installGlobalErrorHandlers();


// PWA registration with iframe/preview guard
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com") ||
  window.location.hostname.includes("lovable.app");

if (isInIframe || isPreviewHost) {
  // Never register SW in preview/iframe — clean up if any leaked
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
  }
} else if ("serviceWorker" in navigator) {
  import("virtual:pwa-register").then(({ registerSW }) => {
    // registerType=prompt + sw without auto skipWaiting:
    // an update is staged but NOT applied until the user accepts,
    // so a live POS sale never gets interrupted by a forced reload.
    const updateSW = registerSW({
      immediate: true,
      async onNeedRefresh() {
        const { toast } = await import("sonner");
        toast("Nueva versión disponible", {
          description: "Aplicar ahora puede cerrar ventanas abiertas.",
          duration: Infinity,
          action: { label: "Actualizar", onClick: () => updateSW(true) },
        });
      },
      async onOfflineReady() {
        const { toast } = await import("sonner");
        toast.success("Listo para usar sin conexión");
      },
    });
  }).catch(() => {});
}

createRoot(document.getElementById("root")!).render(<App />);
