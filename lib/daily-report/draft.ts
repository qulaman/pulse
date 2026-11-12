/**
 * What the phone keeps of an unsent daily report (D-152): the words and times typed on /report
 * survive a reload or an update, and «Сдать» on Лента hands them in (D-167, tasks/032). One key,
 * one day — a draft of another day is no draft. Every read and write may fail (private mode, a
 * full store): then there is simply no draft.
 */
import type { Hm } from "@/lib/datetime/calendar";

export const DRAFT_KEY = "pulse.daily-report.draft.v1";

export type Draft = { date: string; arrived: Hm | null; left: Hm | null; summary: string };

/** The draft of the given day, or null. */
export function readDraft(date: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    const draft = raw ? (JSON.parse(raw) as Draft) : null;
    return draft?.date === date ? draft : null;
  } catch {
    return null;
  }
}

/** Keeps the draft; null forgets whatever is kept. */
export function writeDraft(draft: Draft | null): void {
  try {
    if (draft) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // private mode or a full store: the form still holds the words while the screen is open
  }
}

/** The report of that day is in: its draft goes; a draft of another day is not touched. */
export function clearDraft(date: string): void {
  if (readDraft(date)) writeDraft(null);
}
