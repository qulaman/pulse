/**
 * One address for the service worker everywhere — two would make the browser swap workers
 * back and forth. In a production build the worker also keeps the app for offline (D-127:
 * the build's files and the last screens); in development it must not — the code changes
 * under the same file names, and a kept copy would hide every edit.
 */
export const WORKER_URL = process.env.NODE_ENV === "production" ? "/sw.js?offline=1" : "/sw.js";

/** Register the worker (idempotent): for the offline copy, and so a push can arrive. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(WORKER_URL, { scope: "/" });
  } catch {
    return null;
  }
}
