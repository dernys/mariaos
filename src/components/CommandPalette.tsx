import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard, Monitor, Package, Store, Users, UserCheck, Warehouse, Settings,
  Clock, BookOpen, ChefHat, MapPin, ArrowRightLeft, BarChart3, ShoppingBag, Globe,
  ShoppingCart, Undo2, Wallet, FileText, Shield, Zap,
} from "lucide-react";

const routes: { label: string; path: string; icon: any; group: string }[] = [
  { label: "Inicio", path: "/", icon: LayoutDashboard, group: "Navegación" },
  { label: "POS", path: "/pos", icon: Monitor, group: "Operación" },
  { label: "Mesas", path: "/mesas", icon: MapPin, group: "Operación" },
  { label: "Cocina (KDS)", path: "/cocina", icon: ChefHat, group: "Operación" },
  { label: "Turnos", path: "/turnos", icon: Clock, group: "Operación" },
  { label: "Devoluciones", path: "/devoluciones", icon: Undo2, group: "Operación" },
  { label: "Inventario", path: "/inventario", icon: Package, group: "Catálogo" },
  { label: "Tiendas", path: "/tiendas", icon: Store, group: "Catálogo" },
  { label: "Almacenes", path: "/almacenes", icon: Warehouse, group: "Catálogo" },
  { label: "Transferencias", path: "/transferencias", icon: ArrowRightLeft, group: "Catálogo" },
  { label: "Compras", path: "/compras", icon: ShoppingCart, group: "Catálogo" },
  { label: "Marketplace", path: "/marketplace", icon: Globe, group: "Online" },
  { label: "Pedidos online", path: "/pedidos-online", icon: ShoppingBag, group: "Online" },
  { label: "Clientes", path: "/clientes", icon: Users, group: "Personas" },
  { label: "Empleados", path: "/empleados", icon: UserCheck, group: "Personas" },
  { label: "Roles y permisos", path: "/roles", icon: Shield, group: "Personas" },
  { label: "Cuentas", path: "/cuentas", icon: Wallet, group: "Finanzas" },
  { label: "Facturas", path: "/facturas", icon: FileText, group: "Finanzas" },
  { label: "Contabilidad", path: "/contabilidad", icon: BookOpen, group: "Finanzas" },
  { label: "Analítica", path: "/analytics", icon: BarChart3, group: "Finanzas" },
  { label: "Reportes & BI", path: "/reportes", icon: BarChart3, group: "Finanzas" },
 { label: "Fidelización", path: "/fidelizacion", icon: Users, group: "Personas" },
 { label: "RRHH (Asistencia/Nóminas)", path: "/rrhh", icon: Users, group: "Personas" },
 { label: "Delivery", path: "/delivery", icon: Users, group: "Online" },
  { label: "Configuración", path: "/configuracion", icon: Settings, group: "Sistema" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = Array.from(new Set(routes.map((r) => r.group)));

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar páginas, acciones... (Ctrl/Cmd+K)" />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>
        {groups.map((g, i) => (
          <div key={g}>
            {i > 0 && <CommandSeparator />}
            <CommandGroup heading={g}>
              {routes.filter((r) => r.group === g).map((r) => {
                const Icon = r.icon;
                return (
                  <CommandItem
                    key={r.path}
                    value={`${r.label} ${r.group}`}
                    onSelect={() => {
                      navigate(r.path);
                      setOpen(false);
                    }}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {r.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

export function CommandPaletteTrigger() {
  return (
    <button
      onClick={() => {
        const ev = new KeyboardEvent("keydown", { key: "k", ctrlKey: true });
        window.dispatchEvent(ev);
      }}
      className="hidden md:flex items-center gap-2 h-8 px-3 rounded-md border bg-background/50 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
    >
      <span>Buscar...</span>
      <kbd className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
    </button>
  );
}
