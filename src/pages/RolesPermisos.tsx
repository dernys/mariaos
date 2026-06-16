import { AppLayout } from "@/components/AppLayout";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Shield, Boxes } from "lucide-react";
import { UsersTab } from "@/components/roles/UsersTab";
import { PermissionsTab } from "@/components/roles/PermissionsTab";
import { ModulesTab } from "@/components/roles/ModulesTab";

const RolesPermisos = () => {
  const { t } = useTranslation();
  return (
    <AppLayout title={t("nav.items.roles")}>
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="users" className="gap-2 text-xs">
            <Users className="h-3.5 w-3.5" />
            Usuarios
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-2 text-xs">
            <Shield className="h-3.5 w-3.5" />
            Permisos
          </TabsTrigger>
          <TabsTrigger value="modules" className="gap-2 text-xs">
            <Boxes className="h-3.5 w-3.5" />
            Módulos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="permissions">
          <PermissionsTab />
        </TabsContent>
        <TabsContent value="modules">
          <ModulesTab />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default RolesPermisos;
