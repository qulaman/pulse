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
    // one bubble per task: a newer word replaces the older one instead of stacking
    tag: data.tag || data.delivery_id || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || "/", delivery_id: data.delivery_id || null, kind: data.kind || null },
    vibrate: [80, 40, 80],
  };
  // a word in a thread can be answered from the shade: «Прочитал» moves the read cursor
  // and never opens the app (iOS shows no action buttons — the notification still works)
  if (data.kind === "message") {
    options.actions = [
      { action: "read", title: "Прочитал" },
      { action: "open", title: "Открыть" },
    ];
  }
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
  const info = event.notification.data || {};
  const url = info.url || "/";
  if (event.action === "read" && info.delivery_id) {
    // the cursor moves on the server; the app is not woken for it
    event.waitUntil(
      fetch("/api/push/acted", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ delivery_id: info.delivery_id }),
      }).catch(() => undefined),
    );
    return;
  }
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
