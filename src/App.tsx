import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { TenantProvider } from "@/hooks/useTenantContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import POS from "./pages/POS";
import Inventario from "./pages/Inventario";
import Clientes from "./pages/Clientes";
import Empleados from "./pages/Empleados";
import Tiendas from "./pages/Tiendas";
import Almacenes from "./pages/Almacenes";
import Configuracion from "./pages/Configuracion";
import RolesPermisos from "./pages/RolesPermisos";
import Turnos from "./pages/Turnos";
import Contabilidad from "./pages/Contabilidad";
import Cocina from "./pages/Cocina";
import Mesas from "./pages/Mesas";
import Analytics from "./pages/Analytics";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import SuperAdmin from "./pages/SuperAdmin";
import PedidosOnline from "./pages/PedidosOnline";
import Transferencias from "./pages/Transferencias";
import Compras from "./pages/Compras";
import Devoluciones from "./pages/Devoluciones";
import Cuentas from "./pages/Cuentas";
import Facturas from "./pages/Facturas";
import Marketplace from "./pages/Marketplace";
import Reportes from "./pages/Reportes";
import Fidelizacion from "./pages/Fidelizacion";
import RRHH from "./pages/RRHH";
import Delivery from "./pages/Delivery";
import Proveedores from "./pages/Proveedores";
import ClienteDetalle from "./pages/ClienteDetalle";
import EmpleadoDetalle from "./pages/EmpleadoDetalle";
import ProveedorDetalle from "./pages/ProveedorDetalle";
import VentaDetalle from "./pages/VentaDetalle";
import Consignacion from "./pages/Consignacion";
import TurnoDetalle from "./pages/TurnoDetalle";
import NotFound from "./pages/NotFound";
import Landing from "./pages/Landing";

const queryClient = new QueryClient();

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
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/" element={<Landing />} />
              <Route path="/app" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/pos" element={<ProtectedRoute><POS /></ProtectedRoute>} />
              <Route path="/inventario" element={<ProtectedRoute><Inventario /></ProtectedRoute>} />
              <Route path="/clientes" element={<ProtectedRoute><Clientes /></ProtectedRoute>} />
              <Route path="/clientes/:id" element={<ProtectedRoute><ClienteDetalle /></ProtectedRoute>} />
              <Route path="/empleados" element={<ProtectedRoute><Empleados /></ProtectedRoute>} />
              <Route path="/empleados/:id" element={<ProtectedRoute><EmpleadoDetalle /></ProtectedRoute>} />
              <Route path="/proveedores" element={<ProtectedRoute><Proveedores /></ProtectedRoute>} />
              <Route path="/proveedores/:id" element={<ProtectedRoute><ProveedorDetalle /></ProtectedRoute>} />
              <Route path="/ventas/:id" element={<ProtectedRoute><VentaDetalle /></ProtectedRoute>} />
              <Route path="/consignaciones" element={<ProtectedRoute><Consignacion /></ProtectedRoute>} />
              <Route path="/tiendas" element={<ProtectedRoute><Tiendas /></ProtectedRoute>} />
              <Route path="/almacenes" element={<ProtectedRoute><Almacenes /></ProtectedRoute>} />
              <Route path="/configuracion" element={<ProtectedRoute><Configuracion /></ProtectedRoute>} />
              <Route path="/roles" element={<ProtectedRoute><RolesPermisos /></ProtectedRoute>} />
              <Route path="/turnos" element={<ProtectedRoute><Turnos /></ProtectedRoute>} />
              <Route path="/turnos/:id" element={<ProtectedRoute><TurnoDetalle /></ProtectedRoute>} />
              <Route path="/contabilidad" element={<ProtectedRoute><Contabilidad /></ProtectedRoute>} />
              <Route path="/cocina" element={<ProtectedRoute><Cocina /></ProtectedRoute>} />
              <Route path="/mesas" element={<ProtectedRoute><Mesas /></ProtectedRoute>} />
              <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
              <Route path="/pedidos-online" element={<ProtectedRoute><PedidosOnline /></ProtectedRoute>} />
              <Route path="/transferencias" element={<ProtectedRoute><Transferencias /></ProtectedRoute>} />
              <Route path="/compras" element={<ProtectedRoute><Compras /></ProtectedRoute>} />
              <Route path="/devoluciones" element={<ProtectedRoute><Devoluciones /></ProtectedRoute>} />
              <Route path="/cuentas" element={<ProtectedRoute><Cuentas /></ProtectedRoute>} />
              <Route path="/facturas" element={<ProtectedRoute><Facturas /></ProtectedRoute>} />
              <Route path="/reportes" element={<ProtectedRoute><Reportes /></ProtectedRoute>} />
              <Route path="/fidelizacion" element={<ProtectedRoute><Fidelizacion /></ProtectedRoute>} />
              <Route path="/rrhh" element={<ProtectedRoute><RRHH /></ProtectedRoute>} />
              <Route path="/delivery" element={<ProtectedRoute><Delivery /></ProtectedRoute>} />
              <Route path="/superadmin" element={<ProtectedRoute><SuperAdmin /></ProtectedRoute>} />
              <Route path="/marketplace" element={<Marketplace />} />
              <Route path="/landing" element={<Landing />} />
              <Route path="/dashboard" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </TenantProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
