"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { create } from "zustand";

import { fromNextFrame } from "@/components/ui/motion";

type ToastAction = { label: string; onClick: () => void };

/** `leaving`: dismissed, playing its way out; the store drops it when that ends. */
type Toast = { id: number; text: string; action?: ToastAction; lifetimeMs: number; leaving?: boolean };

type ToastOptions = {
  /** One button on the right — «Отменить» for a deferred action. */
  action?: ToastAction;
  /** How long the toast stays; a toast with an action waits as long as the action can be undone. */
  lifetimeMs?: number;
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
    set((state) => ({ toasts: [...state.toasts, { id, text, action: options?.action, lifetimeMs: options?.lifetimeMs ?? LIFETIME_MS }] }));
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.map((t) => (t.id === id && !t.leaving ? { ...t, leaving: true } : t)) })),
  remove: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** The way out (`toast-out`, `--t-screen`) and the glide of the ones below into the room it left (`--t-sheet`). */
const OUT_MS = 150;
const GLIDE_MS = 280;

/** Callable from anywhere, including outside React (store actions, event handlers). Returns the id. */
export function toast(text: string, options?: ToastOptions): number {
  return useToastStore.getState().show(text, options);
}

export function dismissToast(id: number): void {
  useToastStore.getState().dismiss(id);
}

function ToastItem({ item, node }: { item: Toast; node: (el: HTMLDivElement | null) => void }) {
  const dismiss = useToastStore((state) => state.dismiss);
  const remove = useToastStore((state) => state.remove);

  useEffect(() => {
    if (item.leaving) return;
    const timer = setTimeout(() => dismiss(item.id), item.lifetimeMs);
    return () => clearTimeout(timer);
  }, [dismiss, item.id, item.lifetimeMs, item.leaving]);

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
      className="pointer-events-auto flex w-full max-w-lg items-center gap-3 field px-4 py-3 text-[14px] leading-[18px]"
      style={{
        boxShadow: "var(--shadow-raised)",
        animation: item.leaving ? `toast-out ${OUT_MS}ms var(--ease-in) both` : "toast-in var(--t-instant) var(--ease-out) both",
        pointerEvents: item.leaving ? "none" : undefined,
      }}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && event.animationName === "toast-out") remove(item.id);
      }}
      onClick={() => dismiss(item.id)}
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
      fromNextFrame(
        el.animate([{ transform: `translateY(${was - top}px)` }, { transform: "translateY(0)" }], {
          duration: GLIDE_MS,
          easing: "cubic-bezier(0.2, 0, 0, 1)",
          composite: "add",
        }),
      );
    }
    tops.current = next;
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
      style={{ top: "calc(60px + env(safe-area-inset-top))" }}
    >
      {toasts.map((item) => (
        <ToastItem
          key={item.id}
          item={item}
          node={(el) => {
            if (el) nodes.current.set(item.id, el);
            else nodes.current.delete(item.id);
          }}
        />
      ))}
    </div>
  );
}
