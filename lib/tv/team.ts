import { pluralRu } from "@/lib/tasks/status-text";

import type { TvLoadRow } from "./queries";

/**
 * The «Команда» scene's grid by the size of the team (D-185, D-194): a scene of three people must look finished,
 * not three names hanging in the middle of an empty wall. Pure functions, checked by a test.
 *
 *  - up to three people — one row of large cards across the wall, each with its words;
 *  - up to eight — two rows of cards;
 *  - more — the list of the big company: sixteen names a page, the number of tasks right after the name.
 *
 * Only good figures go up (D-45): tasks in work and what was accepted today, never a zero, never a lateness.
 */

export type TeamSize = "large" | "medium" | "compact";

export type TeamGrid = { cols: number; rows: number; size: TeamSize; perPage: number };

/** Sixteen names a page — four rows of four read from three metres. */
const COMPACT: TeamGrid = { cols: 4, rows: 4, size: "compact", perPage: 16 };

export function teamGrid(count: number): TeamGrid {
  if (count <= 3) return { cols: Math.max(1, count), rows: 1, size: "large", perPage: 3 };
  if (count <= 6) return { cols: 3, rows: 2, size: "medium", perPage: 6 };
  if (count <= 8) return { cols: 4, rows: 2, size: "medium", perPage: 8 };
  return COMPACT;
}

export type TeamFigure = { key: "work" | "done"; value: number; label: string };

/**
 * A card's figures with their words: «2 задачи в работе», «3 готово за неделю» (the week holds today; a base without
 * the week — «готово сегодня»). Nothing to say — no figure: no zero and no «задач нет» on the wall (D-45, D-185).
 * The big company's list keeps the bare number.
 */
export function teamFigures(row: Pick<TvLoadRow, "active" | "done_today" | "done_week">): TeamFigure[] {
  const figures: TeamFigure[] = [];
  if (row.active > 0) figures.push({ key: "work", value: row.active, label: pluralRu(row.active, ["задача в работе", "задачи в работе", "задач в работе"]) });
  const week = row.done_week ?? 0;
  const today = row.done_today ?? 0;
  if (week > 0) figures.push({ key: "done", value: week, label: "готово за неделю" });
  else if (today > 0 && row.done_week === undefined) figures.push({ key: "done", value: today, label: "готово сегодня" });
  return figures;
}

/** The line under a card's surname: the position, unless it only repeats the surname («Ербол Сотрудник», «Сотрудник»). */
export function teamPosition(row: Pick<TvLoadRow, "name" | "position">): string | null {
  const position = row.position?.trim() || null;
  if (!position) return null;
  const words = row.name.trim().toLocaleLowerCase("ru").split(/\s+/).slice(1).join(" ");
  return words === position.toLocaleLowerCase("ru") ? null : position;
}
