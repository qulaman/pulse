"use client";

import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useSendQueue } from "@/components/OfflineBanner";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { applyUpdate, hasUnsaved, isTyping, takeMark, useUpdateRequest } from "@/lib/update/client";
import { useServerVersion, versionKey } from "@/lib/update/queries";
import {
  BUILD,
  LONG_HIDE_MS,
  RESUME_WINDOW_MS,
  RETRY_AFTER_FAIL_MS,
  looksLikeStaleBuild,
  updateAction,
  updateOutcome,
  versionLabel,
  versionStatus,
} from "@/lib/version";

/** Drafts come and go without telling anyone: while an update is due, look again this often. */
const BUSY_POLL_MS = 1_500;

const noSubscribe = () => () => {};

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

  const [unsaved, setUnsaved] = useState(false);
  const [typing, setTyping] = useState(false);
  const [freshResume, setFreshResume] = useState(false);
  const [recentlyFailed, setRecentlyFailed] = useState(false);

  // the server drew nothing here; hydrate the same even if an answer is already cached
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  // offline, nothing can be checked or fetched: a reload would open a dead page
  const status = hydrated && queue.isOnline ? versionStatus(BUILD, server.data) : "unknown";
  const due = status === "outdated" || status === "required";

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
        setRecentlyFailed(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!recentlyFailed) return;
    const timer = setTimeout(() => setRecentlyFailed(false), RETRY_AFTER_FAIL_MS);
    return () => clearTimeout(timer);
  }, [recentlyFailed]);

  // a return after a long time away: the session is over, a reload surprises nobody
  useEffect(() => {
    let hiddenAt: number | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt !== null && Date.now() - hiddenAt >= LONG_HIDE_MS) {
        setFreshResume(true);
        clearTimeout(timer);
        timer = setTimeout(() => setFreshResume(false), RESUME_WINDOW_MS);
      }
      hiddenAt = null;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(timer);
    };
  }, []);

  // what a reload would lose is only worth watching while an update is due
  useEffect(() => {
    if (!due) return;
    const read = () => {
      setUnsaved(hasUnsaved());
      setTyping(isTyping());
    };
    const first = setTimeout(read, 0);
    const timer = setInterval(read, BUSY_POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [due]);

  // an old build's own errors mean the server has moved on: ask now, not in ten minutes
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

  const action = updateAction({
    status,
    busy: unsaved || mutating > 0,
    typing,
    kiosk,
    requested,
    freshResume,
    recentlyFailed,
  });

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
