import type { Errand } from "@/lib/errands/queries";
import { shortName } from "@/lib/people/names";
import { median } from "@/lib/stats";

export type ErrandTally = { name: string; taken: number; done: number; declined: number };

/**
 * Who took how many errands over a period (the director's /secretary screen). Counted by
 * who tapped «Принял»: an errand nobody took is not in the people table —
 * it shows in the total «не взяли».
 */
export function tallyByPerson(rows: readonly Errand[]): ErrandTally[] {
  const map = new Map<string, ErrandTally>();
  for (const row of rows) {
    if (!row.claimed_by) continue;
    const name = shortName(row.claimed?.full_name ?? "") || "Секретарь";
    const tally = map.get(row.claimed_by) ?? { name, taken: 0, done: 0, declined: 0 };
    tally.taken += 1;
    if (row.status === "done") tally.done += 1;
    if (row.status === "declined") tally.declined += 1;
    map.set(row.claimed_by, tally);
  }
  return [...map.values()].sort((a, b) => b.taken - a.taken || a.name.localeCompare(b.name, "ru"));
}

/**
 * The average «попросил → готово», in minutes. Only closed errands: an abandoned one has no
 * second end, and counting it would praise what was not done.
 */
export function averageDoneMinutes(rows: readonly Errand[]): number | null {
  const spans = rows
    .filter((row) => row.status === "done" && row.done_at)
    .map((row) => (new Date(row.done_at!).getTime() - new Date(row.created_at).getTime()) / 60_000)
    .filter((minutes) => minutes >= 0);
  if (spans.length === 0) return null;
  return Math.round(spans.reduce((sum, m) => sum + m, 0) / spans.length);
}

/** «3 мин» / «1 ч 5 мин» — a time, not a number. */
export function humanMinutes(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

/** How many requests stayed without an answer: the one figure worth fixing. */
export function unclaimedCount(rows: readonly Errand[]): number {
  return rows.filter((row) => !row.claimed_by && (row.status === "cancelled" || row.status === "sent")).length;
}

/** Asked → «готово» of one request, in minutes; null — not done (or a clock that went backwards). */
export function doneSpanMinutes(row: Pick<Errand, "status" | "done_at" | "created_at">): number | null {
  if (row.status !== "done" || !row.done_at) return null;
  const minutes = (new Date(row.done_at).getTime() - new Date(row.created_at).getTime()) / 60_000;
  return minutes >= 0 ? minutes : null;
}

/**
 * The usual «попросил → готово» (D-175): the median, as «Команда» says «обычно» — one coffee
 * forgotten for an hour does not make every coffee slow. Minutes, unrounded; null with nothing done.
 */
export function medianDoneMinutes(rows: readonly Errand[]): number | null {
  const spans = rows.map(doneSpanMinutes).filter((minutes): minutes is number => minutes !== null);
  return median(spans);
}

/** @deprecated import `median` from lib/stats.ts */
export { median };

/** A span said honestly: «< 1 мин» under a minute (never «0 мин»), «—» without data, else `humanMinutes`. */
export function spanWords(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 1) return "< 1 мин";
  return humanMinutes(Math.round(minutes));
}

export type ErrandOutcomes = { asked: number; taken: number; done: number; declined: number; cancelled: number; unclaimed: number };

/**
 * How a period's requests ended, every number from the same rows (D-175): asked, taken by
 * somebody, done, refused, taken back — and what nobody took, the one figure worth fixing.
 */
export function outcomesOf(rows: readonly Errand[]): ErrandOutcomes {
  return {
    asked: rows.length,
    taken: rows.filter((row) => Boolean(row.claimed_by)).length,
    done: rows.filter((row) => row.status === "done").length,
    declined: rows.filter((row) => row.status === "declined").length,
    cancelled: rows.filter((row) => row.status === "cancelled").length,
    unclaimed: unclaimedCount(rows),
  };
}
