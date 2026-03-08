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
  ChevronDown,
  Crown,
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
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const mainItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Punto de Venta", url: "/pos", icon: Monitor },
  { title: "Inventario", url: "/inventario", icon: Package },
  { title: "Clientes", url: "/clientes", icon: Users },
  { title: "Empleados", url: "/empleados", icon: UserCheck },
  { title: "Tiendas", url: "/tiendas", icon: Store },
  { title: "Almacenes", url: "/almacenes", icon: Warehouse },
  { title: "Turnos", url: "/turnos", icon: Clock },
  { title: "Contabilidad", url: "/contabilidad", icon: BookOpen },
];

const systemItems = [
  { title: "Roles y Permisos", url: "/roles", icon: Shield },
  { title: "Configuración", url: "/configuracion", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { profile, roles, signOut } = useAuth();
  const { isSuperadmin } = useSuperadmin();
  const { tenant, allTenants } = useTenantContext();

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
                VentaPro
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
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] uppercase tracking-widest font-heading">
            Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
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
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] uppercase tracking-widest font-heading">
            Sistema
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {systemItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      className="transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
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
                    <NavLink
                      to="/superadmin"
                      className="transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <Crown className="h-4 w-4" />
                      {!collapsed && <span>Gestión Empresas</span>}
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
