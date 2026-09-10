"use client";

import { create } from "zustand";

/**
 * A one-shot request to open the typed input with text already in it —
 * «дать задачу этому человеку» from a person's card (FRONTEND «Пульс» п.4).
 * The FAB listens for `requestId`, the sheet consumes `prefill` once.
 */
type ComposeState = {
  prefill: string | null;
  requestId: number;
  request: (prefill: string) => void;
  consume: () => string | null;
};

export const useComposeStore = create<ComposeState>((set, get) => ({
  prefill: null,
  requestId: 0,
  request: (prefill) => set((state) => ({ prefill, requestId: state.requestId + 1 })),
  consume: () => {
    const text = get().prefill;
    if (text !== null) set({ prefill: null });
    return text;
  },
}));
