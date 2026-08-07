import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { TenantProvider } from "@/hooks/useTenantContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Lazy-loaded routes (Fase I: code splitting)
const Index = lazy(() => import("./pages/Index"));
const POS = lazy(() => import("./pages/POS"));
const Inventario = lazy(() => import("./pages/Inventario"));
const Clientes = lazy(() => import("./pages/Clientes"));
const Empleados = lazy(() => import("./pages/Empleados"));
const Tiendas = lazy(() => import("./pages/Tiendas"));
const Almacenes = lazy(() => import("./pages/Almacenes"));
const Configuracion = lazy(() => import("./pages/Configuracion"));
const RolesPermisos = lazy(() => import("./pages/RolesPermisos"));
const Turnos = lazy(() => import("./pages/Turnos"));
const Contabilidad = lazy(() => import("./pages/Contabilidad"));
const Cocina = lazy(() => import("./pages/Cocina"));
const Mesas = lazy(() => import("./pages/Mesas"));
const Analytics = lazy(() => import("./pages/Analytics"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));
const SuperAdmin = lazy(() => import("./pages/SuperAdmin"));
const PedidosOnline = lazy(() => import("./pages/PedidosOnline"));
const Transferencias = lazy(() => import("./pages/Transferencias"));
const Compras = lazy(() => import("./pages/Compras"));
const Devoluciones = lazy(() => import("./pages/Devoluciones"));
const Cuentas = lazy(() => import("./pages/Cuentas"));
const Facturas = lazy(() => import("./pages/Facturas"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const MarketplaceProduct = lazy(() => import("./pages/MarketplaceProduct"));
const Reportes = lazy(() => import("./pages/Reportes"));
const Fidelizacion = lazy(() => import("./pages/Fidelizacion"));
const RRHH = lazy(() => import("./pages/RRHH"));
const Delivery = lazy(() => import("./pages/Delivery"));
const Proveedores = lazy(() => import("./pages/Proveedores"));
const ClienteDetalle = lazy(() => import("./pages/ClienteDetalle"));
const EmpleadoDetalle = lazy(() => import("./pages/EmpleadoDetalle"));
const ProveedorDetalle = lazy(() => import("./pages/ProveedorDetalle"));
const VentaDetalle = lazy(() => import("./pages/VentaDetalle"));
const Consignacion = lazy(() => import("./pages/Consignacion"));
const TurnoDetalle = lazy(() => import("./pages/TurnoDetalle"));
const Auditoria = lazy(() => import("./pages/Auditoria"));
const EventStore = lazy(() => import("./pages/EventStore"));
const CommandCenter = lazy(() => import("./pages/CommandCenter"));
const Agents = lazy(() => import("./pages/Agents"));
const AgentDetalle = lazy(() => import("./pages/AgentDetalle"));
const Decisions = lazy(() => import("./pages/Decisions"));
const RiskEngine = lazy(() => import("./pages/RiskEngine"));
const BusinessMemory = lazy(() => import("./pages/BusinessMemory"));
const Workflows = lazy(() => import("./pages/Workflows"));
const DigitalTwin = lazy(() => import("./pages/DigitalTwin"));
const Conteos = lazy(() => import("./pages/Conteos"));
const InventoryIntelligence = lazy(() => import("./pages/InventoryIntelligence"));
const Operaciones = lazy(() => import("./pages/Operaciones"));
const Tesoreria = lazy(() => import("./pages/Tesoreria"));

const Developers = lazy(() => import("./pages/Developers"));
const PortalEmpleado = lazy(() => import("./pages/PortalEmpleado"));
const Recetas = lazy(() => import("./pages/Recetas"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const PageLoader = () => (
  <div className="flex items-center justify-center h-screen text-sm text-muted-foreground">
    Cargando…
  </div>
);

const P = ({ children, m }: { children: React.ReactNode; m?: string }) => (
  <ProtectedRoute module={m}>
    <Suspense fallback={<PageLoader />}>{children}</Suspense>
  </ProtectedRoute>
);


const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TenantProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/.lovable/oauth/consent" element={<Suspense fallback={<PageLoader />}><OAuthConsent /></Suspense>} />
              <Route path="/reset-password" element={<Suspense fallback={<PageLoader />}><ResetPassword /></Suspense>} />
              <Route path="/" element={<Landing />} />
              <Route path="/landing" element={<Landing />} />
              <Route path="/marketplace" element={<Suspense fallback={<PageLoader />}><Marketplace /></Suspense>} />
              <Route path="/marketplace/p/:id" element={<Suspense fallback={<PageLoader />}><MarketplaceProduct /></Suspense>} />
              <Route path="/app" element={<P m="dashboard"><Index /></P>} />
              <Route path="/dashboard" element={<P m="dashboard"><Index /></P>} />
              <Route path="/pos" element={<P m="pos"><POS /></P>} />
              <Route path="/inventario" element={<P m="inventario"><Inventario /></P>} />
              <Route path="/inventario/inteligencia" element={<P m="inventario"><InventoryIntelligence /></P>} />
              <Route path="/clientes" element={<P m="clientes"><Clientes /></P>} />
              <Route path="/clientes/:id" element={<P m="clientes"><ClienteDetalle /></P>} />
              <Route path="/empleados" element={<P m="empleados"><Empleados /></P>} />
              <Route path="/empleados/:id" element={<P m="empleados"><EmpleadoDetalle /></P>} />
              <Route path="/proveedores" element={<P m="proveedores"><Proveedores /></P>} />
              <Route path="/proveedores/:id" element={<P m="proveedores"><ProveedorDetalle /></P>} />
              <Route path="/ventas/:id" element={<P m="ventas"><VentaDetalle /></P>} />
              <Route path="/consignaciones" element={<P m="consignaciones"><Consignacion /></P>} />
              <Route path="/tiendas" element={<P m="tiendas"><Tiendas /></P>} />
              <Route path="/almacenes" element={<P m="almacenes"><Almacenes /></P>} />
              <Route path="/configuracion" element={<P m="configuracion"><Configuracion /></P>} />
              <Route path="/roles" element={<P m="roles"><RolesPermisos /></P>} />
              <Route path="/turnos" element={<P m="turnos"><Turnos /></P>} />
              <Route path="/turnos/:id" element={<P m="turnos"><TurnoDetalle /></P>} />
              <Route path="/contabilidad" element={<P m="contabilidad"><Contabilidad /></P>} />
              <Route path="/contabilidad/:section" element={<P m="contabilidad"><Contabilidad /></P>} />
              <Route path="/recetas" element={<P m="recetas"><Recetas /></P>} />
              <Route path="/cocina" element={<P m="cocina"><Cocina /></P>} />
              <Route path="/mesas" element={<P m="mesas"><Mesas /></P>} />
              <Route path="/analytics" element={<P m="analytics"><Analytics /></P>} />
              <Route path="/pedidos-online" element={<P m="pedidos-online"><PedidosOnline /></P>} />
              <Route path="/transferencias" element={<P m="transferencias"><Transferencias /></P>} />
              <Route path="/compras" element={<P m="compras"><Compras /></P>} />
              <Route path="/devoluciones" element={<P m="devoluciones"><Devoluciones /></P>} />
              <Route path="/cuentas" element={<P m="cuentas"><Cuentas /></P>} />
              <Route path="/facturas" element={<P m="facturas"><Facturas /></P>} />
              <Route path="/reportes" element={<P m="reportes"><Reportes /></P>} />
              <Route path="/fidelizacion" element={<P m="fidelizacion"><Fidelizacion /></P>} />
              <Route path="/rrhh" element={<P m="rrhh"><RRHH /></P>} />
              <Route path="/rrhh/operativo" element={<Navigate to="/rrhh" replace />} />
              <Route path="/portal-empleado" element={<P m="portal-empleado"><PortalEmpleado /></P>} />
              <Route path="/delivery" element={<P m="delivery"><Delivery /></P>} />
              <Route path="/superadmin" element={<P><SuperAdmin /></P>} />
              <Route path="/auditoria" element={<P><Auditoria /></P>} />
              <Route path="/eventos" element={<P><EventStore /></P>} />
              <Route path="/command-center" element={<P m="mariaos"><CommandCenter /></P>} />
              <Route path="/agents" element={<P m="agents"><Agents /></P>} />
              <Route path="/agents/:id" element={<P m="agents"><AgentDetalle /></P>} />
              <Route path="/decisions" element={<P m="mariaos"><Decisions /></P>} />
              <Route path="/risk" element={<P m="mariaos"><RiskEngine /></P>} />
              <Route path="/memory" element={<P m="mariaos"><BusinessMemory /></P>} />
              <Route path="/workflows" element={<P m="mariaos"><Workflows /></P>} />
              <Route path="/digital-twin" element={<P m="mariaos"><DigitalTwin /></P>} />
              <Route path="/conteos" element={<P m="conteos"><Conteos /></P>} />
              <Route path="/operaciones" element={<P m="operaciones"><Operaciones /></P>} />
              <Route path="/tesoreria" element={<P m="tesoreria"><Tesoreria /></P>} />
              <Route path="/developers" element={<P m="configuracion"><Developers /></P>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </TenantProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
