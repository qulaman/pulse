"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

const online = () => (typeof navigator === "undefined" ? true : navigator.onLine);

/**
 * A thin line at the top while the phone has no network: the assistant's own words
 * (docs/DESIGN.md §4 «Оффлайн»), no red, no exclamation. Layout stays put — the line
 * overlays the header instead of pushing it.
 */
export function OfflineBanner() {
  const isOnline = useSyncExternalStore(subscribe, online, () => true);
  if (isOnline) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ top: "calc(6px + env(safe-area-inset-top))" }}
    >
      <p className="card-in rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] leading-4 text-muted" style={{ boxShadow: "var(--shadow-raised)" }}>
        Нет связи. Покажу всё, как появится
      </p>
    </div>
  );
}
