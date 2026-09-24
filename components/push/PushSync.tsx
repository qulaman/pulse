"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { refreshAppBadge, syncPush } from "@/lib/push/client";

/**
 * Keeps the channel alive without anybody's tap (D-114): on start and whenever the app comes
 * back to the screen, the browser's subscription is re-registered if the server lost it, and
 * the icon's number is refreshed. Not on the sign-in screen and not on the wall.
 */
export function PushSync() {
  const pathname = usePathname();
  const idle = pathname === "/login" || pathname.startsWith("/tv");

  useEffect(() => {
    if (idle) return;
    const run = () => {
      void syncPush();
      void refreshAppBadge();
    };
    // after the first paint: the screen matters more than the bookkeeping
    const timer = setTimeout(run, 1500);
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [idle]);

  return null;
}
