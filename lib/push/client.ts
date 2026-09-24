"use client";

import { getPublicEnv } from "@/lib/env.public";

export type PushState = "unsupported" | "no_keys" | "denied" | "granted" | "default";

function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushState(): PushState {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (!getPublicEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY) return "no_keys";
  return Notification.permission as PushState;
}

export type PushPlatform = { platform: "ios" | "android" | "other"; standalone: boolean };

/** iPhone gets Web Push only from the home-screen app (iOS 16.4+): the words differ by platform. */
export function pushPlatform(): PushPlatform {
  if (typeof window === "undefined") return { platform: "other", standalone: false };
  const nav = window.navigator as Navigator & { standalone?: boolean };
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
  const ua = nav.userAgent;
  const platform = /iPhone|iPad|iPod/i.test(ua) ? "ios" : /Android/i.test(ua) ? "android" : "other";
  return { platform, standalone };
}

/** Register the worker (idempotent) so a push arrives even before the person ever tapped «Включить». */
export async function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (pushState() === "unsupported") return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

/** This browser's subscription — made when there is none and `create` is set. */
async function currentSubscription(create: boolean): Promise<PushSubscription | null> {
  // no worker (a failed registration) — `ready` would wait forever
  if (!(await registerWorker())) return null;
  // subscribe only through an ACTIVE worker: on the very first start the fresh registration is
  // still installing and `subscribe` fails («no active Service Worker») — found by smoke:push
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing || !create) return existing;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64ToUint8Array(getPublicEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY as string),
  });
}

async function tellServer(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, user_agent: navigator.userAgent.slice(0, 300) }),
  });
  if (!res.ok) throw new Error("subscribe failed");
}

/** Ask permission, subscribe, tell the server. Resolves to the resulting state. */
export async function enablePush(): Promise<PushState> {
  const state = pushState();
  if (state === "unsupported" || state === "no_keys") return state;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission as PushState;
  const subscription = await currentSubscription(true);
  if (!subscription) throw new Error("subscribe failed");
  await tellServer(subscription);
  return "granted";
}

const SYNC_KEY = "pulse.push.synced";
const SYNC_EVERY_MS = 6 * 3_600_000;

/**
 * The app is open and notifications are allowed: make sure the server still knows where to
 * push (D-114). A subscription the push service dropped (404/410) was deleted by the worker,
 * and the phone would stay silent forever without this. Cheap and idempotent; at most every
 * six hours per browser unless `force`.
 */
export async function syncPush(force = false): Promise<void> {
  if (pushState() !== "granted") return;
  try {
    const last = Number(window.localStorage.getItem(SYNC_KEY) ?? 0);
    if (!force && Date.now() - last < SYNC_EVERY_MS) return;
  } catch {
    // private mode: sync every time, it is one small request
  }
  try {
    const subscription = await currentSubscription(true);
    if (!subscription) return;
    await tellServer(subscription);
    try {
      window.localStorage.setItem(SYNC_KEY, String(Date.now()));
    } catch {
      // nothing to remember in private mode
    }
  } catch {
    // no network or the browser refused: the next start tries again
  }
}

/** Sign-out: this browser stops being this person's, before the session is gone. */
export async function forgetThisDevice(): Promise<void> {
  try {
    if (pushState() !== "granted") return;
    const subscription = await currentSubscription(false);
    if (!subscription) return;
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    window.localStorage.removeItem(SYNC_KEY);
  } catch {
    // the next person's sign-in re-registers the browser for themselves anyway
  }
}

let kickTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * A write that did not pass an API route (a message, the secretary's button, a meeting answer,
 * a shop order) asks the worker to send its push now, not on the minute sweep. Coalesced: a
 * burst of taps is one request.
 */
export function kickPush(): void {
  if (typeof window === "undefined") return;
  if (kickTimer) clearTimeout(kickTimer);
  kickTimer = setTimeout(() => {
    kickTimer = null;
    void fetch("/api/push/kick", { method: "POST", credentials: "include", keepalive: true }).catch(() => undefined);
  }, 250);
}

/** The person opened this task: its bubbles leave the shade (the service worker closes them). */
export function clearTaskNotifications(taskId: string): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.controller?.postMessage({ type: "clear", tag: `task:${taskId}` });
}

/** The number on the app icon, where the platform has one (iPhone home-screen app, desktop). */
export async function refreshAppBadge(): Promise<void> {
  const nav = typeof navigator === "undefined" ? null : (navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  });
  if (!nav?.setAppBadge) return;
  try {
    const res = await fetch("/api/push/badge", { credentials: "include" });
    if (!res.ok) return;
    const { count } = (await res.json()) as { count: number };
    if (count > 0) await nav.setAppBadge(count);
    else await nav.clearAppBadge?.();
  } catch {
    // a badge is a courtesy: offline it simply stays as it was
  }
}

/** The app is open: recent deliveries count as seen (D-32). Fire-and-forget. */
export function markSeen(): void {
  if (typeof window === "undefined") return;
  void fetch("/api/push/seen", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({}),
  }).catch(() => undefined);
}
