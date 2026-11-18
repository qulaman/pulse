"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** How often an open screen asks whether its sign-in still stands. */
const EVERY_MS = 5 * 60_000;
/** The wall's second opinion after a first 401/403. */
const WALL_CONFIRM_MS = 60_000;

/** The wall `/tv…` — not «Подключить экран» `/tv-connect`, which only shares the prefix. */
export function isWallPath(pathname: string): boolean {
  return pathname === "/tv" || pathname.startsWith("/tv/");
}

/** Screens with no sign-in to lose: the sign-in itself, a company's sign-in, the wall's pairing, the sandboxes. */
export function watchesSession(pathname: string): boolean {
  return !(
    pathname === "/" ||
    pathname === "/login" ||
    pathname.startsWith("/c/") ||
    pathname === "/tv-connect" ||
    pathname.startsWith("/tv-connect/") ||
    pathname.startsWith("/dev")
  );
}

/**
 * What a 401/403 means on this screen. A person's screen leaves for the sign-in at once (D-135:
 * a revoked sign-in is noticed within five minutes). The wall has nobody to sign it in again —
 * a wrong verdict leaves it dark all day — so it asks once more a minute later, and only two
 * refusals in a row send it to «Подключить экран» (D-182).
 */
export function sessionLoss(pathname: string): { to: string; strikes: number } {
  return isWallPath(pathname) ? { to: "/tv-connect", strikes: 2 } : { to: "/login", strikes: 1 };
}

/**
 * A sign-in taken away — «Выйти со всех устройств», a fired person (D-135) — closes the base to
 * this phone at once, but an open screen would just go quiet: lists come back empty and nothing
 * says why. On every return to the app and every five minutes the screen asks the server; a
 * 401 or 403 sends it to the sign-in screen (which also forgets the data kept for offline).
 * A 503 — the server could not check — and no network conclude nothing.
 */
export function SessionWatch() {
  const pathname = usePathname();

  useEffect(() => {
    if (!watchesSession(pathname)) return;
    const loss = sessionLoss(pathname);
    let stopped = false;
    let strikes = 0;
    let confirm: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        const res = await fetch("/api/me", { credentials: "include", cache: "no-store" });
        if (stopped) return;
        if (res.status === 401 || res.status === 403) {
          strikes += 1;
          if (strikes >= loss.strikes) {
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload on purpose: drop every client cache of the dead session
            window.location.assign(`${window.location.origin}${loss.to}`);
            return;
          }
          clearTimeout(confirm);
          confirm = setTimeout(() => void check(), WALL_CONFIRM_MS);
        } else if (res.ok) {
          strikes = 0;
        }
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
      clearTimeout(confirm);
    };
  }, [pathname]);

  return null;
}
