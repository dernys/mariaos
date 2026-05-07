import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const map: Record<string, string> = {
  p: "/pos",
  i: "/inventario",
  v: "/pos",
  f: "/facturas",
  c: "/clientes",
  t: "/turnos",
  m: "/mesas",
  k: "/cocina",
};

export function useGlobalShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    let pendingG = false;
    let timer: any;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (pendingG) {
        const path = map[e.key.toLowerCase()];
        pendingG = false;
        clearTimeout(timer);
        if (path) {
          e.preventDefault();
          navigate(path);
        }
        return;
      }
      if (e.key.toLowerCase() === "g") {
        pendingG = true;
        timer = setTimeout(() => (pendingG = false), 1200);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);
}
