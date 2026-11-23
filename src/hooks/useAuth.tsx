import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: { full_name: string | null; avatar_url: string | null } | null;
  roles: AppRole[];
  loading: boolean;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<{ full_name: string | null; avatar_url: string | null } | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const loadedUserId = useRef<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        // Keep the same user object across token refreshes (tab refocus) so screens
        // that depend on the user don't reload their data or reset half-filled forms.
        setUser((prev) => (prev && session?.user && prev.id === session.user.id ? prev : session?.user ?? null));

        if (session?.user && loadedUserId.current === session.user.id) return;
        loadedUserId.current = session?.user?.id ?? null;

        if (session?.user) {
          // Fetch profile and roles with setTimeout to avoid deadlock
          setTimeout(async () => {
            const [profileRes, rolesRes] = await Promise.all([
              supabase
                .from("profiles")
                .select("full_name, avatar_url")
                .eq("user_id", session.user.id)
                .single(),
              supabase
                .from("user_roles")
                .select("role")
                .eq("user_id", session.user.id),
            ]);
            setProfile(profileRes.data);
            setRoles(rolesRes.data?.map((r) => r.role) ?? []);
            setLoading(false);
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    // Clear superadmin cache on logout
    if (user) sessionStorage.removeItem(`sa:${user.id}`);
    await supabase.auth.signOut();
  };

  const hasRole = (role: AppRole) => roles.includes(role);

  return (
    <AuthContext.Provider value={{ session, user, profile, roles, loading, signOut, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
