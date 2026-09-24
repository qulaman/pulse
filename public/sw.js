/* Pulse service worker: push notifications only (offline cache comes with serwist, D-40). */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/** The number on the icon (D-114): what waits for this person's hand, asked after each push. */
function refreshBadge() {
  if (!("setAppBadge" in self.navigator)) return Promise.resolve();
  return fetch("/api/push/badge", { credentials: "include" })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data) return undefined;
      return data.count > 0 ? self.navigator.setAppBadge(data.count) : self.navigator.clearAppBadge();
    })
    .catch(() => undefined);
}

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
    renotify: Boolean(data.tag) && !data.silent,
    // «тихо» (the fixed policy for good news, the director's own choice): no sound, no buzz —
    // Android and desktop; iPhone plays what the phone decides
    silent: Boolean(data.silent),
    data: { url: data.url || "/", delivery_id: data.delivery_id || null, kind: data.kind || null },
    vibrate: data.silent ? undefined : [80, 40, 80],
  };
  // an alarm («вызови охрану», D-99) stays on the screen until it is touched and shakes the
  // phone long enough to be felt through a pocket
  if (data.urgent) {
    options.requireInteraction = true;
    options.renotify = true;
    options.silent = false;
    options.tag = options.tag || "errand-alarm";
    options.vibrate = [400, 150, 400, 150, 400, 150, 800];
  }
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
  event.waitUntil(Promise.all([shown, ack, refreshBadge()]));
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
      })
        .then(() => refreshBadge())
        .catch(() => undefined),
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

// The browser renewed (or the push service dropped) the subscription: register the new one at
// once, so the person keeps getting pushes without opening the app (D-114).
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription || null;
      let sub = event.newSubscription || null;
      if (!sub && old && old.options && old.options.applicationServerKey) {
        sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: old.options.applicationServerKey,
        });
      }
      if (!sub) return;
      const json = sub.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          user_agent: self.navigator.userAgent.slice(0, 300),
          replaces: old ? old.endpoint : undefined,
        }),
      });
    })().catch(() => undefined),
  );
});

// The app opened a task (or the person read it there): its bubbles leave the shade.
// «Обновить» (D-115, lib/update/client.ts): a worker left waiting takes over before the
// reload — a no-op while install skips waiting, the contract once an offline cache makes it wait.
self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (msg.type === "clear" && msg.tag) {
    event.waitUntil(
      self.registration
        .getNotifications({ tag: msg.tag })
        .then((list) => list.forEach((n) => n.close()))
        .then(() => refreshBadge()),
    );
  }
});
