import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, Trash2, ShieldPlus, ShieldMinus } from "lucide-react";
import { motion } from "framer-motion";
import type { Database } from "@/integrations/supabase/types";
import { Constants } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface UserItem {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string;
  roles: AppRole[];
  created_at: string;
}

const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  supervisor: "Supervisor",
  contador: "Contador",
  cajero: "Cajero",
  inventarista: "Inventarista",
  empleado: "Empleado",
};

const ROLE_COLORS: Record<AppRole, string> = {
  admin: "bg-primary/10 text-primary border-primary/20",
  gerente: "bg-info/10 text-info border-info/20",
  supervisor: "bg-warning/10 text-warning border-warning/20",
  contador: "bg-accent/10 text-accent-foreground border-accent/20",
  cajero: "bg-success/10 text-success border-success/20",
  inventarista: "bg-muted text-muted-foreground border-muted",
  empleado: "bg-secondary text-secondary-foreground border-secondary",
};


export function UsersTab() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("cajero");
  const [creating, setCreating] = useState(false);
  const [canManage, setCanManage] = useState(false);

  const fetchUsers = async () => {
    const { data, error } = await supabase.functions.invoke("manage-users", {
      body: { action: "list" },
    });
    if (error) {
      toast.error("Error cargando usuarios");
    } else {
      setUsers(data.users ?? []);
      setCanManage(!!data.can_manage);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("manage-users", {
      body: {
        action: "create",
        email: newEmail,
        password: newPassword,
        full_name: newName,
        role: newRole,
      },
    });
    if (error || data?.error) {
      toast.error(data?.error || "Error al crear usuario");
    } else {
      toast.success("Usuario creado exitosamente");
      setCreateOpen(false);
      setNewEmail("");
      setNewPassword("");
      setNewName("");
      setNewRole("cajero");
      await fetchUsers();
    }
    setCreating(false);
  };

  const handleToggleRole = async (userId: string, role: AppRole, hasRole: boolean) => {
    const { data, error } = await supabase.functions.invoke("manage-users", {
      body: { action: "update_role", user_id: userId, role, remove: hasRole },
    });
    if (error || data?.error) {
      toast.error(data?.error || "Error actualizando rol");
    } else {
      toast.success(hasRole ? "Rol removido" : "Rol asignado");
      await fetchUsers();
    }
  };

  const handleDelete = async (userId: string, name: string) => {
    if (!confirm(`¿Estás seguro de eliminar a "${name}"? Esta acción no se puede deshacer.`)) return;
    const { data, error } = await supabase.functions.invoke("manage-users", {
      body: { action: "delete", user_id: userId },
    });
    if (error || data?.error) {
      toast.error(data?.error || "Error eliminando usuario");
    } else {
      toast.success("Usuario eliminado");
      await fetchUsers();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {users.length} usuario{users.length !== 1 ? "s" : ""} registrado{users.length !== 1 ? "s" : ""}
        </p>
        {canManage && (
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2 gradient-brand text-primary-foreground font-heading font-semibold">
              <UserPlus className="h-4 w-4" />
              Nuevo Usuario
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-heading">Crear Usuario</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nombre completo</label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Correo electrónico</label>
                <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Contraseña</label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Rol inicial</label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Constants.public.Enums.app_role.map((r) => (
                      <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={creating} className="w-full gradient-brand text-primary-foreground font-heading font-semibold">
                {creating ? "Creando..." : "Crear Usuario"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl shadow-card border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium text-muted-foreground text-xs">Usuario</th>
                <th className="text-left p-3 font-medium text-muted-foreground text-xs">Correo</th>
                <th className="text-left p-3 font-medium text-muted-foreground text-xs">Roles</th>
                <th className="text-center p-3 font-medium text-muted-foreground text-xs w-24">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="p-3">
                    <p className="text-xs font-medium">{u.full_name ?? "Sin nombre"}</p>
                  </td>
                  <td className="p-3">
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1 flex-wrap items-center">
                      {u.roles.length === 0 && (
                        <span className="text-[10px] text-muted-foreground">Sin rol</span>
                      )}
                      {u.roles.map((r) => (
                        <Badge
                          key={r}
                          variant="outline"
                          className={`text-[10px] cursor-pointer ${ROLE_COLORS[r]}`}
                          onClick={() => canManage && handleToggleRole(u.user_id, r, true)}
                          title={canManage ? "Click para remover" : ROLE_LABELS[r]}
                        >
                          {ROLE_LABELS[r]}{canManage && <ShieldMinus className="h-2.5 w-2.5 ml-1" />}
                        </Badge>
                      ))}
                      {/* Add role dropdown */}
                      {canManage && Constants.public.Enums.app_role.filter((r) => !u.roles.includes(r)).length > 0 && (
                        <Select onValueChange={(v) => handleToggleRole(u.user_id, v as AppRole, false)}>
                          <SelectTrigger className="h-6 w-6 p-0 border-dashed border-muted-foreground/30">
                            <ShieldPlus className="h-3 w-3 text-muted-foreground" />
                          </SelectTrigger>
                          <SelectContent>
                            {Constants.public.Enums.app_role
                              .filter((r) => !u.roles.includes(r))
                              .map((r) => (
                                <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(u.user_id, u.full_name ?? u.email)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
