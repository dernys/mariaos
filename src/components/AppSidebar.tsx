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
import { usePermissions } from "@/hooks/usePermissions";

import { TenantSelector } from "@/components/TenantSelector";
import { useTenantContext } from "@/hooks/useTenantContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";
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
  titleKey: string;
  url: string;
  icon: typeof LayoutDashboard;
}

interface MenuItem {
  titleKey: string;
  url: string;
  icon: typeof LayoutDashboard;
  types?: BizType[];
  children?: MenuChild[];
}

interface MenuGroup {
  labelKey: string;
  items: MenuItem[];
}

/** Maps a route to the app_modules slug that governs its visibility. */
const URL_MODULE_OVERRIDES: Record<string, string> = {
  app: "dashboard",
  "command-center": "mariaos",
  decisions: "mariaos",
  risk: "mariaos",
  memory: "mariaos",
  "digital-twin": "mariaos",
  workflows: "mariaos",
  developers: "configuracion",
};

const moduleForUrl = (url: string) => {
  const seg = url.split("/")[1] ?? "";
  return URL_MODULE_OVERRIDES[seg] ?? seg;
};


const menuGroups: MenuGroup[] = [
  {
    labelKey: "mariaos",
    items: [
      { titleKey: "commandCenter", url: "/command-center", icon: Sparkles },
      { titleKey: "agents", url: "/agents", icon: Bot },
      { titleKey: "decisions", url: "/decisions", icon: Brain },
      { titleKey: "risks", url: "/risk", icon: ShieldAlert },
      { titleKey: "memory", url: "/memory", icon: GitBranch },
      { titleKey: "digitalTwin", url: "/digital-twin", icon: Workflow },
      { titleKey: "workflows", url: "/workflows", icon: Workflow },
    ],
  },
  {
    labelKey: "general",
    items: [
      { titleKey: "dashboard", url: "/app", icon: LayoutDashboard },
      { titleKey: "analytics", url: "/analytics", icon: BarChart3 },
      { titleKey: "reports", url: "/reportes", icon: PieChart },
    ],
  },
  {
    labelKey: "operations",
    items: [
      { titleKey: "pos", url: "/pos", icon: Monitor },
      { titleKey: "tables", url: "/mesas", icon: MapPin, types: ["restaurante", "restaurant", "bar"] },
      { titleKey: "kitchen", url: "/cocina", icon: ChefHat, types: ["restaurante", "restaurant", "bar"] },
      { titleKey: "shifts", url: "/turnos", icon: Clock },
    ],
  },
  {
    labelKey: "inventory",
    items: [
      { titleKey: "products", url: "/inventario", icon: Package },
      { titleKey: "recipes", url: "/recetas", icon: Utensils, types: ["restaurante", "restaurant", "bar"] },
      { titleKey: "intelligence", url: "/inventario/inteligencia", icon: Brain },
      { titleKey: "counts", url: "/conteos", icon: Shield },
      { titleKey: "warehouses", url: "/almacenes", icon: Warehouse, types: ["empresa"] },
      { titleKey: "stores", url: "/tiendas", icon: Store, types: ["empresa"] },
      { titleKey: "operationsItem", url: "/operaciones", icon: Workflow, types: ["empresa"] },
      { titleKey: "transfers", url: "/transferencias", icon: ArrowRightLeft, types: ["empresa"] },
    ],
  },
  {
    labelKey: "purchasesSales",
    items: [
      { titleKey: "purchases", url: "/compras", icon: ShoppingCart },
      { titleKey: "suppliers", url: "/proveedores", icon: Truck },
      { titleKey: "returns", url: "/devoluciones", icon: Undo2 },
      { titleKey: "invoices", url: "/facturas", icon: FileText },
      { titleKey: "accounts", url: "/cuentas", icon: Wallet },
      { titleKey: "consignments", url: "/consignaciones", icon: Package, types: ["empresa"] },
    ],
  },
  {
    labelKey: "people",
    items: [
      { titleKey: "customers", url: "/clientes", icon: Users },
      { titleKey: "employees", url: "/empleados", icon: UserCheck },
      { titleKey: "hr", url: "/rrhh", icon: Briefcase },
      { titleKey: "employeePortal", url: "/portal-empleado", icon: UserCheck },
      { titleKey: "loyalty", url: "/fidelizacion", icon: Award },
    ],
  },
  {
    labelKey: "finance",
    items: [
      {
        titleKey: "accounting",
        url: "/contabilidad",
        icon: BookOpen,
        children: [
          { titleKey: "chartOfAccounts", url: "/contabilidad/plan", icon: ListTree },
          { titleKey: "operationAcc", url: "/contabilidad/operacion", icon: ClipboardList },
          { titleKey: "analysis", url: "/contabilidad/analisis", icon: BarChart3 },
        ],
      },
      { titleKey: "treasury", url: "/tesoreria", icon: Wallet },
    ],
  },
  {
    labelKey: "online",
    items: [
      { titleKey: "onlineOrders", url: "/pedidos-online", icon: ShoppingBag, types: ["restaurante", "restaurant", "bar", "empresa"] },
      { titleKey: "delivery", url: "/delivery", icon: Bike, types: ["restaurante", "restaurant", "bar", "empresa"] },
      { titleKey: "marketplace", url: "/marketplace", icon: Globe, types: ["empresa"] },
    ],
  },
];

const systemItems: MenuItem[] = [
  { titleKey: "roles", url: "/roles", icon: Shield },
  { titleKey: "developers", url: "/developers", icon: Shield },
  { titleKey: "settings", url: "/configuracion", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { profile, roles, signOut } = useAuth();
  const { isSuperadmin } = useSuperadmin();
  const { canView } = usePermissions();

  const { tenant, allTenants, businessType } = useTenantContext();
  const { t } = useTranslation();
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
    const title = t(`nav.items.${item.titleKey}`);
    if (item.children && item.children.length > 0) {
      const parentActive = isActive(item.url);
      return (
        <Collapsible key={item.titleKey} defaultOpen={parentActive} className="group/collapsible">
          <SidebarMenuItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton isActive={parentActive} tooltip={title} className="w-full">
                <item.icon className="h-4 w-4" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{title}</span>
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
                          <span>{t(`nav.items.${c.titleKey}`)}</span>
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
      <SidebarMenuItem key={item.titleKey}>
        <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={title}>
          <NavLink
            to={item.url}
            end={item.url === "/"}
            className="transition-colors"
            activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
          >
            <item.icon className="h-4 w-4" />
            {!collapsed && <span>{title}</span>}
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
                {tenant?.name || "Sistema"}
              </span>
            </div>
          )}
        </div>
        {!collapsed && allTenants.length > 1 && <TenantSelector />}
      </SidebarHeader>

      <SidebarContent>
        {menuGroups.map((group) => {
          const visible = group.items.filter(
            (it) =>
              (!it.types || it.types.includes(biz)) && canView(moduleForUrl(it.url))
          );
          if (visible.length === 0) return null;

          return (
            <SidebarGroup key={group.labelKey}>
              <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] uppercase tracking-widest font-heading">
                {t(`nav.groups.${group.labelKey}`)}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>{visible.map(renderItem)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}

        {systemItems.filter((it) => canView(moduleForUrl(it.url))).length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] uppercase tracking-widest font-heading">
              {t("nav.groups.system")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {systemItems.filter((it) => canView(moduleForUrl(it.url))).map(renderItem)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}


        {isSuperadmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] uppercase tracking-widest font-heading">
              {t("nav.groups.superadmin")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/superadmin")} tooltip={t("nav.items.tenantManagement")}>
                    <NavLink to="/superadmin" className="transition-colors" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <Crown className="h-4 w-4" />
                      {!collapsed && <span>{t("nav.items.tenantManagement")}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/auditoria")} tooltip={t("nav.items.audit")}>
                    <NavLink to="/auditoria" className="transition-colors" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <Shield className="h-4 w-4" />
                      {!collapsed && <span>{t("nav.items.audit")}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/eventos")} tooltip="Event Store (shadow)">
                    <NavLink to="/eventos" className="transition-colors" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <Shield className="h-4 w-4" />
                      {!collapsed && <span>Event Store</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4">
        {!collapsed ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent p-3">
              <div className="h-8 w-8 rounded-full gradient-brand flex items-center justify-center text-primary-foreground text-xs font-bold font-heading shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-sidebar-accent-foreground truncate">
                  {profile?.full_name ?? t("common.user")}
                </p>
                <p className="text-[10px] text-sidebar-foreground/50">
                  {roles.length > 0 ? roles.join(", ") : t("common.noRole")}
                </p>
              </div>
            </div>
            <LanguageSwitcher />
            <button
              onClick={signOut}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t("common.logout")}
            </button>
          </div>
        ) : (
          <LanguageSwitcher collapsed />
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
