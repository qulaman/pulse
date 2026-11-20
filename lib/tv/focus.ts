import { pluralRu } from "@/lib/tasks/status-text";

import type { TvFocusEmployee, TvFocusTask } from "./queries";

/**
 * A person and one order on the wall (D-76 §10, D-123; look D-185) — what to print. Pure functions:
 * the "which word" rule is checked by a test, not by eye on the TV.
 *
 * The main rule is the whole wall's: **nothing negative goes on the wall by name** (D-45).
 * The wall shows the person, it does not interrogate them: no minute-by-minute history, no deadlines, no «в срок N»,
 * no «Новый срок», no «Снова в работе». Rework is the same «В работе» as an accepted order; a decline
 * or overdue shows neither in words nor in colour. Zeros are not printed: «0 в работе» on the wall reads as a reproach.
 */

export type StageKey = "new" | "work" | "review" | "done";

/** Where an order stands, in the wall's words. A status not listed here never reaches the wall. */
const STAGE_OF: Record<string, StageKey> = {
  sent: "new",
  accepted: "work",
  in_progress: "work",
  // a return for rework is work too: no word of its own on the wall (D-45)
  rework: "work",
  pending_review: "review",
  done: "done",
};

/** Neutral words in the present tense: what the order is now, not what happened to it. */
export const STAGE_WORD: Record<StageKey, string> = {
  new: "Новое",
  work: "В работе",
  review: "На проверке",
  done: "Готово",
};

/** A guest gets no title at all (D-33); for the team, an order without a title is just «Поручение». */
const UNTITLED = "Поручение";

export function stageOf(status: string): StageKey | null {
  return STAGE_OF[status] ?? null;
}

/* -------------------------------------------------------------------------- */
/* A person on the wall                                                        */
/* -------------------------------------------------------------------------- */

export type PersonStat = {
  key: "done" | "open" | "points";
  value: number;
  /** «сделано за неделю», «дела в работе», «очков за неделю». */
  label: string;
};

export type PersonItem = { id: string; title: string; stage: StageKey; word: string };

export type PersonView = {
  name: string;
  position: string | null;
  /** A real photo only; without one the wall draws nothing in place of the face. */
  avatar: string | null;
  /** Good numbers, non-zero only: done, in progress, points this week. */
  stats: PersonStat[];
  /** Open orders; with none open, the ones handed in this week; a guest gets nothing (D-33). */
  items: PersonItem[];
  mode: "open" | "done" | "none";
};

/** More than four orders beside a person do not read from three metres. */
export const PERSON_ITEMS = 4;

/** Points of the current week, only when points are on and positive (D-45: a minus is not news). */
function weekPoints(focus: TvFocusEmployee): number | null {
  if (focus.guest || focus.rating === null) return null;
  if (focus.rating && !focus.rating.points) return null;
  const weeks = focus.rating?.weeks;
  const value = Array.isArray(weeks) && weeks.length === 4 ? weeks[3] : focus.points_week;
  return typeof value === "number" && value > 0 ? value : null;
}

/** Done this week; a guest (and an old base) has no week, so it gets today's count. */
function doneStat(focus: TvFocusEmployee): PersonStat | null {
  const week = focus.rating?.done_week ?? 0;
  if (week > 0) return { key: "done", value: week, label: "сделано за неделю" };
  const today = focus.done_today?.count ?? 0;
  return today > 0 ? { key: "done", value: today, label: "сделано сегодня" } : null;
}

function itemOf(task: TvFocusTask, stage: StageKey): PersonItem {
  return { id: task.id, title: task.title?.trim() || UNTITLED, stage, word: STAGE_WORD[stage] };
}

export function personView(focus: TvFocusEmployee): PersonView {
  const open = focus.tasks.flatMap((task) => {
    const stage = stageOf(task.status);
    return stage && stage !== "done" ? [itemOf(task, stage)] : [];
  });
  const counted = focus.counts ? focus.counts.new + focus.counts.work + focus.counts.review : 0;
  const openCount = Math.max(counted, open.length);
  const points = weekPoints(focus);
  const done = doneStat(focus);

  const stats: PersonStat[] = [];
  if (done) stats.push(done);
  if (openCount > 0) stats.push({ key: "open", value: openCount, label: pluralRu(openCount, ["дело в работе", "дела в работе", "дел в работе"]) });
  if (points !== null) stats.push({ key: "points", value: points, label: pluralRu(points, ["очко за неделю", "очка за неделю", "очков за неделю"]) });

  const finished = focus.guest ? [] : (focus.done_recent ?? []).filter((task) => task.status === "done").map((task) => itemOf(task, "done"));
  const items = focus.guest ? [] : open.length > 0 ? open : finished;
  return {
    name: focus.employee.name,
    position: focus.employee.position?.trim() || null,
    avatar: focus.employee.avatar_url || null,
    stats,
    items: items.slice(0, PERSON_ITEMS),
    mode: items.length === 0 ? "none" : open.length > 0 ? "open" : "done",
  };
}

/* -------------------------------------------------------------------------- */
/* One order over the whole screen                                             */
/* -------------------------------------------------------------------------- */

export type PathStep = {
  key: "posted" | "work" | "review" | "done";
  label: string;
  /** Passed, under way now, or ahead. The current step is «сейчас», not passed. */
  state: "passed" | "now" | "next";
};

const PATH: { key: PathStep["key"]; label: string }[] = [
  { key: "posted", label: "Поставлено" },
  { key: "work", label: "В работе" },
  { key: "review", label: "На проверке" },
  { key: "done", label: "Готово" },
];

const PATH_AT: Record<StageKey, number> = { new: 0, work: 1, review: 2, done: 3 };

/**
 * An order's path in big steps: «Поставлено → В работе → На проверке → Готово». A return for
 * rework is «В работе» again: the «На проверке» step is ahead once more, with no word of its own (D-45).
 */
export function taskPath(task: Pick<TvFocusTask, "status">): PathStep[] {
  const at = PATH_AT[stageOf(task.status) ?? "work"];
  return PATH.map((step, index) => ({ ...step, state: index < at ? "passed" : index === at ? "now" : "next" }));
}

/** The order's title for the wall; a guest gets none from the base (D-33). */
export function taskTitle(task: Pick<TvFocusTask, "title">): string {
  return task.title?.trim() || UNTITLED;
}
