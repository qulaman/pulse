/* Pulse service worker: push notifications only (offline cache comes with serwist, D-40). */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Pulse";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.delivery_id || undefined,
    renotify: false,
    data: { url: data.url || "/", delivery_id: data.delivery_id || null },
    vibrate: [80, 40, 80],
  };
  const shown = self.registration.showNotification(title, options);
  // «увидел»: the notification is on the screen (D-32)
  const ack = data.delivery_id
    ? fetch("/api/push/seen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ delivery_id: data.delivery_id }),
      }).catch(() => undefined)
    : Promise.resolve();
  event.waitUntil(Promise.all([shown, ack]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
