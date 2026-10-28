/**
 * The words of the daily report (D-152): times, lengths, the day's state, the lines of a
 * person and of a past day. Pure — the screens draw from these, the tests
 * pin them. Every clock here is the Aqtobe wall clock (lib/datetime/calendar.ts).
 */
import { aqtobeIsoToYmdHm, humanYmd, parseYmd, ymdHmToAqtobeIso, ymdOf, type Hm, type Ymd } from "@/lib/datetime/calendar";
import { pluralRu } from "@/lib/tasks/status-text";

import type {
  DailyReport,
  DailyReportError,
  DailyReportTask,
  MyDailyReportDay,
  TeamDay,
  TeamDayActivity,
  TeamDayState,
} from "./types";

/** The real minus sign: «−10» reads as a number, «-10» as a hyphen. */
const MINUS = "−";

/** «+1», «−10»; nothing for zero. */
export function pointsText(points: number): string {
  if (points > 0) return `+${points}`;
  if (points < 0) return `${MINUS}${Math.abs(points)}`;
  return "";
}

/** «9:05» — the hour without its leading zero, as people say it («с 9:14», DESIGN §5). */
export function shortHm(hm: Hm | null | undefined): string {
  if (!hm) return "";
  return hm.startsWith("0") ? hm.slice(1) : hm;
}

/** The wall-clock time of an instant: «18:04». */
export function timeOf(iso: string | null | undefined): string {
  return shortHm(aqtobeIsoToYmdHm(iso ?? null)?.hm);
}

/** The «HH:MM» of an instant, for a time field. */
export function hmOf(iso: string | null | undefined): Hm | null {
  return aqtobeIsoToYmdHm(iso ?? null)?.hm ?? null;
}

/** A time of the given day as an instant with the offset written out — what the RPC takes. */
export function isoAt(ymd: Ymd, hm: Hm): string | null {
  return ymdHmToAqtobeIso(ymd, hm);
}

/** Minutes from one instant to the next; null when either is missing or unreadable. */
export function minutesBetween(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 60_000);
}

/** «8 ч 40 мин», «9 ч», «45 мин». */
export function lengthText(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} мин`;
  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
}

/** Arrived to left as a length, or null while «Ушёл» is not after «Пришёл». */
export function durationText(arrived: string | null | undefined, left: string | null | undefined): string | null {
  const minutes = minutesBetween(arrived, left);
  return minutes !== null && minutes > 0 ? lengthText(minutes) : null;
}

/** Hours with one decimal from the database: «9 ч», «8,5 ч». */
export function hoursText(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return "";
  const rounded = Math.round(hours * 10) / 10;
  return `${String(rounded).replace(".", ",")} ч`;
}

/** «Вторник, 28 октября» — the eyebrow of a day. */
const LONG_DAY = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export function dayTitle(ymd: Ymd): string {
  const parts = parseYmd(ymd);
  if (!parts) return "";
  const text = LONG_DAY.format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** «Сегодня», «Вчера», «Пн, 26 октября» — a day in a list. */
export function dayName(ymd: Ymd, now: Date = new Date()): string {
  const text = humanYmd(ymd, now);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A day plus or minus some days, on the wall clock. */
export function addDaysYmd(ymd: Ymd, days: number): Ymd {
  const parts = parseYmd(ymd);
  if (!parts) return ymd;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return ymdOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** ISO weekday of a day: 1 — Monday … 7 — Sunday. */
export function isoWeekday(ymd: Ymd): number {
  const parts = parseYmd(ymd);
  if (!parts) return 0;
  return ((new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay() + 6) % 7) + 1;
}

const SHORT_MONTHS = ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."] as const;

/** «22 окт. – 28 окт.»; one month written once: «1–28 окт.». */
export function rangeText(from: Ymd, to: Ymd): string {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (!a || !b) return "";
  if (from === to) return `${a.day} ${SHORT_MONTHS[a.month - 1]}`;
  if (a.year === b.year && a.month === b.month) return `${a.day}–${b.day} ${SHORT_MONTHS[b.month - 1]}`;
  return `${a.day} ${SHORT_MONTHS[a.month - 1]} – ${b.day} ${SHORT_MONTHS[b.month - 1]}`;
}

export type PeriodKind = "week" | "month" | "custom";

/** The longest period the database answers for (`team_daily_report_period`). */
export const PERIOD_MAX_DAYS = 92;

/** «Неделя» — the last 7 days with today, «Месяц» — the last 30. */
export function periodOf(kind: Exclude<PeriodKind, "custom">, today: Ymd): { from: Ymd; to: Ymd } {
  return { from: addDaysYmd(today, kind === "week" ? -6 : -29), to: today };
}

/** «задача / задачи / задач» with the number. */
export function tasksCount(n: number): string {
  return `${n} ${pluralRu(n, ["задача", "задачи", "задач"])}`;
}

/** What a task of the day says beside its title: «принята · в срок». */
export function taskMeta(task: DailyReportTask): string {
  const state = task.status === "done" ? "принята" : "на приёмке";
  if (task.on_time === null) return state;
  return `${state} · ${task.on_time ? "в срок" : "после срока"}`;
}

/** A past day in «Прошлые отчёты»: «сдан · 8 ч 40 мин · 3 задачи · +1» / «не сдан · −10». */
export function historyLine(report: DailyReport): string {
  if (report.status === "missed") {
    return ["не сдан", pointsText(report.points)].filter(Boolean).join(" · ");
  }
  const length = durationText(report.arrived_at, report.left_at);
  return ["сдан", length, tasksCount(report.tasks.length), pointsText(report.points)].filter(Boolean).join(" · ");
}

export type DayTone = "ok" | "accent" | "none";

/**
 * The state of the employee's day, for the head of «Отчёт за день»: off — said so; submitted —
 * when and what it brought; a day off — allowed, no points; otherwise — not yet.
 */
export function dayState(day: MyDailyReportDay): { tone: DayTone; text: string } {
  if (!day.enabled) return { tone: "none", text: "Отчёты выключены" };
  const report = day.report;
  if (report?.status === "submitted") {
    const points = pointsText(report.points);
    return { tone: "ok", text: [`Сдан в ${timeOf(report.submitted_at)}`, points].filter(Boolean).join(" · ") };
  }
  if (!day.workday) return { tone: "none", text: "Выходной — можно сдать, без очков" };
  // today is not over: a calm «to do», not an alarm
  return { tone: "accent", text: "Не сдан" };
}

/** The same state in two words for the row in «Дела»: «сдан ✓» / «не сдан» / «выходной». */
export function entryState(day: MyDailyReportDay): { tone: "ok" | "accent" | "muted"; text: string } {
  if (day.report?.status === "submitted") return { tone: "ok", text: `сдан в ${timeOf(day.report.submitted_at)}` };
  if (!day.workday) return { tone: "muted", text: "выходной" };
  return { tone: "accent", text: "не сдан" };
}

/** The longest «Чем занимался» the database keeps. */
export const SUMMARY_MAX = 4000;

/**
 * What stops the form from going, in the words the person needs — checked on the phone so the
 * common slips never cost a round trip; the database checks the same (`DailyReportError`).
 */
export function formProblem(arrived: string | null, left: string | null, summary: string): string | null {
  if (!arrived || !left) return "Укажите, когда пришли и ушли";
  const minutes = minutesBetween(arrived, left);
  if (minutes === null || minutes <= 0) return "«Ушёл» должно быть позже «Пришёл»";
  if (!summary.trim()) return "Напишите, чем занимались";
  if (summary.trim().length > SUMMARY_MAX) return `Слишком длинно: до ${SUMMARY_MAX} знаков`;
  return null;
}

/** The RPCs' error codes and the words the screen says for them. */
export const DAILY_REPORT_ERROR_TEXT: Record<DailyReportError | "forbidden", string> = {
  daily_report_disabled: "Отчёты выключены",
  not_team_member: "Отчёт сдают сотрудники",
  bad_times: "Проверьте время: «Ушёл» позже «Пришёл», оба — сегодня",
  summary_required: "Напишите, чем занимались",
  summary_too_long: `Слишком длинно: до ${SUMMARY_MAX} знаков`,
  bad_period: `Период — не длиннее ${PERIOD_MAX_DAYS} дней`,
  forbidden: "Нет доступа",
};

const CODES = Object.keys(DAILY_REPORT_ERROR_TEXT) as (keyof typeof DAILY_REPORT_ERROR_TEXT)[];

/** The code inside a PostgREST message (`raise exception 'bad_times'`), if it is one of ours. */
export function errorCodeOf(message: string | null | undefined): DailyReportError | "forbidden" | null {
  if (!message) return null;
  return CODES.find((code) => new RegExp(`\\b${code}\\b`).test(message)) ?? null;
}

/** «принял 3 · сдал 2 · принято 2 · сообщений 5»; the zeros are left out. */
export function activityLine(activity: TeamDayActivity): string {
  const parts = [
    activity.accepted ? `принял ${activity.accepted}` : "",
    activity.handed_over ? `сдал ${activity.handed_over}` : "",
    activity.closed ? `принято ${activity.closed}` : "",
    activity.messages ? `сообщений ${activity.messages}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "в задачах тихо";
}

/** The second line of the team's day: «не сдали 2 · в отпуске 1 · сдано задач 15 · принято 9». */
export function teamTotalsLine(day: TeamDay): string {
  const t = day.totals;
  return [
    t.missed ? `не сдали ${t.missed}` : "",
    t.pending ? `ждём ${t.pending}` : "",
    t.away ? `в отпуске ${t.away}` : "",
    `сдано задач ${t.handed_over}`,
    `принято ${t.closed}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The people of a day in the order the director reads them, with the heading of each group. */
export const STATE_ORDER: TeamDayState[] = ["submitted", "pending", "missed", "away", "off"];

export const STATE_TITLE: Record<TeamDayState, string> = {
  submitted: "Сдали",
  pending: "Ещё не сдали",
  missed: "Не сдали",
  away: "Отпуск и больничный",
  off: "Не рабочий день",
};

/** The tone of a person's state: a status colour only where it is a status (DESIGN §1.3). */
export const STATE_TONE: Record<TeamDayState, "ok" | "warn" | "danger" | "muted"> = {
  submitted: "ok",
  pending: "warn",
  missed: "danger",
  away: "muted",
  off: "muted",
};

/** The line under a person's name on a day: «пришёл 9:05 — ушёл 18:10 · 9 ч» or what stands instead. */
export function personDayLine(row: TeamDay["rows"][number]): string {
  const report = row.report;
  if (report?.status === "submitted") {
    const times = `пришёл ${timeOf(report.arrived_at)} — ушёл ${timeOf(report.left_at)}`;
    const hours = hoursText(row.hours);
    return hours ? `${times} · ${hours}` : times;
  }
  switch (row.state) {
    case "pending":
      return "ещё не сдал";
    case "missed":
      return "отчёт не сдан";
    case "away":
      // a closed past day comes back as away too: who was away then is not who is away now
      return row.availability === "sick" ? "на больничном" : row.availability === "vacation" ? "в отпуске" : "отпуск или больничный";
    default:
      return "не рабочий день";
  }
}

/** A share as a percent: «82%»; a dash when nothing was due. */
export function percentText(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return "—";
  return `${Math.round(rate * 100)}%`;
}
