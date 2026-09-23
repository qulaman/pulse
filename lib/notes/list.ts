import type { Note } from "./queries";

/**
 * Pure list arithmetic of the notes screen — pinned first, converted ones out of the
 * way, plain substring search. No dates, no locale: the screen is a client's own feed
 * of at most 300 rows (D-75 §8).
 */

export type SplitNotes = { active: Note[]; converted: Note[] };

function isConverted(note: Note): boolean {
  return note.converted_task_id !== null || note.converted_announcement_id !== null;
}

const newestFirst = (a: Note, b: Note) =>
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

/** «В деле» holds what a note became; the rest is the working feed, pinned on top. */
export function splitNotes(notes: Note[]): SplitNotes {
  const active: Note[] = [];
  const converted: Note[] = [];
  for (const note of notes) (isConverted(note) ? converted : active).push(note);

  active.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return newestFirst(a, b);
  });
  converted.sort(newestFirst);
  return { active, converted };
}

/** Case-insensitive substring over the text; an empty query keeps everything. */
export function filterNotes(notes: Note[], query: string): Note[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return notes;
  return notes.filter((note) => note.text.toLowerCase().includes(needle));
}

/** The card's heading: the first line with something on it. */
export function firstLine(text: string): string {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/** What is left under the heading — up to two lines on the card. */
export function restLines(text: string): string {
  const lines = text.split("\n");
  const index = lines.findIndex((line) => line.trim());
  if (index === -1) return "";
  return lines.slice(index + 1).join("\n").trim();
}
