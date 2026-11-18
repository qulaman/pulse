"use client";

import { useEffect, useRef } from "react";

import { KioskPause } from "@/components/tv/KioskLife";
import { reloadWhenServerUp } from "@/components/tv/useKiosk";
import { boundaryStep, getKioskSnapshot, kioskBoundary, kioskBoundaryRetry } from "@/lib/tv/kiosk-signal";

/** The error screen asks the page to render again this often. */
const RETRY_MS = 10_000;
/** A reload the server did not answer for: asked again this much later. */
const RELOAD_RETRY_MS = 30_000;

/**
 * The wall's own error boundary (D-182): a scene that throws leaves a dark wall with the time,
 * not Next's error page with a button nobody will press (principle 10). Every 10 s it fetches and
 * renders the page again (`retry`); after three failures in a row — a full reload, into a live
 * server only. The flag goes up in the receipt at once (`error_screen`), and comes down when the
 * wall ticks again. The layout — and `KioskLife` in it — stays outside this boundary.
 */
export default function TvError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const retryRef = useRef(retry);
  useEffect(() => {
    retryRef.current = retry;
  }, [retry]);

  useEffect(() => {
    console.error("tv:", error);
    kioskBoundary();
  }, [error]);

  useEffect(() => {
    let cancel: (() => void) | null = null;
    // an interval, not a timeout: a retry that fails without remounting this screen still gets the next one
    const timer = setInterval(() => {
      if (cancel) return;
      if (boundaryStep(getKioskSnapshot().boundary.retries) === "reload") {
        cancel = reloadWhenServerUp(RELOAD_RETRY_MS);
        return;
      }
      kioskBoundaryRetry();
      retryRef.current();
    }, RETRY_MS);
    return () => {
      clearInterval(timer);
      cancel?.();
    };
  }, []);

  return <KioskPause text="Обновляю экран…" />;
}
