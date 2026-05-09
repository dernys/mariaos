import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { useAuth } from "./useAuth";
import { usePushNotifications } from "./usePushNotifications";

export interface Notification {
  id: string;
  tenant_id: string;
  category: string;
  severity: "info" | "success" | "warning" | "error";
  title: string;
  message: string | null;
  action_url: string | null;
  metadata: any;
  read_at: string | null;
  created_at: string;
}

export function useNotifications() {
  const tenantId = useTenant();
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const { showNotification } = usePushNotifications();
  const seenIds = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50);
    setItems((data as any) || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`notifications-${tenantId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const n = payload.new as Notification;
          if (!seenIds.current.has(n.id)) {
            seenIds.current.add(n.id);
            showNotification(n.title, {
              body: n.message || undefined,
              tag: n.id,
              url: n.action_url || "/app",
            });
          }
          load();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `tenant_id=eq.${tenantId}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications", filter: `tenant_id=eq.${tenantId}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, load, showNotification]);

  const unreadCount = items.filter((n) => !n.read_at).length;

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  };

  const markAllRead = async () => {
    if (!tenantId) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .is("read_at", null);
  };

  const remove = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
  };

  return { items, loading, unreadCount, markRead, markAllRead, remove, reload: load };
}
