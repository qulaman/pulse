/**
 * The daily report as Лента sees it (D-167): whether today's report is there to do at all, whether
 * the evening has come to ask for it, and whether one tap hands it in. Pure — the row in «Дела»,
 * the face and the greeting read the same answer; the tests pin the edges. Every clock here is the
 * Aqtobe wall clock (lib/datetime/calendar.ts).
 */
import { nowHm, parseHm, todayYmd, type Hm } from "@/lib/datetime/calendar";

import type { Draft } from "./draft";
import { isoAt, isoToHm, minutesBetween } from "./format";
import type { MyDailyReportDay, SubmitDailyReportInput } from "./types";

/** `settings.daily_report.ask_from` when the company has not set it (lib/settings.ts). */
export const ASK_FROM_DEFAULT: Hm = "17:00";

/** A stored «Лента просит отчёт с» as a clock, or the default for anything else. */
export function askFromOf(value: unknown): Hm {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value) && parseHm(value) ? value : ASK_FROM_DEFAULT;
}

export type ReportDue = {
  /**
   * The row stands in «Дела»: reports on, the day is today's, a working one and not a holiday, and
   * the person is not away (a person on leave owes nothing — unless they handed one in anyway).
   */
  show: boolean;
  /** Today's report is in (or on the phone, waiting for the network). */
  submitted: boolean;
  /** When it was handed in, ISO; null before. */
  submittedAt: string | null;
  /** Not in yet and the clock is at or past `ask_from`: the row stands out, the face calls. */
  asking: boolean;
  /**
   * The clock is at or past `ask_from`, handed in or not: the row's place on top of «Дела» — it does
   * not jump from under the finger the moment «Сдать» turns it green.
   */
  evening: boolean;
  /**
   * Not in yet and «Сдать» can hand it in as it is: the day has tasks, the person's own words wait
   * in a draft typed on /report (D-183: words are asked for always), and leaving now is after the
   * arrival.
   */
  oneTap: boolean;
  /** The day's tasks written into the report by themselves. */
  tasks: number;
  /** What a hand-in brings: the company's +N on a working day with points on, else 0. */
  reward: number;
};

export const NO_REPORT_DUE: ReportDue = {
  show: false,
  evening: false,
  submitted: false,
  submittedAt: null,
  asking: false,
  oneTap: false,
  tasks: 0,
  reward: 0,
};

/**
 * What «Сдать» from Лента sends: the words of a draft of the same day typed on /report
 * (`lib/daily-report/draft.ts`; the draft is dropped after the submit), its «Пришёл» and «Ушёл»
 * where they are set and make a length, else the suggested arrival (the last report's time of day
 * or the company's start, `my_daily_report`) and leaving now on the minute. null — one tap cannot:
 * the day is not today any more, it has no tasks, there are no words yet (D-183: the row then says
 * «Написать ›»), or now is not after the arrival (the form on /report says why).
 */
export function oneTapInput(
  day: MyDailyReportDay,
  now: Date,
  clientRequestId: string,
  draft: Draft | null = null,
): SubmitDailyReportInput | null {
  if (day.tasks.length === 0 || day.date !== todayYmd(now)) return null;
  const arrivedHm = isoToHm(day.suggest.arrived_at);
  const arrived = arrivedHm ? isoAt(day.date, arrivedHm) : null;
  const left = isoAt(day.date, nowHm(now));
  const own = draft?.date === day.date ? draft : null;
  const summary = own && typeof own.summary === "string" ? own.summary.trim() : "";
  if (!summary) return null;
  if (own) {
    const ownArrived = own.arrived ? isoAt(day.date, own.arrived) : arrived;
    const ownLeft = own.left ? isoAt(day.date, own.left) : left;
    const minutes = minutesBetween(ownArrived, ownLeft);
    if (ownArrived && ownLeft && minutes !== null && minutes > 0) {
      return { arrived_at: ownArrived, left_at: ownLeft, summary, client_request_id: clientRequestId };
    }
  }
  const minutes = minutesBetween(arrived, left);
  if (!arrived || !left || minutes === null || minutes <= 0) return null;
  return { arrived_at: arrived, left_at: left, summary, client_request_id: clientRequestId };
}

/**
 * «Ушёл» on the form before anything is typed (7.6): now on the minute — but only from `ask_from`,
 * the product's evening. Earlier the person has not left: a prefilled «now» read as «31 мин на
 * работе» at half past nine, and a report handed in so carried a leaving time nobody chose. Before
 * the evening — empty: the field says «Время», the length line stays quiet. A day that is not today
 * keeps what the database suggested (only today's report can be written anyway).
 */
export function leftSuggestion(day: MyDailyReportDay, now: Date, askFrom: string = ASK_FROM_DEFAULT): Hm | null {
  if (day.date !== todayYmd(now)) return isoToHm(day.suggest.left_at);
  const clock = nowHm(now);
  return clock >= askFromOf(askFrom) ? clock : null;
}

/**
 * Where today's report stands for Лента. `day` — `my_daily_report` (undefined while it loads or
 * when it failed: nothing is shown); `askFrom` — `settings.daily_report.ask_from`; `away` — the
 * person's own `availability` is not «на месте» (`my_daily_report` does not say it; the push
 * reminder skips them the same way, `daily_report_reminders_due`); `draft` — the words typed on
 * /report and not handed in yet: with them «Сдать» goes in one tap.
 */
export function reportDue(
  day: MyDailyReportDay | undefined,
  now: Date,
  askFrom: string = ASK_FROM_DEFAULT,
  away = false,
  draft: Draft | null = null,
): ReportDue {
  if (!day || !day.enabled) return NO_REPORT_DUE;
  // the cached day may be yesterday's on a phone left open past midnight: only today's counts
  if (!day.today || day.date !== todayYmd(now)) return NO_REPORT_DUE;
  if (!day.workday || day.holiday) return NO_REPORT_DUE;
  const report = day.report?.status === "submitted" ? day.report : null;
  if (away && !report) return NO_REPORT_DUE;
  // "HH:MM" strings compare as the clock does
  const evening = nowHm(now) >= askFromOf(askFrom);
  const base = { show: true, evening, tasks: day.tasks.length, reward: day.points.enabled ? Math.max(0, day.points.reward) : 0 };
  if (report) return { ...base, submitted: true, submittedAt: report.submitted_at, asking: false, oneTap: false };
  return {
    ...base,
    submitted: false,
    submittedAt: null,
    asking: evening,
    oneTap: oneTapInput(day, now, "", draft) !== null,
  };
}
