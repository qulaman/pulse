"use client";

import { useEffect } from "react";
import { create } from "zustand";

type ToastAction = { label: string; onClick: () => void };

type Toast = { id: number; text: string; action?: ToastAction; lifetimeMs: number };

type ToastOptions = {
  /** One button on the right — «Отменить» for a deferred action. */
  action?: ToastAction;
  /** How long the toast stays; a toast with an action waits as long as the action can be undone. */
  lifetimeMs?: number;
};

type ToastState = {
  toasts: Toast[];
  show: (text: string, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
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
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** Callable from anywhere, including outside React (store actions, event handlers). Returns the id. */
export function toast(text: string, options?: ToastOptions): number {
  return useToastStore.getState().show(text, options);
}

export function dismissToast(id: number): void {
  useToastStore.getState().dismiss(id);
}

function ToastItem({ item }: { item: Toast }) {
  const dismiss = useToastStore((state) => state.dismiss);

  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), item.lifetimeMs);
    return () => clearTimeout(timer);
  }, [dismiss, item.id, item.lifetimeMs]);

  return (
    <div
      role="status"
      className="pointer-events-auto flex w-full max-w-lg items-center gap-3 field px-4 py-3 text-[14px] leading-[18px]"
      style={{ boxShadow: "var(--shadow-raised)", animation: "toast-in var(--t-instant) var(--ease-out) both" }}
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

export function ToastHost() {
  const toasts = useToastStore((state) => state.toasts);
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
      style={{ top: "calc(60px + env(safe-area-inset-top))" }}
    >
      {toasts.map((item) => (
        <ToastItem key={item.id} item={item} />
      ))}
    </div>
  );
}
