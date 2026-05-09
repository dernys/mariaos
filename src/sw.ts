/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// HTML navigations (skip OAuth + auth)
registerRoute(
  new NavigationRoute(new NetworkFirst({ cacheName: "html", networkTimeoutSeconds: 3 }), {
    denylist: [/^\/~oauth/, /^\/auth/],
  })
);

// Static assets
registerRoute(
  ({ request }) => ["style", "script", "worker"].includes(request.destination),
  new StaleWhileRevalidate({ cacheName: "assets" })
);

// Images
registerRoute(
  ({ request }) => request.destination === "image",
  new CacheFirst({
    cacheName: "images",
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  })
);

// Push notification handler (server-side push, optional)
self.addEventListener("push", (event) => {
  let payload: { title?: string; body?: string; url?: string; tag?: string; icon?: string } = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { title: "GaIA OS", body: event.data?.text() };
  }
  const title = payload.title || "GaIA OS";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body,
      icon: payload.icon || "/pwa-192.png",
      badge: "/pwa-192.png",
      tag: payload.tag,
      data: { url: payload.url || "/app" },
    })
  );
});

// Notification click → focus or open the linked URL
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as any)?.url || "/app";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin) {
          await client.focus();
          // @ts-ignore
          if ("navigate" in client) await (client as any).navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
