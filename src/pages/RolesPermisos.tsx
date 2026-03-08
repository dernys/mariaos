import { AppLayout } from "@/components/AppLayout";
import { motion } from "framer-motion";
import { Shield, Check, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface Module {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
}

interface Permission {
  id?: string;
  role: AppRole;
  module_id: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

const ROLES: { value: AppRole; label: string; color: string }[] = [
  { value: "admin", label: "Administrador", color: "bg-primary text-primary-foreground" },
  { value: "gerente", label: "Gerente", color: "bg-info text-info-foreground" },
  { value: "supervisor", label: "Supervisor", color: "bg-warning text-warning-foreground" },
  { value: "cajero", label: "Cajero", color: "bg-success text-success-foreground" },
  { value: "inventarista", label: "Inventarista", color: "bg-muted text-muted-foreground" },
];

const PERMISSION_KEYS = ["can_view", "can_create", "can_edit", "can_delete"] as const;
const PERMISSION_LABELS: Record<string, string> = {
  can_view: "Ver",
  can_create: "Crear",
  can_edit: "Editar",
  can_delete: "Eliminar",
};

const RolesPermisos = () => {
  const [modules, setModules] = useState<Module[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedRole, setSelectedRole] = useState<AppRole>("admin");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [modulesRes, permsRes] = await Promise.all([
      supabase.from("app_modules").select("*").order("created_at"),
      supabase.from("role_permissions").select("*"),
    ]);
    if (modulesRes.data) setModules(modulesRes.data);
    if (permsRes.data) setPermissions(permsRes.data as Permission[]);
    setLoading(false);
  };

  const getPermission = (moduleId: string): Permission => {
    const found = permissions.find(
      (p) => p.role === selectedRole && p.module_id === moduleId
    );
    return (
      found ?? {
        role: selectedRole,
        module_id: moduleId,
        can_view: false,
        can_create: false,
        can_edit: false,
        can_delete: false,
      }
    );
  };

  const togglePermission = (moduleId: string, key: typeof PERMISSION_KEYS[number]) => {
    setPermissions((prev) => {
      const idx = prev.findIndex(
        (p) => p.role === selectedRole && p.module_id === moduleId
      );
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], [key]: !updated[idx][key as keyof Permission] };
        return updated;
      }
      return [
        ...prev,
        {
          role: selectedRole,
          module_id: moduleId,
          can_view: key === "can_view",
          can_create: key === "can_create",
          can_edit: key === "can_edit",
          can_delete: key === "can_delete",
        },
      ];
    });
  };

  const savePermissions = async () => {
    setSaving(true);
    const rolePerms = permissions.filter((p) => p.role === selectedRole);

    for (const perm of rolePerms) {
      const { id, ...data } = perm;
      if (id) {
        await supabase.from("role_permissions").update(data).eq("id", id);
      } else {
        await supabase.from("role_permissions").upsert(data, {
          onConflict: "role,module_id",
        });
      }
    }

    toast.success("Permisos guardados correctamente");
    await fetchData();
    setSaving(false);
  };

  if (loading) {
    return (
      <AppLayout title="Roles y Permisos">
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Roles y Permisos">
      <div className="space-y-4">
        {/* Role Selector */}
        <div className="flex items-center gap-3 flex-wrap">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <div className="flex gap-2 flex-wrap">
            {ROLES.map((role) => (
              <button
                key={role.value}
                onClick={() => setSelectedRole(role.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  selectedRole === role.value
                    ? role.color + " shadow-card"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {role.label}
              </button>
            ))}
          </div>
        </div>

        {/* Permissions Matrix */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl shadow-card border overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs w-48">
                    Módulo
                  </th>
                  {PERMISSION_KEYS.map((key) => (
                    <th
                      key={key}
                      className="text-center p-3 font-medium text-muted-foreground text-xs w-24"
                    >
                      {PERMISSION_LABELS[key]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modules.map((mod) => {
                  const perm = getPermission(mod.id);
                  return (
                    <tr
                      key={mod.id}
                      className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      <td className="p-3">
                        <div>
                          <p className="text-xs font-medium">{mod.name}</p>
                          <p className="text-[10px] text-muted-foreground">/{mod.slug}</p>
                        </div>
                      </td>
                      {PERMISSION_KEYS.map((key) => (
                        <td key={key} className="p-3 text-center">
                          <button
                            onClick={() => togglePermission(mod.id, key)}
                            className={`inline-flex items-center justify-center h-7 w-7 rounded-md transition-all ${
                              perm[key]
                                ? "bg-primary/10 text-primary hover:bg-primary/20"
                                : "bg-muted text-muted-foreground/40 hover:bg-muted/80"
                            }`}
                          >
                            {perm[key] ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <X className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>

        <div className="flex justify-end">
          <Button
            onClick={savePermissions}
            disabled={saving}
            className="gap-2 gradient-brand text-primary-foreground font-heading font-semibold"
          >
            <Save className="h-4 w-4" />
            {saving ? "Guardando..." : "Guardar Permisos"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
};

export default RolesPermisos;
