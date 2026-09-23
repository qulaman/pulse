"use client";

import { create } from "zustand";

/** The person a typed order is for, chosen before typing — by id, not by a name to guess (D-84). */
export type ComposePin = { id: string; name: string; address: string };

/**
 * A one-shot request to open the typed input with text already in it —
 * «дать задачу этому человеку» from a person's card (FRONTEND «Пульс» п.4), or «Текстом»
 * over the face once a circle of the waiting screen is picked. The FAB and the face listen
 * for `requestId`, the sheet consumes `prefill` and `pin` once.
 */
type ComposeState = {
  prefill: string | null;
  pin: ComposePin | null;
  requestId: number;
  request: (prefill: string, pin?: ComposePin) => void;
  consume: () => { prefill: string | null; pin: ComposePin | null };
};

export const useComposeStore = create<ComposeState>((set, get) => ({
  prefill: null,
  pin: null,
  requestId: 0,
  request: (prefill, pin) => set((state) => ({ prefill, pin: pin ?? null, requestId: state.requestId + 1 })),
  consume: () => {
    const { prefill, pin } = get();
    if (prefill !== null || pin !== null) set({ prefill: null, pin: null });
    return { prefill, pin };
  },
}));
