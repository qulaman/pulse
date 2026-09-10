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

/** Register the worker (idempotent) so a push arrives even before the person ever tapped «Включить». */
export async function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (pushState() === "unsupported") return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

/** Ask permission, subscribe, tell the server. Resolves to the resulting state. */
export async function enablePush(): Promise<PushState> {
  const state = pushState();
  if (state === "unsupported" || state === "no_keys") return state;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission as PushState;

  const registration = (await registerWorker()) ?? (await navigator.serviceWorker.ready);
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ToUint8Array(getPublicEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY as string),
    }));

  const json = subscription.toJSON();
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, user_agent: navigator.userAgent.slice(0, 300) }),
  });
  if (!res.ok) throw new Error("subscribe failed");
  return "granted";
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
