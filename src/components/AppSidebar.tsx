import {
  LayoutDashboard,
  Monitor,
  Package,
  Store,
  Users,
  UserCheck,
  Warehouse,
  Settings,
  Shield,
  Clock,
  BookOpen,
  Zap,
  LogOut,
  Crown,
  ChefHat,
  MapPin,
  ArrowRightLeft,
  BarChart3,
  ShoppingBag,
  Globe,
  ShoppingCart,
  Undo2,
  Wallet,
  FileText,
  PieChart,
  Award,
  Briefcase,
  Bike,
  Truck,
  Bot,
  Brain,
  ShieldAlert,
  Workflow,
  GitBranch,
  Sparkles,
  ChevronRight,
  ListTree,
  ClipboardList,
  Utensils,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSuperadmin } from "@/hooks/useSuperadmin";
import { TenantSelector } from "@/components/TenantSelector";
import { useTenantContext } from "@/hooks/useTenantContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type BizType = "restaurante" | "restaurant" | "bar" | "empresa";

interface MenuChild {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
}

interface MenuItem {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  types?: BizType[];
  children?: MenuChild[];
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

const adminOnlyGroupLabels = new Set(["MarIA OS"]);

const menuGroups: MenuGroup[] = [
  {
    label: "MarIA OS",
    items: [
      { title: "Command Center", url: "/command-center", icon: Sparkles },
      { title: "Agentes IA", url: "/agents", icon: Bot },
      { title: "Decisiones", url: "/decisions", icon: Brain },
      { title: "Riesgos", url: "/risk", icon: ShieldAlert },
      { title: "Memoria", url: "/memory", icon: GitBranch },
      { title: "Digital Twin", url: "/digital-twin", icon: Workflow },
      { title: "Workflows", url: "/workflows", icon: Workflow },
    ],
  },
  {
    label: "General",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
      { title: "Analytics", url: "/analytics", icon: BarChart3 },
      { title: "Reportes & BI", url: "/reportes", icon: PieChart },
    ],
  },
  {
    label: "Operaciones",
    items: [
      { title: "Punto de Venta", url: "/pos", icon: Monitor },
      { title: "Mapa de Mesas", url: "/mesas", icon: MapPin, types: ["restaurante", "restaurant", "bar"] },
      { title: "Cocina (KDS)", url: "/cocina", icon: ChefHat, types: ["restaurante", "restaurant", "bar"] },
      { title: "Turnos", url: "/turnos", icon: Clock },
    ],
  },
  {
    label: "Inventario",
    items: [
      { title: "Productos", url: "/inventario", icon: Package },
      { title: "Recetas", url: "/recetas", icon: Utensils, types: ["restaurante", "restaurant", "bar"] },
      { title: "Inteligencia", url: "/inventario/inteligencia", icon: Brain },
      { title: "Conteos físicos", url: "/conteos", icon: Shield },
      { title: "Almacenes", url: "/almacenes", icon: Warehouse, types: ["empresa"] },
      { title: "Tiendas", url: "/tiendas", icon: Store, types: ["empresa"] },
      { title: "Operaciones", url: "/operaciones", icon: Workflow, types: ["empresa"] },
      { title: "Transferencias", url: "/transferencias", icon: ArrowRightLeft, types: ["empresa"] },
    ],
  },
  {
    label: "Compras y Ventas",
    items: [
      { title: "Compras", url: "/compras", icon: ShoppingCart },
      { title: "Proveedores", url: "/proveedores", icon: Truck },
      { title: "Devoluciones", url: "/devoluciones", icon: Undo2 },
      { title: "Facturas", url: "/facturas", icon: FileText },
      { title: "Cuentas (CxC/CxP)", url: "/cuentas", icon: Wallet },
      { title: "Consignaciones", url: "/consignaciones", icon: Package, types: ["empresa"] },
    ],
  },
  {
    label: "Personas",
    items: [
      { title: "Clientes", url: "/clientes", icon: Users },
      { title: "Empleados", url: "/empleados", icon: UserCheck },
      { title: "Recursos Humanos", url: "/rrhh", icon: Briefcase },
      { title: "Portal Empleado", url: "/portal-empleado", icon: UserCheck },
      { title: "Fidelización", url: "/fidelizacion", icon: Award },
    ],
  },
  {
    label: "Finanzas",
    items: [
      {
        title: "Contabilidad",
        url: "/contabilidad",
        icon: BookOpen,
        children: [
          { title: "Plan Contable", url: "/contabilidad/plan", icon: ListTree },
          { title: "Operación", url: "/contabilidad/operacion", icon: ClipboardList },
          { title: "Análisis", url: "/contabilidad/analisis", icon: BarChart3 },
        ],
      },
      { title: "Tesorería", url: "/tesoreria", icon: Wallet },
    ],
  },
  {
    label: "Online",
    items: [
      { title: "Pedidos Online", url: "/pedidos-online", icon: ShoppingBag, types: ["restaurante", "restaurant", "bar", "empresa"] },
      { title: "Delivery", url: "/delivery", icon: Bike, types: ["restaurante", "restaurant", "bar", "empresa"] },
      { title: "Marketplace", url: "/marketplace", icon: Globe, types: ["empresa"] },
    ],
  },
];

const systemItems: MenuItem[] = [
  { title: "Roles y Permisos", url: "/roles", icon: Shield },
  { title: "API & Webhooks", url: "/developers", icon: Shield },
  { title: "Configuración", url: "/configuracion", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { profile, roles, signOut } = useAuth();
  const { isSuperadmin } = useSuperadmin();
  const { tenant, allTenants, businessType } = useTenantContext();
  const biz = (businessType || "empresa") as BizType;

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const initials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "??";

  const renderItem = (item: MenuItem) => {
    if (item.children && item.children.length > 0) {
      const parentActive = isActive(item.url);
      return (
        <Collapsible key={item.title} defaultOpen={parentActive} className="group/collapsible">
          <SidebarMenuItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton isActive={parentActive} tooltip={item.title} className="w-full">
                <item.icon className="h-4 w-4" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{item.title}</span>
                    <ChevronRight className="h-3.5 w-3.5 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                  </>
                )}
              </SidebarMenuButton>
            </CollapsibleTrigger>
            {!collapsed && (
              <CollapsibleContent>
                <SidebarMenuSub>
                  {item.children.map((c) => (
                    <SidebarMenuSubItem key={c.url}>
                      <SidebarMenuSubButton asChild isActive={location.pathname === c.url}>
                        <NavLink
                          to={c.url}
                          className="transition-colors"
                          activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                        >
                          <c.icon className="h-3.5 w-3.5" />
                          <span>{c.title}</span>
                        </NavLink>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            )}
          </SidebarMenuItem>
        </Collapsible>
      );
    }
    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
          <NavLink
            to={item.url}
            end={item.url === "/"}
            className="transition-colors"
            activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
          >
            <item.icon className="h-4 w-4" />
            {!collapsed && <span>{item.title}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg gradient-brand flex items-center justify-center shrink-0">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-heading text-sm font-bold text-sidebar-primary-foreground tracking-tight">
                MarIA OS
              </span>
              <span className="text-[10px] text-sidebar-foreground/60">
                {tenant?.name || "Sistema de Ventas"}
              </span>
            </div>
          )}
        </div>
        {!collapsed && allTenants.length > 1 && <TenantSelector />}
      </SidebarHeader>

      <SidebarContent>
        {menuGroups.map((group) => {
          if (adminOnlyGroupLabels.has(group.label) && !roles.includes("admin") && !isSuperadmin) {
            return null;
          }
          const visible = group.items.filter((it) => !it.types || it.types.includes(biz));
          if (visible.length === 0) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] uppercase tracking-widest font-heading">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>{visible.map(renderItem)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] uppercase tracking-widest font-heading">
            Sistema
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{systemItems.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isSuperadmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] uppercase tracking-widest font-heading">
              Super Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/superadmin")} tooltip="Super Admin">
                    <NavLink to="/superadmin" className="transition-colors" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <Crown className="h-4 w-4" />
                      {!collapsed && <span>Gestión Empresas</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/auditoria")} tooltip="Auditoría">
                    <NavLink to="/auditoria" className="transition-colors" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <Shield className="h-4 w-4" />
                      {!collapsed && <span>Auditoría</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4">
        {!collapsed && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent p-3">
              <div className="h-8 w-8 rounded-full gradient-brand flex items-center justify-center text-primary-foreground text-xs font-bold font-heading shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-sidebar-accent-foreground truncate">
                  {profile?.full_name ?? "Usuario"}
                </p>
                <p className="text-[10px] text-sidebar-foreground/50">
                  {roles.length > 0 ? roles.join(", ") : "Sin rol"}
                </p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Cerrar Sesión
            </button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
