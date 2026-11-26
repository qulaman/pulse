/**
 * «Отчёты» on the desk (D-201): whether the «Табель» card stands open with its people — this
 * computer's own choice, kept in localStorage; folded until somebody opens it. Every access is in
 * try/catch: a browser without storage still answers from the page's memory until the window goes.
 */
const SHEET_KEY = "pulse.desk.reports.sheet";

const listeners = new Set<() => void>();
let memory: boolean | null = null;

export function subscribeSheet(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Browser only: the card is remembered open. */
export function readSheetOpen(): boolean {
  try {
    const value = window.localStorage.getItem(SHEET_KEY);
    return value === null ? (memory ?? false) : value === "open";
  } catch {
    return memory ?? false;
  }
}

/** The server draws the card folded; the browser's choice comes with hydration. */
export const sheetOpenOnServer = () => false;

export function writeSheetOpen(open: boolean): void {
  memory = open;
  try {
    window.localStorage.setItem(SHEET_KEY, open ? "open" : "folded");
  } catch {
    // forgotten with the window: the card opens folded next time
  }
  for (const listener of listeners) listener();
}
