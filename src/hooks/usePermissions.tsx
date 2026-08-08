import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSuperadmin } from "@/hooks/useSuperadmin";

export type PermissionAction = "view" | "create" | "edit" | "delete";

export interface ModulePermission {
  slug: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

const FULL: Omit<ModulePermission, "slug"> = {
  can_view: true,
  can_create: true,
  can_edit: true,
  can_delete: true,
};
const NONE: Omit<ModulePermission, "slug"> = {
  can_view: false,
  can_create: false,
  can_edit: false,
  can_delete: false,
};

/**
 * Effective permissions of the signed-in user, resolved server-side
 * (union of all their roles) from role_permissions.
 */
export function usePermissions() {
  const { user, loading: authLoading, hasRole } = useAuth();
  const { isSuperadmin, loading: saLoading } = useSuperadmin();
  const isAdmin = hasRole("admin");


  const query = useQuery({
    queryKey: ["my-permissions", user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<string, ModulePermission>> => {
      const { data, error } = await supabase.rpc("my_permissions");
      if (error) throw error;
      const map: Record<string, ModulePermission> = {};
      (data ?? []).forEach((p) => {
        map[p.slug] = {
          slug: p.slug,
          can_view: !!p.can_view,
          can_create: !!p.can_create,
          can_edit: !!p.can_edit,
          can_delete: !!p.can_delete,
        };
      });
      return map;
    },
  });

  const loading = authLoading || saLoading || (!!user && query.isLoading);
  const permissions = query.data ?? {};
  const hasAnyPermission = Object.keys(permissions).length > 0;

  const get = (slug?: string): ModulePermission => {

    if (isSuperadmin || isAdmin) return { slug: slug ?? "*", ...FULL };
    if (!slug) return { slug: "*", ...FULL };
    // Sin matriz configurada: solo administradores tienen acceso implícito.
    if (!hasAnyPermission) return { slug, ...NONE };
    return permissions[slug] ?? { slug, ...NONE };
  };


  const can = (slug: string | undefined, action: PermissionAction = "view") => {
    const p = get(slug);
    return action === "view"
      ? p.can_view
      : action === "create"
      ? p.can_create
      : action === "edit"
      ? p.can_edit
      : p.can_delete;
  };

  return {
    loading,
    isSuperadmin,
    permissions,
    get,
    can,
    canView: (slug?: string) => can(slug, "view"),
    canCreate: (slug?: string) => can(slug, "create"),
    canEdit: (slug?: string) => can(slug, "edit"),
    canDelete: (slug?: string) => can(slug, "delete"),
    refetch: query.refetch,
  };
}
