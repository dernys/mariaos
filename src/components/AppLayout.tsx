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
              <div className="h-8 w-8 rounded-full gradient-brand flex items-center justify-center text-primary-foreground text-xs font-bold font-heading ml-2">
                {initials}
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
