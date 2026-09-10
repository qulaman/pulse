import { create } from "zustand";

type UiState = {
  /** Quiet mode: mutes effects and sounds (docs/FRONTEND.md). */
  quietMode: boolean;
  toggleQuietMode: () => void;
};

/** Zustand holds ephemeral UI state only — never server data. */
export const useUiStore = create<UiState>((set) => ({
  quietMode: false,
  toggleQuietMode: () => set((state) => ({ quietMode: !state.quietMode })),
}));
