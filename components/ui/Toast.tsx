"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { create } from "zustand";

import { fromNextFrame, objectMotion } from "@/components/ui/motion";
import { useKeyboardDock } from "@/lib/ui/keyboard";

type ToastAction = { label: string; onClick: () => void };

/**
 * `at`: when it was raised (the document clock) — its time and its bar both count from there.
 * `leaving`: dismissed, playing its way out; the store drops it when that ends.
 */
type Toast = { id: number; text: string; action?: ToastAction; lifetimeMs: number; windowMs: number; at: number; leaving?: boolean };

type ToastOptions = {
  /** One button on the right — «Отменить» for a deferred action. */
  action?: ToastAction;
  /** How long the toast stays; a toast with an action waits as long as the action can be undone. */
  lifetimeMs?: number;
  /**
   * How long the button can still be pressed, when the caller ends that itself before the toast's
   * own time (an undo window that dismisses its toast, the toast outliving it by a breath): the
   * bar along the bottom runs out over this. Defaults to `lifetimeMs`.
   */
  windowMs?: number;
};

type ToastState = {
  toasts: Toast[];
  show: (text: string, options?: ToastOptions) => number;
  /** Starts the way out; the toast is gone once it has played. */
  dismiss: (id: number) => void;
  remove: (id: number) => void;
};

let nextId = 1;

const LIFETIME_MS = 3200;

/** Ephemeral UI state — Zustand's own territory (docs/FRONTEND.md "State management"). */
const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (text, options) => {
    const id = nextId++;
    const lifetimeMs = options?.lifetimeMs ?? LIFETIME_MS;
    const raised = { id, text, action: options?.action, lifetimeMs, windowMs: options?.windowMs ?? lifetimeMs, at: performance.now() };
    set((state) => ({ toasts: [...state.toasts, raised] }));
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.map((t) => (t.id === id && !t.leaving ? { ...t, leaving: true } : t)) })),
  remove: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** The way out (`toast-out`, `--t-screen`): faster than the way in (`--t-object`, D-166). */
const OUT_MS = 150;

/** Callable from anywhere, including outside React (store actions, event handlers). Returns the id. */
export function toast(text: string, options?: ToastOptions): number {
  return useToastStore.getState().show(text, options);
}

export function dismissToast(id: number): void {
  useToastStore.getState().dismiss(id);
}

function ToastItem({ item, node }: { item: Toast; node: (el: HTMLDivElement | null) => void }) {
  // a toast with a button lives at the bottom, by the thumb that has just acted (D-142)
  const low = Boolean(item.action);
  const dismiss = useToastStore((state) => state.dismiss);
  const remove = useToastStore((state) => state.remove);
  const timer = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (item.leaving) return;
    const left = setTimeout(() => dismiss(item.id), Math.max(0, item.at + item.lifetimeMs - performance.now()));
    return () => clearTimeout(left);
  }, [dismiss, item.id, item.at, item.lifetimeMs, item.leaving]);

  // the bar runs out with the button's time, from the moment the toast was raised: the render
  // that raised it may have taken a while, the time did not wait for it. WAAPI on the
  // compositor, not a CSS animation: the entrance's `fromNextFrame` holds the toast's own
  // animations, never this one, and reduced motion keeps it — it is a clock, not a flourish
  useLayoutEffect(() => {
    const bar = timer.current;
    if (!bar) return;
    const run = bar.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], {
      duration: item.windowMs,
      easing: "linear",
      fill: "forwards",
    });
    // the document timeline counts from the same origin as `performance.now()`
    run.startTime = item.at;
    return () => run.cancel();
  }, [item.windowMs, item.at]);

  // the way out ends on its own `animationend`; this only catches a tab that runs no animations
  useEffect(() => {
    if (!item.leaving) return;
    const timer = setTimeout(() => remove(item.id), OUT_MS + 400);
    return () => clearTimeout(timer);
  }, [remove, item.id, item.leaving]);

  return (
    <div
      ref={node}
      role="status"
      className="toast-glass pointer-events-auto flex w-full max-w-lg items-center gap-3 px-4 py-3 text-[14px] leading-[18px]"
      style={{
        animation: item.leaving
          ? `${low ? "toast-out-down" : "toast-out"} ${OUT_MS}ms var(--ease-in) both`
          : `${low ? "toast-in-up" : "toast-in"} var(--t-object) var(--ease-object) both`,
        pointerEvents: item.leaving ? "none" : undefined,
      }}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && (event.animationName === "toast-out" || event.animationName === "toast-out-down")) remove(item.id);
      }}
      // a tap on the words hides a plain toast; one with «Отменить» stays until its button or its
      // time — hiding it looked like taking the tap back while the window ran on (D-142)
      onClick={low ? undefined : () => dismiss(item.id)}
    >
      <span className="min-w-0 flex-1">{item.text}</span>
      {item.action ? (
        <button
          type="button"
          className="shrink-0 font-display text-[14px] font-semibold text-accent"
          onClick={(event) => {
            event.stopPropagation();
            item.action?.onClick();
            dismiss(item.id);
          }}
        >
          {item.action.label}
        </button>
      ) : null}
      {item.action ? <span ref={timer} aria-hidden className="toast-timer" /> : null}
    </div>
  );
}

/**
 * The stack. A toast that leaves plays its way out in place; then it is dropped and the ones
 * below glide up into its room (FLIP by hand, transform only) instead of jumping a toast's
 * height in one frame. Plain CSS and WAAPI — the host sits in the root layout, and framer
 * would ride along into every screen's first load (the login, the wall).
 */
export function ToastHost() {
  const toasts = useToastStore((state) => state.toasts);
  const nodes = useRef(new Map<number, HTMLDivElement>());
  const tops = useRef(new Map<number, number>());
  // the low toasts stand on the keyboard while one is out, like everything docked (D-112) —
  // under it nobody would see «Отменить»; a toast covers no field, so no field guard
  const lowStack = useRef<HTMLDivElement>(null);
  useKeyboardDock(lowStack, toasts.some((toast) => toast.action), { cover: false });

  useLayoutEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<number, number>();
    for (const [id, el] of nodes.current) {
      const top = el.offsetTop;
      next.set(id, top);
      const was = tops.current.get(id);
      // a new toast arrives with the action that raised it, usually the heaviest render of the tap
      if (was === undefined) el.getAnimations().forEach(fromNextFrame);
      if (still || was === undefined || was === top) continue;
      // the ones below glide into the room a toast left on the object spring, like any thing (D-166)
      const glide = objectMotion();
      fromNextFrame(
        el.animate([{ transform: `translateY(${was - top}px)` }, { transform: "translateY(0)" }], {
          duration: glide.ms,
          easing: glide.easing,
          composite: "add",
        }),
      );
    }
    tops.current = next;
  }, [toasts]);

  if (toasts.length === 0) return null;

  const item = (toast: Toast) => (
    <ToastItem
      key={toast.id}
      item={toast}
      node={(el) => {
        if (el) nodes.current.set(toast.id, el);
        else nodes.current.delete(toast.id);
      }}
    />
  );
  const high = toasts.filter((toast) => !toast.action);
  const low = toasts.filter((toast) => toast.action);

  return (
    <>
      {high.length > 0 ? (
        <div
          className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
          style={{ top: "calc(60px + env(safe-area-inset-top))" }}
        >
          {high.map(item)}
        </div>
      ) : null}
      {/* «Отменить», «Открыть»: where the thumb is, just above the tab bar — not a reach to the top (D-142) */}
      {low.length > 0 ? (
        <div
          ref={lowStack}
          className="above-tabbar pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
          // above a bar docked over the tab bar, if one is up (`useDockSpace`): never over its keys
          style={{ bottom: "calc(var(--tabbar-space) + var(--dock-space, 0px) + 10px)" }}
          data-testid="toasts-low"
        >
          {low.map(item)}
        </div>
      ) : null}
    </>
  );
}
