import { AppLayout } from "@/components/AppLayout";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  Plus,
  Users,
  Settings,
  ToggleLeft,
  ToggleRight,
  Trash2,
  UserPlus,
  X,
  Search,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSuperadmin } from "@/hooks/useSuperadmin";
import { Navigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type Tenant = Tables<"tenants">;

interface TenantUser {
  id: string;
  user_id: string;
  tenant_id: string;
  is_owner: boolean;
  created_at: string;
  profile?: { full_name: string | null; user_id: string } | null;
}

const SuperAdmin = () => {
  const { isSuperadmin, loading: saLoading } = useSuperadmin();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [searchUsers, setSearchUsers] = useState("");
  const [allProfiles, setAllProfiles] = useState<{ user_id: string; full_name: string | null }[]>([]);
  const [showAddUser, setShowAddUser] = useState(false);

  // Create form
  const [form, setForm] = useState({
    name: "",
    slug: "",
    email: "",
    phone: "",
    address: "",
    rfc: "",
    business_type: "empresa",
  });

  useEffect(() => {
    if (isSuperadmin) fetchTenants();
  }, [isSuperadmin]);

  const fetchTenants = async () => {
    const { data } = await supabase
      .from("tenants")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setTenants(data);
    setLoading(false);
  };

  const createTenant = async () => {
    if (!form.name || !form.slug) return toast.error("Nombre y slug son requeridos");
    const { error } = await supabase.from("tenants").insert({
      name: form.name,
      slug: form.slug.toLowerCase().replace(/\s+/g, "-"),
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      rfc: form.rfc || null,
      business_type: form.business_type,
    } as any);
    if (error) return toast.error(error.message);
    toast.success("Empresa creada correctamente");
    setShowCreate(false);
    setForm({ name: "", slug: "", email: "", phone: "", address: "", rfc: "", business_type: "empresa" });
    fetchTenants();
  };

  const toggleTenant = async (tenant: Tenant) => {
    const { error } = await supabase
      .from("tenants")
      .update({ is_active: !tenant.is_active })
      .eq("id", tenant.id);
    if (error) return toast.error(error.message);
    toast.success(tenant.is_active ? "Empresa desactivada" : "Empresa activada");
    fetchTenants();
    if (selectedTenant?.id === tenant.id)
      setSelectedTenant({ ...tenant, is_active: !tenant.is_active });
  };

  const deleteTenant = async (id: string) => {
    const { error } = await supabase.from("tenants").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Empresa eliminada");
    if (selectedTenant?.id === id) setSelectedTenant(null);
    fetchTenants();
  };

  const selectTenant = async (tenant: Tenant) => {
    setSelectedTenant(tenant);
    // Fetch tenant users with profiles
    const { data } = await supabase
      .from("tenant_users")
      .select("*, profile:profiles!tenant_users_user_id_fkey(full_name, user_id)")
      .eq("tenant_id", tenant.id);
    
    // If join fails, fetch separately
    if (!data) {
      const { data: tusers } = await supabase
        .from("tenant_users")
        .select("*")
        .eq("tenant_id", tenant.id);
      setTenantUsers((tusers ?? []) as TenantUser[]);
    } else {
      setTenantUsers(data as unknown as TenantUser[]);
    }

    // Fetch all profiles for adding users
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name");
    setAllProfiles(profiles ?? []);
  };

  const addUserToTenant = async (userId: string) => {
    if (!selectedTenant) return;
    const { error } = await supabase.from("tenant_users").insert({
      tenant_id: selectedTenant.id,
      user_id: userId,
    });
    if (error) return toast.error(error.message);
    toast.success("Usuario agregado a la empresa");
    setShowAddUser(false);
    selectTenant(selectedTenant);
  };

  const removeUserFromTenant = async (id: string) => {
    const { error } = await supabase.from("tenant_users").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Usuario removido");
    if (selectedTenant) selectTenant(selectedTenant);
  };

  const toggleOwner = async (tu: TenantUser) => {
    const { error } = await supabase
      .from("tenant_users")
      .update({ is_owner: !tu.is_owner })
      .eq("id", tu.id);
    if (error) return toast.error(error.message);
    if (selectedTenant) selectTenant(selectedTenant);
  };

  if (saLoading) {
    return (
      <AppLayout title="Super Admin">
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!isSuperadmin) {
    return <Navigate to="/" replace />;
  }

  const availableUsers = allProfiles.filter(
    (p) =>
      !tenantUsers.some((tu) => tu.user_id === p.user_id) &&
      (p.full_name?.toLowerCase().includes(searchUsers.toLowerCase()) ?? true)
  );

  return (
    <AppLayout title="Super Admin">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-heading font-semibold text-sm">Gestión de Empresas (Tenants)</h2>
              <p className="text-[10px] text-muted-foreground">
                {tenants.length} empresa(s) registrada(s)
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setShowCreate(!showCreate)}
            className="gap-1 text-xs gradient-brand text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Nueva Empresa
          </Button>
        </div>

        {/* Create Form */}
        <AnimatePresence>
          {showCreate && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-card rounded-xl p-5 shadow-card border space-y-4">
                <h3 className="font-heading font-semibold text-sm">Crear Nueva Empresa</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium mb-1 block">Nombre *</label>
                    <Input
                      placeholder="Mi Empresa S.A."
                      value={form.name}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          name: e.target.value,
                          slug: form.slug || e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">Slug (URL) *</label>
                    <Input
                      placeholder="mi-empresa"
                      value={form.slug}
                      onChange={(e) => setForm({ ...form, slug: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">Email</label>
                    <Input
                      type="email"
                      placeholder="contacto@empresa.com"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">Teléfono</label>
                    <Input
                      placeholder="+52 55 1234 5678"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">RFC</label>
                    <Input
                      placeholder="XAXX010101000"
                      value={form.rfc}
                      onChange={(e) => setForm({ ...form, rfc: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">Dirección</label>
                    <Input
                      placeholder="Av. Reforma 250, CDMX"
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">Tipo de Negocio *</label>
                    <select
                      value={form.business_type}
                      onChange={(e) => setForm({ ...form, business_type: e.target.value })}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="empresa">Empresa / Tienda</option>
                      <option value="bar">Bar</option>
                      <option value="restaurant">Restaurante</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={createTenant}
                    className="gradient-brand text-primary-foreground font-heading font-semibold"
                  >
                    Crear Empresa
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Tenants List */}
          <div className="lg:col-span-1 space-y-3">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : tenants.length === 0 ? (
              <div className="bg-card rounded-xl p-8 shadow-card border text-center">
                <Building2 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No hay empresas</p>
              </div>
            ) : (
              tenants.map((tenant) => (
                <motion.div
                  key={tenant.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => selectTenant(tenant)}
                  className={`bg-card rounded-xl p-4 shadow-card border cursor-pointer transition-all hover:shadow-elevated ${
                    selectedTenant?.id === tenant.id ? "ring-2 ring-primary/30" : ""
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-heading font-semibold text-sm">{tenant.name}</h3>
                        <div className="flex items-center gap-1.5">
                          <p className="text-[10px] text-muted-foreground">/{tenant.slug}</p>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted font-medium capitalize">{(tenant as any).business_type || "empresa"}</span>
                        </div>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        tenant.is_active
                          ? "bg-success/10 text-success"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {tenant.is_active ? "Activa" : "Inactiva"}
                    </span>
                  </div>
                  {tenant.email && (
                    <p className="text-[10px] text-muted-foreground mt-2">{tenant.email}</p>
                  )}
                  <div className="flex gap-1 mt-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTenant(tenant);
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors"
                    >
                      {tenant.is_active ? (
                        <ToggleRight className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <ToggleLeft className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteTenant(tenant.id);
                      }}
                      className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 px-2 py-1 rounded hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </div>

          {/* Tenant Detail */}
          <div className="lg:col-span-2">
            {selectedTenant ? (
              <motion.div
                key={selectedTenant.id}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-4"
              >
                {/* Tenant Info */}
                <div className="bg-card rounded-xl p-5 shadow-card border">
                  <h3 className="font-heading font-semibold text-sm mb-3">
                    Detalles de {selectedTenant.name}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <p className="text-muted-foreground">Email</p>
                      <p className="font-medium">{selectedTenant.email || "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Teléfono</p>
                      <p className="font-medium">{selectedTenant.phone || "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">RFC</p>
                      <p className="font-medium">{selectedTenant.rfc || "—"}</p>
                    </div>
                    <div className="col-span-2 sm:col-span-3">
                      <p className="text-muted-foreground">Dirección</p>
                      <p className="font-medium">{selectedTenant.address || "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Creada</p>
                      <p className="font-medium">
                        {format(new Date(selectedTenant.created_at), "dd MMM yyyy", { locale: es })}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Tenant Users */}
                <div className="bg-card rounded-xl shadow-card border overflow-hidden">
                  <div className="p-4 border-b flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-heading font-semibold text-sm">
                        Usuarios ({tenantUsers.length})
                      </h3>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowAddUser(!showAddUser)}
                      className="gap-1 text-xs"
                    >
                      <UserPlus className="h-3.5 w-3.5" /> Agregar
                    </Button>
                  </div>

                  {/* Add User Dropdown */}
                  <AnimatePresence>
                    {showAddUser && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: "auto" }}
                        exit={{ height: 0 }}
                        className="overflow-hidden border-b"
                      >
                        <div className="p-4 bg-muted/20 space-y-2">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              placeholder="Buscar usuario..."
                              value={searchUsers}
                              onChange={(e) => setSearchUsers(e.target.value)}
                              className="pl-9 h-8 text-xs"
                            />
                          </div>
                          <div className="max-h-32 overflow-auto space-y-1">
                            {availableUsers.length === 0 ? (
                              <p className="text-[10px] text-muted-foreground text-center py-2">
                                No hay usuarios disponibles
                              </p>
                            ) : (
                              availableUsers.map((p) => (
                                <button
                                  key={p.user_id}
                                  onClick={() => addUserToTenant(p.user_id)}
                                  className="w-full text-left px-3 py-1.5 rounded text-xs hover:bg-muted transition-colors"
                                >
                                  {p.full_name || "Sin nombre"}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div>
                    {tenantUsers.length === 0 ? (
                      <div className="p-8 text-center">
                        <Users className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">
                          Sin usuarios asignados
                        </p>
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="text-left p-3 font-medium text-muted-foreground text-xs">
                              Usuario
                            </th>
                            <th className="text-left p-3 font-medium text-muted-foreground text-xs">
                              Propietario
                            </th>
                            <th className="text-left p-3 font-medium text-muted-foreground text-xs">
                              Agregado
                            </th>
                            <th className="text-right p-3 font-medium text-muted-foreground text-xs">
                              Acciones
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {tenantUsers.map((tu) => (
                            <tr
                              key={tu.id}
                              className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                            >
                              <td className="p-3 text-xs font-medium">
                                {(tu.profile as any)?.full_name || tu.user_id.slice(0, 8)}
                              </td>
                              <td className="p-3">
                                <button
                                  onClick={() => toggleOwner(tu)}
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                                    tu.is_owner
                                      ? "bg-primary/10 text-primary"
                                      : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {tu.is_owner ? "Sí" : "No"}
                                </button>
                              </td>
                              <td className="p-3 text-xs text-muted-foreground">
                                {format(new Date(tu.created_at), "dd/MM/yy")}
                              </td>
                              <td className="p-3 text-right">
                                <button
                                  onClick={() => removeUserFromTenant(tu.id)}
                                  className="text-muted-foreground hover:text-destructive transition-colors p-1"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="bg-card rounded-xl p-12 shadow-card border text-center">
                <Building2 className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Selecciona una empresa para ver detalles
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default SuperAdmin;
