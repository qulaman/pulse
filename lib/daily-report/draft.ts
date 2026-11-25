/**
 * What the phone keeps of an unsent daily report (D-152): the words typed on /report survive a
 * reload or an update, and «Сдать» on Лента hands them in (D-167, tasks/032). One key, one day — a
 * draft of another day is no draft. Every read and write may fail (private mode, a full store):
 * then there is simply no draft. The report asks no «Пришёл / Ушёл» (D-198): a draft kept by an
 * older build still carries them under the same key — only its words are read.
 */

export const DRAFT_KEY = "pulse.daily-report.draft.v1";

export type Draft = { date: string; summary: string };

/** The draft of the given day, or null. */
export function readDraft(date: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    const draft = raw ? (JSON.parse(raw) as Partial<Draft> | null) : null;
    if (!draft || draft.date !== date) return null;
    return { date, summary: typeof draft.summary === "string" ? draft.summary : "" };
  } catch {
    return null;
  }
}

/** Keeps the draft; null forgets whatever is kept. */
export function writeDraft(draft: Draft | null): void {
  try {
    if (draft) window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ date: draft.date, summary: draft.summary }));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // private mode or a full store: the form still holds the words while the screen is open
  }
}

/** The report of that day is in: its draft goes; a draft of another day is not touched. */
export function clearDraft(date: string): void {
  if (readDraft(date)) writeDraft(null);
}
