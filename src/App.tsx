import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
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
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import SuperAdmin from "./pages/SuperAdmin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/pos" element={<ProtectedRoute><POS /></ProtectedRoute>} />
            <Route path="/inventario" element={<ProtectedRoute><Inventario /></ProtectedRoute>} />
            <Route path="/clientes" element={<ProtectedRoute><Clientes /></ProtectedRoute>} />
            <Route path="/empleados" element={<ProtectedRoute><Empleados /></ProtectedRoute>} />
            <Route path="/tiendas" element={<ProtectedRoute><Tiendas /></ProtectedRoute>} />
            <Route path="/almacenes" element={<ProtectedRoute><Almacenes /></ProtectedRoute>} />
            <Route path="/configuracion" element={<ProtectedRoute><Configuracion /></ProtectedRoute>} />
            <Route path="/roles" element={<ProtectedRoute><RolesPermisos /></ProtectedRoute>} />
            <Route path="/turnos" element={<ProtectedRoute><Turnos /></ProtectedRoute>} />
            <Route path="/superadmin" element={<ProtectedRoute><SuperAdmin /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
