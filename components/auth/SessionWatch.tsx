"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** How often an open screen asks whether its sign-in still stands. */
const EVERY_MS = 5 * 60_000;

/** Screens with no sign-in to lose: the sign-in itself, a company's sign-in, the sandboxes. */
export function watchesSession(pathname: string): boolean {
  return !(pathname === "/" || pathname === "/login" || pathname.startsWith("/c/") || pathname.startsWith("/dev"));
}

/**
 * A sign-in taken away — «Выйти со всех устройств», a fired person (D-135) — closes the base to
 * this phone at once, but an open screen would just go quiet: lists come back empty and nothing
 * says why. On every return to the app and every five minutes the screen asks the server; a
 * 401 or 403 sends it to the sign-in screen (which also forgets the data kept for offline).
 * Offline it asks nothing.
 */
export function SessionWatch() {
  const pathname = usePathname();

  useEffect(() => {
    if (!watchesSession(pathname)) return;
    let stopped = false;

    const check = async () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        const res = await fetch("/api/me", { credentials: "include", cache: "no-store" });
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload on purpose: drop every client cache of the dead session
        if (!stopped && (res.status === 401 || res.status === 403)) window.location.assign(`${window.location.origin}/login`);
      } catch {
        // no network: nothing to conclude
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };

    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => void check(), EVERY_MS);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [pathname]);

  return null;
}
