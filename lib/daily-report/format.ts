/**
 * The words of the daily report (D-152): times, the day's state, the lines of a person and of a
 * past day, the director's marks (D-198). Pure — the screens draw from these, the tests
 * pin them. Every clock here is the Aqtobe wall clock (lib/datetime/calendar.ts).
 */
import { addDays, aqtobeIsoToYmdHm, humanYmd, parseYmd, weekdayOf, type Hm, type Ymd } from "@/lib/datetime/calendar";
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

/** @deprecated use `addDays` from lib/datetime/calendar.ts */
export const addDaysYmd = addDays;

/** ISO weekday of a day: 1 — Monday … 7 — Sunday. */
export function isoWeekday(ymd: Ymd): number {
  return parseYmd(ymd) ? weekdayOf(ymd) + 1 : 0;
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
  return { from: addDays(today, kind === "week" ? -6 : -29), to: today };
}

/** «задача / задачи / задач» with the number. */
export function tasksCount(n: number): string {
  return `${n} ${pluralRu(n, ["задача", "задачи", "задач"])}`;
}

/** What a task of the day says beside its title: «принята · в срок». */
export function taskMeta(task: DailyReportTask): string {
  const state = task.status === "done" ? "принята" : "на проверке";
  if (task.on_time === null) return state;
  return `${state} · ${task.on_time ? "в срок" : "после срока"}`;
}

/**
 * The first line of the person's words, for a closed card: the first line that says anything,
 * spaces folded; "" — no words. The card cuts it to its width.
 */
export function firstLine(summary: string | null | undefined): string {
  if (!summary) return "";
  const line = summary.split(/\r?\n/).find((part) => part.trim());
  return line ? line.replace(/\s+/g, " ").trim() : "";
}

/**
 * The second line of a closed card in «Прошлые отчёты» (D-198): a handed-in day — the first line of
 * the person's words («Сверил объёмы по кровле…»), a report without words (an older build) — «сдан ·
 * 3 задачи» or «сдан»; never a length of the day (D-194) and never «0 задач»; the points stand once,
 * beside the day. A missed day — «не сдан» (its −10 beside the day) / «не сдан · без штрафа»; excused by the director
 * (D-183) — «не сдан · уважительная причина: болел», the minus already given back.
 */
export function historyLine(report: DailyReport): string {
  if (report.status === "missed") {
    if (report.excused_at) {
      const reason = firstLine(report.excused_reason);
      return reason ? `не сдан · уважительная причина: ${reason}` : "не сдан · уважительная причина";
    }
    // the minus stands once, beside the day; a miss that cost nothing says so — the form promises
    // «пропуск не штрафуется» (D-155 §1)
    return report.points < 0 ? "не сдан" : "не сдан · без штрафа";
  }
  const words = firstLine(report.summary);
  if (words) return words;
  return ["сдан", report.tasks.length ? tasksCount(report.tasks.length) : ""].filter(Boolean).join(" · ");
}

/** One thing that happened to a handed-in report (D-198), in the order it happened. */
export type ReviewFact = { kind: "submitted" | "changed" | "seen" | "checked"; text: string };

/** A director's mark's moment: its time on the report's own day, its date on a later one («26 нояб.»). */
function markAt(iso: string | null | undefined, reportDate: Ymd): string {
  const at = aqtobeIsoToYmdHm(iso ?? null);
  if (!at) return "";
  if (at.ymd === reportDate) return shortHm(at.hm);
  const day = parseYmd(at.ymd);
  return day ? `${day.day} ${SHORT_MONTHS[day.month - 1]}` : "";
}

/**
 * What happened to a handed-in report, only what did happen (D-198, the owner's answer 3): «сдан
 * 17:52 · просмотрен 18:40 · проверен 19:05». Nothing for a mark not set — no «не проверено», no
 * «ждёт директора». The words changed after a check took it off: «изменён после проверки — директор
 * увидит снова», and once the director has seen them again only «изменён после проверки». A missed
 * day has none. Lower case — the screen capitalises the first one it shows.
 */
export function reviewFacts(report: DailyReport): ReviewFact[] {
  if (report.status !== "submitted") return [];
  const facts: ReviewFact[] = [];
  const sent = timeOf(report.submitted_at);
  facts.push({ kind: "submitted", text: sent ? `сдан ${sent}` : "сдан" });
  if (report.changed_after_check_at && !report.checked_at) {
    facts.push({ kind: "changed", text: report.seen_at ? "изменён после проверки" : "изменён после проверки — директор увидит снова" });
  }
  if (report.seen_at) facts.push({ kind: "seen", text: ["просмотрен", markAt(report.seen_at, report.report_date)].filter(Boolean).join(" ") });
  if (report.checked_at) facts.push({ kind: "checked", text: ["проверен", markAt(report.checked_at, report.report_date)].filter(Boolean).join(" ") });
  return facts;
}

/**
 * The director's mark on a closed card or a row, in one word (D-198): «проверен» — checked,
 * «просмотрен» — seen and not checked; null — neither (nothing is said about what did not happen).
 */
export function reviewMark(report: Pick<DailyReport, "status" | "seen_at" | "checked_at">): "checked" | "seen" | null {
  if (report.status !== "submitted") return null;
  if (report.checked_at) return "checked";
  return report.seen_at ? "seen" : null;
}

/** Capitalises the first letter: «Сдан 17:52». */
export function capitalized(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/**
 * `wait` — not in yet and the day is not over: neutral, never green and never the client's brand
 * colour (a pilot with a green brand would read «Не сдан» as done — the state map in lib/tasks/tone.ts).
 */
export type DayTone = "ok" | "wait" | "none";

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
  // a company holiday (D-155 §7) is a day off too, said by its name
  if (day.holiday) return { tone: "none", text: "Праздник — отчёт сегодня не нужен" };
  if (!day.workday) return { tone: "none", text: "Выходной — можно сдать, без очков" };
  // today is not over: a calm «to do», not an alarm — and not green
  return { tone: "wait", text: "Не сдан" };
}

/**
 * The same state in two words for the row in «Дела»: «сдан в 18:04» / «сдан · проверен» (D-198) /
 * «не сдан» / «выходной» / «праздник».
 */
export function entryState(day: MyDailyReportDay): { tone: "ok" | "wait" | "muted"; text: string } {
  if (day.report?.status === "submitted") {
    return { tone: "ok", text: day.report.checked_at ? "сдан · проверен" : `сдан в ${timeOf(day.report.submitted_at)}` };
  }
  if (day.holiday) return { tone: "muted", text: "праздник" };
  if (!day.workday) return { tone: "muted", text: "выходной" };
  return { tone: "wait", text: "не сдан" };
}

/**
 * What the form says under the button on a working day before the first submit: «+1 за сданный ·
 * −10, если не сдать до конца дня». A miss that costs this person nothing (D-155 §1: no report
 * before today) promises no minus — before the first report the line says so instead.
 * `handedInBefore` — a report handed in on an earlier day; undefined while the past days load.
 */
export function pointsHint(day: MyDailyReportDay, handedInBefore: boolean | undefined): string[] {
  const promise = [
    day.points.reward ? `${pointsText(day.points.reward)} за сданный` : "",
    day.points.penalty ? `${pointsText(-day.points.penalty)}, если не сдать до конца дня` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const soft = !day.points.penalty && handedInBefore === false ? "Пока не сдан первый отчёт, пропуск не штрафуется" : "";
  return [promise, soft].filter(Boolean);
}

/** The longest «Чем занимался» the database keeps. */
export const SUMMARY_MAX = 4000;

/**
 * What stops the form from going, in the words the person needs — checked on the phone so the
 * common slips never cost a round trip. The report is the person's words, the day's tasks and the
 * moment it went (D-198: no «Пришёл / Ушёл»). The words are asked for always (D-183: the director
 * reads them; a day of tasks alone told him nothing) — one line is enough. The database still takes
 * a day of tasks without words (D-155 §7), so a report queued by an older build is not lost.
 */
export function formProblem(summary: string): string | null {
  if (!summary.trim()) return "Напишите одной строкой, что сделали";
  if (summary.trim().length > SUMMARY_MAX) return `Слишком длинно: до ${SUMMARY_MAX} знаков`;
  return null;
}

/** The RPCs' error codes and the words the screen says for them. */
export const DAILY_REPORT_ERROR_TEXT: Record<DailyReportError | "forbidden", string> = {
  daily_report_disabled: "Отчёты выключены",
  not_team_member: "Отчёт сдают сотрудники",
  // D-198: no times on the form any more — the refusal now means the day is closed (or an old
  // build sent one time without the other)
  bad_times: "Этот день уже закрыт — отчёт за него не принимается",
  summary_required: "Напишите, чем занимались",
  summary_too_long: `Слишком длинно: до ${SUMMARY_MAX} знаков`,
  bad_period: `Период — не длиннее ${PERIOD_MAX_DAYS} дней`,
  not_missed: "Этот отчёт сдан — снимать нечего",
  already_excused: "Причина уже записана",
  disputed: "Человек оспорил минус — ответьте на спор",
  reason_required: "Напишите причину",
  bad_ids: "Не получилось отметить отчёты. Попробуйте ещё раз",
  forbidden: "Нет доступа",
};

const CODES = Object.keys(DAILY_REPORT_ERROR_TEXT) as (keyof typeof DAILY_REPORT_ERROR_TEXT)[];

/** The code inside a PostgREST message (`raise exception 'bad_times'`), if it is one of ours. */
export function errorCodeOf(message: string | null | undefined): DailyReportError | "forbidden" | null {
  if (!message) return null;
  return CODES.find((code) => new RegExp(`\\b${code}\\b`).test(message)) ?? null;
}

/** «взято 3 · сдано 2 · принято 2 · сообщений 5» — words without a gender; the zeros are left out. */
export function activityLine(activity: TeamDayActivity): string {
  const parts = [
    activity.accepted ? `взято ${activity.accepted}` : "",
    activity.handed_over ? `сдано ${activity.handed_over}` : "",
    activity.closed ? `принято ${activity.closed}` : "",
    activity.messages ? `сообщений ${activity.messages}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "в задачах тихо";
}

/** The second line of the team's day: «сдано задач 15 · принято 9»; empty on a quiet day. */
export function teamTotalsLine(day: TeamDay): string {
  const t = day.totals;
  // the people's counts (сдали, ждём, не сдали, отпуск) stand once, in the legend under the bar;
  // here only what moved in the tasks — no empty «0 …» counters (FIX §4.5)
  return [t.handed_over ? `сдано задач ${t.handed_over}` : "", t.closed ? `принято ${t.closed}` : ""].filter(Boolean).join(" · ");
}

/** The people of a day in the order the director reads them, with the heading of each group. */
export const STATE_ORDER: TeamDayState[] = ["submitted", "pending", "missed", "away", "off"];

export const STATE_TITLE: Record<TeamDayState, string> = {
  submitted: "Сдали",
  pending: "Ещё не сдали",
  missed: "Не сдали",
  away: "В отпуске и на больничном",
  // not a working day, or not this person's: before they came, the module before it started (D-183)
  off: "Отчёт не нужен",
};

/**
 * The tone of a person's state: a status colour only where it is a status (DESIGN §1.3). «Ещё не
 * сдали» on a day that is not over is not done and not alarming — neutral (the state map,
 * lib/tasks/tone.ts: `wait`), drawn as a ring where a dot can be one (`STATE_DOT`).
 */
export const STATE_TONE: Record<TeamDayState, "ok" | "warn" | "danger" | "muted"> = {
  submitted: "ok",
  pending: "muted",
  missed: "danger",
  away: "muted",
  off: "muted",
};

/** The dot and the bar segment of a person's state — `wait` is a hollow ring (lib/tasks/tone.ts). */
export const STATE_DOT: Record<TeamDayState, "ok" | "wait" | "danger" | "muted"> = {
  submitted: "ok",
  pending: "wait",
  missed: "danger",
  away: "muted",
  off: "muted",
};

/**
 * The line under a person's name on a day: «сдан в 18:12» or what stands instead. Not the typed
 * «Пришёл–Ушёл» and their hours: those are what the form prefilled, not attendance (D-194); the report
 * no longer asks them (D-198).
 */
export function personDayLine(row: TeamDay["rows"][number]): string {
  const report = row.report;
  if (report?.status === "submitted") {
    const at = timeOf(report.submitted_at);
    return at ? `сдан в ${at}` : "сдан";
  }
  switch (row.state) {
    case "pending":
      return "отчёта пока нет";
    case "missed":
      return report?.excused_at ? "не сдан · уважительная причина" : "отчёт не сдан";
    case "away":
      // a closed past day comes back as away too: who was away then is not who is away now
      return row.availability === "sick" ? "на больничном" : row.availability === "vacation" ? "в отпуске" : "отпуск или больничный";
    default:
      return "отчёт не нужен";
  }
}

/**
 * The rows of a day or a period with `gone` known — the database's flag (migration 20261124130000),
 * or the roster's while the database is older — the team first, the ones who left after it (stable).
 */
export function markGone<R extends { user_id: string; gone?: boolean }>(rows: readonly R[], goneIds: ReadonlySet<string>): (R & { gone: boolean })[] {
  return rows.map((row) => ({ ...row, gone: row.gone ?? goneIds.has(row.user_id) })).sort((a, b) => Number(a.gone) - Number(b.gone));
}

/** «В отчёте: 9:05–18:10» — the times as the person wrote them, inside one report only (D-194). */
/** A share as a percent: «82%»; a dash when nothing was due. */
export function percentText(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return "—";
  return `${Math.round(rate * 100)}%`;
}
