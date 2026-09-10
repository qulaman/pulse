"use client";

import { useEffect } from "react";
import { create } from "zustand";

type Toast = { id: number; text: string };

type ToastState = {
  toasts: Toast[];
  show: (text: string) => void;
  dismiss: (id: number) => void;
};

let nextId = 1;

/** Ephemeral UI state — Zustand's own territory (docs/FRONTEND.md "State management"). */
const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (text) => set((state) => ({ toasts: [...state.toasts, { id: nextId++, text }] })),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** Callable from anywhere, including outside React (store actions, event handlers). */
export function toast(text: string) {
  useToastStore.getState().show(text);
}

const LIFETIME_MS = 3200;

function ToastItem({ item }: { item: Toast }) {
  const dismiss = useToastStore((state) => state.dismiss);

  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [dismiss, item.id]);

  return (
    <div
      role="status"
      className="pointer-events-auto w-full max-w-lg rounded-[12px] border border-border bg-surface-2 px-4 py-3 text-[14px] leading-[18px]"
      style={{ boxShadow: "var(--shadow-raised)" }}
      onClick={() => dismiss(item.id)}
    >
      {item.text}
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
