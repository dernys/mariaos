import { ReactNode } from "react";
import { usePermissions, PermissionAction } from "@/hooks/usePermissions";

interface PermissionGateProps {
  module: string;
  action?: PermissionAction;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Renders children only when the signed-in user's role matrix allows
 * the given action on the given module.
 */
export function PermissionGate({ module, action = "view", children, fallback = null }: PermissionGateProps) {
  const { can, loading } = usePermissions();
  if (loading) return null;
  return can(module, action) ? <>{children}</> : <>{fallback}</>;
}
