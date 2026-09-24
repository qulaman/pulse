"use client";

import { onlineManager, useIsMutating, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useSendQueue } from "@/components/OfflineBanner";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { applyUpdate, fetchServerVersion, hasUnsaved, isTyping, takeMark, useUpdateRequest } from "@/lib/update/client";
import { useServerVersion, versionKey } from "@/lib/update/queries";
import { useHydrated } from "@/lib/useHydrated";
import {
  BUILD,
  LONG_HIDE_MS,
  RETRY_AFTER_FAIL_MS,
  looksLikeStaleBuild,
  updateAction,
  updateOutcome,
  versionLabel,
  versionStatus,
} from "@/lib/version";

/** While a decision waits on unsaved work (a tap, a required update), look at the page this often. */
const BUSY_POLL_MS = 1_500;

/**
 * The phone is on the server's build, or it knows it is not (D-115). One line at the top —
 * «Есть новая версия · Обновить» — the moment a check finds a newer build; one tap reloads,
 * unless a recording or a draft would die with the page («Обновлю, как закончите» — then it
 * reloads by itself as soon as they are gone). Back from half an hour in the background with
 * nothing unsaved, the phone updates without asking and says so. A build the server can no
 * longer work with gets a screen instead of a line. The TV wall updates itself.
 */
export function AppUpdate() {
  const pathname = usePathname();
  const kiosk = pathname === "/tv" || pathname.startsWith("/tv/");
  const queryClient = useQueryClient();
  const server = useServerVersion();
  const queue = useSendQueue();
  const mutating = useIsMutating();
  const requested = useUpdateRequest((state) => state.requested);
  const request = useUpdateRequest((state) => state.request);
  const cancel = useUpdateRequest((state) => state.cancel);
  const [recentlyFailed, setRecentlyFailed] = useState(false);
  const failed = useRef(false);

  // the server drew nothing here; hydrate the same even if an answer is already cached
  const hydrated = useHydrated();
  // offline, nothing can be checked or fetched: a reload would open a dead page
  const status = hydrated && queue.isOnline ? versionStatus(BUILD, server.data) : "unknown";
  const due = status === "outdated" || status === "required";

  // what a reload would lose is read from the page in the very render that decides — never
  // a value a timer left behind; the tick only re-reads while the decision can turn on it
  const watching = due && (requested || status === "required");
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!watching) return;
    const timer = setInterval(() => setTick((n) => n + 1), BUSY_POLL_MS);
    return () => clearInterval(timer);
  }, [watching]);
  const busy = due && (mutating > 0 || hasUnsaved());

  const action = updateAction({
    status,
    busy,
    typing: due && isTyping(),
    kiosk,
    requested,
    // the quiet update after a long absence is decided once, on the return (below)
    freshResume: false,
    recentlyFailed,
  });

  // a tap is for this update only
  useEffect(() => {
    if (status === "current" && requested) cancel();
  }, [status, requested, cancel]);

  // the page after an update says how it went (read once: StrictMode runs effects twice)
  const outcome = useRef<ReturnType<typeof updateOutcome> | undefined>(undefined);
  useEffect(() => {
    if (outcome.current === undefined) outcome.current = updateOutcome(takeMark(), BUILD, Date.now());
    const result = outcome.current;
    if (!result) return;
    const timer = setTimeout(() => {
      if (result === "updated") {
        toast(`Обновил до версии ${versionLabel(BUILD)}`);
      } else {
        toast("Не получилось обновить. Попробую позже");
        failed.current = true;
        setRecentlyFailed(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!recentlyFailed) return;
    const timer = setTimeout(() => {
      failed.current = false;
      setRecentlyFailed(false);
    }, RETRY_AFTER_FAIL_MS);
    return () => clearTimeout(timer);
  }, [recentlyFailed]);

  // back after a long time away: the session is over, a reload surprises nobody — asked
  // once, with a fresh answer and the page as it is now; missed, it stays a line
  useEffect(() => {
    if (kiosk) return;
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (away < LONG_HIDE_MS || !onlineManager.isOnline()) return;
      void queryClient
        .fetchQuery({ queryKey: versionKey, queryFn: fetchServerVersion, staleTime: 0, networkMode: "always", retry: false })
        .then((answer) => {
          const quiet = updateAction({
            status: versionStatus(BUILD, answer),
            busy: queryClient.isMutating() > 0 || hasUnsaved(),
            typing: isTyping(),
            kiosk: false,
            requested: false,
            freshResume: true,
            recentlyFailed: failed.current,
          });
          if (quiet === "apply") void applyUpdate();
        })
        .catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [kiosk, queryClient]);

  // an old build's own errors mean the server may have moved on: ask now, not in ten minutes
  useEffect(() => {
    let last = 0;
    const check = (message: string) => {
      if (!looksLikeStaleBuild(message) || Date.now() - last < 10_000) return;
      last = Date.now();
      void queryClient.invalidateQueries({ queryKey: versionKey });
    };
    const onError = (event: ErrorEvent) => check(`${event.error?.name ?? ""}: ${event.message}`);
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      check(reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason ?? ""));
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [queryClient]);

  useEffect(() => {
    if (action === "apply") void applyUpdate();
  }, [action]);

  if (kiosk || action === "none") return null;
  if (action === "screen") return <UpdateScreen onUpdate={request} />;
  // the offline line owns the top of the screen while it is up
  if (queue.shown) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ top: "calc(6px + env(safe-area-inset-top))" }}
    >
      {action === "offer" ? (
        <button
          type="button"
          onClick={request}
          data-testid="app-update"
          className="card-in pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-surface py-1.5 pl-3 pr-3.5 text-[13px] leading-4 text-muted active:scale-[0.97]"
          style={{ boxShadow: "var(--shadow-raised)" }}
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
          {status === "required" ? "Эта версия устарела" : "Есть новая версия"}
          <span aria-hidden>·</span>
          <span className="font-display font-semibold text-accent">Обновить</span>
        </button>
      ) : (
        <p
          data-testid="app-update"
          className="card-in rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] leading-4 text-muted"
          style={{ boxShadow: "var(--shadow-raised)" }}
        >
          {action === "wait" ? "Обновлю, как закончите" : "Обновляю…"}
        </p>
      )}
    </div>
  );
}

/** This build can no longer talk to the server: nothing on the screen would work anyway. */
function UpdateScreen({ onUpdate }: { onUpdate: () => void }) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="app-update-title"
      data-testid="app-update-screen"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-bg/90 px-6 backdrop-blur-sm"
    >
      <div className="card card-in w-full max-w-sm p-6 text-center">
        <h2 id="app-update-title" className="font-display text-[20px] font-bold leading-[26px]">
          Нужно обновиться
        </h2>
        <p className="mt-2 text-[15px] leading-5 text-muted">
          Эта версия устарела — сервер уже работает по-новому. Обновлю за секунду
        </p>
        <Button block size="lg" className="mt-5" onClick={onUpdate}>
          Обновить
        </Button>
      </div>
    </div>
  );
}
