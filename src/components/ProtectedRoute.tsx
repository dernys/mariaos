import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useSuperadmin } from "@/hooks/useSuperadmin";
import { Navigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
  </div>
);

function Forbidden() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="h-14 w-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <ShieldAlert className="h-7 w-7 text-destructive" />
      </div>
      <div className="space-y-1">
        <h1 className="font-heading text-xl font-bold">Acceso restringido</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          Tu rol no tiene permiso para ver este módulo. Contacta al administrador si necesitas acceso.
        </p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to="/app">Volver al inicio</Link>
      </Button>
    </div>
  );
}

export function ProtectedRoute({
  children,
  module,
  action = "view",
  superadminOnly = false,
}: {
  children: React.ReactNode;
  /** app_modules.slug governing access to this route */
  module?: string;
  /** Minimum action required on the module (default: view) */
  action?: "view" | "create" | "edit" | "delete";
  /** Route reserved for platform superadmins */
  superadminOnly?: boolean;
}) {
  const { session, loading } = useAuth();
  const { can, loading: permsLoading } = usePermissions();
  const { isSuperadmin, loading: saLoading } = useSuperadmin();

  if (loading) return <Spinner />;
  if (!session) return <Navigate to="/auth" replace />;
  if (superadminOnly) {
    if (saLoading) return <Spinner />;
    if (!isSuperadmin) return <Forbidden />;
  }
  if (module) {
    if (permsLoading) return <Spinner />;
    if (!can(module, action)) return <Forbidden />;
  }

  return <>{children}</>;
}
