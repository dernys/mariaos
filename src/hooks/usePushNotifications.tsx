import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "push-notifications-enabled";

export function usePushNotifications() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setSupported(true);
    setPermission(Notification.permission);
    setEnabled(localStorage.getItem(STORAGE_KEY) === "1" && Notification.permission === "granted");
  }, []);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) return false;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      localStorage.setItem(STORAGE_KEY, "1");
      setEnabled(true);
      return true;
    }
    return false;
  }, []);

  const disable = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "0");
    setEnabled(false);
  }, []);

  const showNotification = useCallback(
    async (title: string, options?: NotificationOptions & { url?: string }) => {
      if (!enabled || permission !== "granted") return;
      // If page is visible, skip (toast handles it)
      if (typeof document !== "undefined" && document.visibilityState === "visible") return;
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        const opts: NotificationOptions = {
          body: options?.body,
          icon: "/pwa-192.png",
          badge: "/pwa-192.png",
          tag: options?.tag,
          data: { url: options?.url || "/app" },
          ...options,
        };
        if (reg) {
          await reg.showNotification(title, opts);
        } else {
          new Notification(title, opts);
        }
      } catch {
        // Silent fail
      }
    },
    [enabled, permission]
  );

  return { supported, permission, enabled, requestPermission, disable, showNotification };
}
