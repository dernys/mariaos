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
const SuperAdmin = lazy(() => import("./pages/SuperAdmin"));
const PedidosOnline = lazy(() => import("./pages/PedidosOnline"));
const Transferencias = lazy(() => import("./pages/Transferencias"));
const Compras = lazy(() => import("./pages/Compras"));
const Devoluciones = lazy(() => import("./pages/Devoluciones"));
const Cuentas = lazy(() => import("./pages/Cuentas"));
const Facturas = lazy(() => import("./pages/Facturas"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
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

const P = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
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
              <Route path="/reset-password" element={<Suspense fallback={<PageLoader />}><ResetPassword /></Suspense>} />
              <Route path="/" element={<Landing />} />
              <Route path="/landing" element={<Landing />} />
              <Route path="/marketplace" element={<Suspense fallback={<PageLoader />}><Marketplace /></Suspense>} />
              <Route path="/app" element={<P><Index /></P>} />
              <Route path="/dashboard" element={<P><Index /></P>} />
              <Route path="/pos" element={<P><POS /></P>} />
              <Route path="/inventario" element={<P><Inventario /></P>} />
              <Route path="/inventario/inteligencia" element={<P><InventoryIntelligence /></P>} />
              <Route path="/clientes" element={<P><Clientes /></P>} />
              <Route path="/clientes/:id" element={<P><ClienteDetalle /></P>} />
              <Route path="/empleados" element={<P><Empleados /></P>} />
              <Route path="/empleados/:id" element={<P><EmpleadoDetalle /></P>} />
              <Route path="/proveedores" element={<P><Proveedores /></P>} />
              <Route path="/proveedores/:id" element={<P><ProveedorDetalle /></P>} />
              <Route path="/ventas/:id" element={<P><VentaDetalle /></P>} />
              <Route path="/consignaciones" element={<P><Consignacion /></P>} />
              <Route path="/tiendas" element={<P><Tiendas /></P>} />
              <Route path="/almacenes" element={<P><Almacenes /></P>} />
              <Route path="/configuracion" element={<P><Configuracion /></P>} />
              <Route path="/roles" element={<P><RolesPermisos /></P>} />
              <Route path="/turnos" element={<P><Turnos /></P>} />
              <Route path="/turnos/:id" element={<P><TurnoDetalle /></P>} />
              <Route path="/contabilidad" element={<P><Contabilidad /></P>} />
              <Route path="/contabilidad/:section" element={<P><Contabilidad /></P>} />
              <Route path="/recetas" element={<P><Recetas /></P>} />
              <Route path="/cocina" element={<P><Cocina /></P>} />
              <Route path="/mesas" element={<P><Mesas /></P>} />
              <Route path="/analytics" element={<P><Analytics /></P>} />
              <Route path="/pedidos-online" element={<P><PedidosOnline /></P>} />
              <Route path="/transferencias" element={<P><Transferencias /></P>} />
              <Route path="/compras" element={<P><Compras /></P>} />
              <Route path="/devoluciones" element={<P><Devoluciones /></P>} />
              <Route path="/cuentas" element={<P><Cuentas /></P>} />
              <Route path="/facturas" element={<P><Facturas /></P>} />
              <Route path="/reportes" element={<P><Reportes /></P>} />
              <Route path="/fidelizacion" element={<P><Fidelizacion /></P>} />
              <Route path="/rrhh" element={<P><RRHH /></P>} />
              <Route path="/rrhh/operativo" element={<Navigate to="/rrhh" replace />} />
              <Route path="/portal-empleado" element={<P><PortalEmpleado /></P>} />
              <Route path="/delivery" element={<P><Delivery /></P>} />
              <Route path="/superadmin" element={<P><SuperAdmin /></P>} />
              <Route path="/auditoria" element={<P><Auditoria /></P>} />
              <Route path="/command-center" element={<P><CommandCenter /></P>} />
              <Route path="/agents" element={<P><Agents /></P>} />
              <Route path="/agents/:id" element={<P><AgentDetalle /></P>} />
              <Route path="/decisions" element={<P><Decisions /></P>} />
              <Route path="/risk" element={<P><RiskEngine /></P>} />
              <Route path="/memory" element={<P><BusinessMemory /></P>} />
              <Route path="/workflows" element={<P><Workflows /></P>} />
              <Route path="/digital-twin" element={<P><DigitalTwin /></P>} />
              <Route path="/conteos" element={<P><Conteos /></P>} />
              <Route path="/operaciones" element={<P><Operaciones /></P>} />
              <Route path="/tesoreria" element={<P><Tesoreria /></P>} />
              <Route path="/developers" element={<P><Developers /></P>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </TenantProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
