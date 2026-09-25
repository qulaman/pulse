/* Pulse service worker: push notifications (D-114) and, in a production build, the app kept on
   the phone for offline (D-127) — the build's files and the last screens opened. */

// A production build registers /sw.js?offline=1 (lib/offline/worker.ts); in development the code
// changes under the same file names, and a kept copy would hide every edit — no caching there.
const OFFLINE = new URL(self.location.href).searchParams.has("offline");
const STATIC_CACHE = "pulse-static-v1";
const PAGES_CACHE = "pulse-pages-v1";
const KEPT = [STATIC_CACHE, PAGES_CACHE];
/** The build's files are named by their content, so a kept one is never stale; builds pile up — capped. */
const STATIC_MAX = 600;
/** The last screens opened, one copy per address. */
const PAGES_MAX = 60;
/** A network slower than this, with a kept copy of the screen at hand, reads as no network. */
const PAGE_SLOW_MS = 5000;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      // an older version's caches — or every cache, once a development worker takes over
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith("pulse-") && !(OFFLINE && KEPT.includes(name))).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  ),
);

/** Oldest first out: `keys()` lists entries in the order they were last put. */
async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i += 1) await cache.delete(keys[i]);
}

function isBuildFile(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/favicon.ico";
}

/** Screens worth keeping: the app's own pages — not the API, not the sign-in, not the sandboxes. */
function isKeptScreen(url) {
  return !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/dev") && url.pathname !== "/login";
}

async function buildFile(request) {
  const cache = await caches.open(STATIC_CACHE);
  const kept = await cache.match(request);
  if (kept) return kept;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
    void trim(STATIC_CACHE, STATIC_MAX);
  }
  return response;
}

/** A screen from the network, kept as it passes; without network — the kept copy, or «Нет связи». */
async function screen(request, url) {
  const cache = await caches.open(PAGES_CACHE);
  const key = url.pathname + url.search;
  const network = fetch(request).then((response) => {
    const html = (response.headers.get("content-type") || "").includes("text/html");
    // a redirect (no session, another role) is followed, never kept
    if (response.ok && response.type === "basic" && html) {
      void cache
        .put(key, response.clone())
        .then(() => trim(PAGES_CACHE, PAGES_MAX))
        .catch(() => undefined);
    }
    return response;
  });
  network.catch(() => undefined);
  try {
    const first = await Promise.race([network, new Promise((resolve) => setTimeout(() => resolve(null), PAGE_SLOW_MS))]);
    if (first) return first;
    // slow: the kept copy now if there is one, the network's answer otherwise
    return (await cache.match(key)) || (await network);
  } catch {
    return (await cache.match(key)) || offlinePage();
  }
}

/** A screen never opened here, and no network: said plainly, in the app's colours. */
function offlinePage() {
  const html =
    '<!doctype html><html lang="ru"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<meta name="theme-color" content="#0B0F14"><title>Pulse</title><style>' +
    "html,body{margin:0;height:100%;background:#0B0F14;color:#EEF3F8;font:16px/22px system-ui,-apple-system,sans-serif}" +
    "main{box-sizing:border-box;min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center}" +
    "h1{margin:0 0 8px;font-size:22px;line-height:28px}p{margin:0;max-width:320px;color:#93A2B4}" +
    "button{margin-top:22px;min-height:48px;border:0;border-radius:14px;padding:0 22px;font:600 16px/20px system-ui,sans-serif;background:#2ED3B7;color:#0B0F14}" +
    "</style></head><body><main><h1>Нет связи</h1>" +
    "<p>Этот экран ещё не открывался на телефоне. Он откроется, как только появится связь; открытые раньше — работают и так.</p>" +
    '<button type="button" onclick="location.reload()">Повторить</button></main></body></html>';
  return new Response(html, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
}

self.addEventListener("fetch", (event) => {
  if (!OFFLINE) return;
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isBuildFile(url)) event.respondWith(buildFile(request));
  else if (request.mode === "navigate" && isKeptScreen(url)) event.respondWith(screen(request, url));
});

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
  const at = data.at ? Date.parse(data.at) : NaN;
  const options = {
    body: data.body || "",
    lang: "ru",
    icon: "/icons/icon-192.png",
    // the status bar and the shade header draw only the alpha of the badge (Android): the
    // colour app icon came out as a blank white square there, so the badge is the bare
    // pulse line on transparency (D-125)
    badge: "/icons/badge-96.png",
    // when it happened, not when the worker got to it (a word held for the morning window)
    timestamp: Number.isNaN(at) ? undefined : at,
    // one bubble per task: a newer word replaces the older one instead of stacking
    tag: data.tag || data.delivery_id || undefined,
    renotify: Boolean(data.tag) && !data.silent,
    // «тихо» (the fixed policy for good news, the director's own choice): no sound, no buzz —
    // Android and desktop; iPhone plays what the phone decides
    silent: Boolean(data.silent),
    data: {
      url: data.url || "/",
      delivery_id: data.delivery_id || null,
      kind: data.kind || null,
      task_id: data.task_id || null,
    },
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
  // a new task is taken from the shade with one tap (D-125) — «Уточнить» and «Не могу» need
  // words, so they stay on the card behind «Открыть»
  if (data.kind === "task_sent" && data.task_id) {
    options.actions = [
      { action: "accept", title: "Принял" },
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

/** The app on `url`: an open window is brought forward, otherwise a new one. */
function openApp(url) {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const client of list) {
      if ("focus" in client) {
        client.navigate(url);
        return client.focus();
      }
    }
    return self.clients.openWindow(url);
  });
}

/**
 * «Принял» from the shade (D-125): the same door as the card's button — the transition with its
 * own client_request_id, the «принял» receipt follows on the server. Anything but a clean yes
 * (the task was revoked meanwhile, the session is gone, no network) opens the task instead,
 * so the person sees why it did not go. Resolves to whether the task was taken.
 */
function acceptFromShade(info) {
  return fetch("/api/tasks/" + info.task_id + "/transition", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ to_status: "accepted", client_request_id: self.crypto.randomUUID() }),
  })
    .then((res) => res.ok)
    .catch(() => false)
    .then((ok) => (ok ? refreshBadge() : openApp(info.url || "/tasks/" + info.task_id)).then(() => ok));
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const info = event.notification.data || {};
  const url = info.url || "/";
  if (event.action === "accept" && info.task_id) {
    event.waitUntil(acceptFromShade(info));
    return;
  }
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
  event.waitUntil(openApp(url));
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
// reload — a no-op while install skips waiting. At sign-in and sign-out the kept screens go:
// they were one person's (D-127); the build's files stay, they are nobody's.
self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (msg.type === "offline-wipe") {
    event.waitUntil(caches.delete(PAGES_CACHE));
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
