import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { NotificationsBell } from "@/components/NotificationsBell";
import { CommandPalette, CommandPaletteTrigger } from "@/components/CommandPalette";
import { KeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { OfflineBanner } from "@/components/OfflineBanner";
import { useLocale } from "@/hooks/useLocale";
import { useNavigate } from "react-router-dom";
import { useTenantContext } from "@/hooks/useTenantContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { LogOut, Settings, ShieldCheck, User as UserIcon, Clock } from "lucide-react";

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function AppLayout({ children, title }: AppLayoutProps) {
  const { profile, user, roles, signOut } = useAuth();
  const { tenant } = useTenantContext();
  const nav = useNavigate();
  useGlobalShortcuts();
  useLocale();

  const initials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? "??";


  return (
    <SidebarProvider>
      <CommandPalette />
      <KeyboardShortcutsHelp />
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b bg-card px-4 shrink-0">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              {title && (
                <h1 className="font-heading text-lg font-semibold tracking-tight">
                  {title}
                </h1>
              )}
            </div>
            <div className="flex items-center gap-2">
              <OfflineBanner />
              <CommandPaletteTrigger />
              <NotificationsBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Menú de usuario"
                    className="h-8 w-8 rounded-full gradient-brand flex items-center justify-center text-primary-foreground text-xs font-bold font-heading ml-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {initials}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel className="space-y-1">
                    <p className="text-sm font-semibold leading-none">
                      {profile?.full_name || user?.email}
                    </p>
                    <p className="text-xs text-muted-foreground font-normal">{user?.email}</p>
                    {tenant && (
                      <p className="text-[11px] text-muted-foreground font-normal">{tenant.name}</p>
                    )}
                    {roles.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {roles.map((r) => (
                          <Badge key={r} variant="secondary" className="text-[10px] capitalize">
                            {r}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => nav("/portal-empleado")} className="gap-2 text-sm">
                    <UserIcon className="h-4 w-4" /> Mi perfil
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => nav("/turnos")} className="gap-2 text-sm">
                    <Clock className="h-4 w-4" /> Mis turnos
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => nav("/configuracion")} className="gap-2 text-sm">
                    <Settings className="h-4 w-4" /> Configuración
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => nav("/roles")} className="gap-2 text-sm">
                    <ShieldCheck className="h-4 w-4" /> Roles y permisos
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => {
                      await signOut();
                      nav("/auth");
                    }}
                    className="gap-2 text-sm text-destructive focus:text-destructive"
                  >
                    <LogOut className="h-4 w-4" /> Cerrar sesión
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
