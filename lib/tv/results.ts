/**
 * Rules of the wall's good-news scenes (D-182): «Итог дня», «Итог недели», «Объявление» and the
 * pace line under the face. Only good things by name, nothing «из N», no percentage, no
 * comparison that reads as falling behind (D-45); no points for a guest (D-33). Layout lives in
 * the components; this file decides what is said.
 */

import { pluralRu } from "@/lib/tasks/status-text";

import type { TvAnnouncement, TvDayResult, TvPace, TvWeekResult } from "./queries";

// The summary's fields (I1, `lib/tv/queries.ts`) under the names the scenes use: the components
// that draw them carry the same names (TvDayResult, TvPace…).
export type TvDayResultData = TvDayResult;
export type TvWeekResultData = TvWeekResult;
export type TvAnnouncementData = TvAnnouncement;
export type TvPaceData = TvPace;

const PEOPLE: [string, string, string] = ["человек", "человека", "человек"];
const POINTS: [string, string, string] = ["очко", "очка", "очков"];
const TASKS: [string, string, string] = ["дело", "дела", "дел"];

export type ResultLine = { label: string; value: string };

export type DayResultView =
  | { state: "quiet" }
  | {
      state: "ready";
      done: number;
      /** «принято за день» under the hero number. */
      doneLabel: string;
      /** «5 человек сдали работу», «очков роздано +120» — each only when it is good news. */
      lines: ResultLine[];
      awards: { name: string; amount: number; reason: string }[];
    };

/**
 * «Итог дня». A day with nothing accepted is not shown as zero: the scene says thanks instead.
 * The guest gets no points and no awards (amounts are points, names come with a surname).
 */
export function dayResultView(day: TvDayResultData | null | undefined, guest: boolean): DayResultView {
  if (!day || day.done <= 0) return { state: "quiet" };
  const lines: ResultLine[] = [];
  if (day.people > 0) {
    lines.push({ label: pluralRu(day.people, ["сдал работу", "сдали работу", "сдали работу"]), value: `${day.people} ${pluralRu(day.people, PEOPLE)}` });
  }
  if (!guest && day.points != null && day.points > 0) {
    lines.push({ label: pluralRu(day.points, POINTS) + " за день", value: `+${day.points}` });
  }
  const awards = guest
    ? []
    : day.awards
        .filter((award) => award.amount > 0 && award.name.trim() !== "")
        .slice(0, 3)
        .map((award) => ({ name: award.name, amount: award.amount, reason: award.reason.trim() }));
  return { state: "ready", done: day.done, doneLabel: `${pluralRu(day.done, TASKS)} принято за день`, lines, awards };
}

const dayNameFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Aqtobe", weekday: "long" });

/** «среда» from `YYYY-MM-DD` (the date is a company day, so noon UTC never crosses midnight in Aqtobe). */
export function weekdayOf(day: string): string {
  const date = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? "" : dayNameFmt.format(date);
}

export type WeekResultView =
  | { state: "quiet" }
  | { state: "ready"; done: number; doneLabel: string; lines: ResultLine[] };

/** «Итог недели»: accepted in seven days, the best day, the week's leader, points (not to a guest). */
export function weekResultView(week: TvWeekResultData | null | undefined, guest: boolean): WeekResultView {
  if (!week || week.done <= 0) return { state: "quiet" };
  const lines: ResultLine[] = [];
  if (week.best_day && week.best_day.done > 0) {
    const name = weekdayOf(week.best_day.day);
    if (name) lines.push({ label: "лучший день", value: `${name} · ${week.best_day.done}` });
  }
  if (week.leader && week.leader.trim() !== "") lines.push({ label: "лидер недели", value: week.leader.trim() });
  if (!guest && week.points != null && week.points > 0) {
    lines.push({ label: pluralRu(week.points, POINTS) + " за неделю", value: `+${week.points}` });
  }
  return { state: "ready", done: week.done, doneLabel: `${pluralRu(week.done, TASKS)} принято за неделю`, lines };
}

/** An announcement longer than this is cut with an ellipsis: the wall is not a document. */
export const ANNOUNCEMENT_MAX = 420;

export type AnnouncementView = {
  text: string;
  /** The type step by length: short — a heading, long — body text, never smaller (tv-type.css). */
  size: "tv-title" | "tv-lead" | "tv-text";
  /** «Ознакомились 34» — only when someone did; never «из N» (D-45). */
  acks: string | null;
};

export function announcementView(a: TvAnnouncementData): AnnouncementView {
  const clean = a.text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const text = clean.length > ANNOUNCEMENT_MAX ? `${clean.slice(0, ANNOUNCEMENT_MAX - 1).trimEnd()}…` : clean;
  const size = text.length <= 70 ? "tv-title" : text.length <= 180 ? "tv-lead" : "tv-text";
  return { text, size, acks: a.acks > 0 ? `Ознакомились ${a.acks}` : null };
}

export type PaceView = {
  done: number;
  /** The bar toward a usual day, 0–1; `null` — no bar (no history yet, or the day is under usual). */
  bar: number | null;
  /** Good news only: «больше обычного», «лучший день за два месяца». */
  note: string | null;
};

/**
 * The pace line under the face: «Сегодня принято 9». Under the usual pace it is the number alone —
 * no bar, no comparison (D-45); at or over the usual pace a thin bar fills toward a usual day,
 * and over it the words say so. Nothing accepted yet — nothing shown.
 */
export function paceView(pace: TvPaceData | null | undefined): PaceView | null {
  if (!pace || pace.done <= 0) return null;
  const { done, usual_now, usual_day, best_day } = pace;
  if (usual_day <= 0 || done < usual_now) return { done, bar: null, note: null };
  const bar = Math.min(1, done / usual_day);
  let note: string | null = null;
  if (best_day > 0 && done > best_day) note = "лучший день за два месяца";
  else if (done > usual_now) note = "больше обычного";
  return { done, bar, note };
}
