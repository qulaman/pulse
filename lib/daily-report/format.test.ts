import { describe, expect, it } from "vitest";

import { addDays } from "@/lib/datetime/calendar";

import {
  activityLine,
  capitalized,
  dayState,
  dayTitle,
  entryState,
  errorCodeOf,
  firstLine,
  formProblem,
  historyLine,
  isoWeekday,
  periodOf,
  markGone,
  personDayLine,
  pointsHint,
  pointsText,
  rangeText,
  reviewFacts,
  reviewMark,
  taskMeta,
  teamTotalsLine,
  timeOf,
} from "./format";
import type { DailyReport, MyDailyReportDay, TeamDay } from "./types";

const report = (patch: Partial<DailyReport> = {}): DailyReport => ({
  id: "r1",
  user_id: "u1",
  report_date: "2026-10-28",
  status: "submitted",
  arrived_at: "2026-10-28T09:05:00+05:00",
  left_at: "2026-10-28T17:45:00+05:00",
  summary: "Сверка с поставщиком",
  tasks: [],
  submitted_at: "2026-10-28T18:04:00+05:00",
  updated_at: "2026-10-28T18:04:00+05:00",
  points: 1,
  excused_at: null,
  excused_reason: null,
  ...patch,
});

const day = (patch: Partial<MyDailyReportDay> = {}): MyDailyReportDay => ({
  date: "2026-10-28",
  today: true,
  workday: true,
  holiday: false,
  enabled: true,
  report: null,
  tasks: [],
  suggest: { arrived_at: "2026-10-28T09:00:00+05:00", left_at: "2026-10-28T18:00:00+05:00" },
  points: { enabled: true, reward: 1, penalty: 10 },
  ...patch,
});

describe("times and lengths", () => {
  it("reads the wall clock without the leading zero", () => {
    expect(timeOf("2026-10-28T04:05:00Z")).toBe("9:05");
    expect(timeOf("2026-10-28T13:04:00Z")).toBe("18:04");
    expect(timeOf(null)).toBe("");
  });

});

describe("days", () => {
  it("names a day in full, capitalised", () => {
    expect(dayTitle("2026-10-28")).toBe("Среда, 28 октября");
  });

  it("walks across a month and knows the weekday", () => {
    expect(addDays("2026-10-28", 6)).toBe("2026-11-03");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(isoWeekday("2026-10-26")).toBe(1);
    expect(isoWeekday("2026-11-01")).toBe(7);
  });

  it("takes the last 7 and 30 days with today", () => {
    expect(periodOf("week", "2026-10-28")).toEqual({ from: "2026-10-22", to: "2026-10-28" });
    expect(periodOf("month", "2026-10-28")).toEqual({ from: "2026-09-29", to: "2026-10-28" });
  });

  it("writes a range short", () => {
    expect(rangeText("2026-10-22", "2026-10-28")).toBe("22–28 окт.");
    expect(rangeText("2026-09-29", "2026-10-28")).toBe("29 сент. – 28 окт.");
  });
});

describe("the employee's day", () => {
  it("says the state of the day", () => {
    expect(dayState(day({ enabled: false }))).toEqual({ tone: "none", text: "Отчёты выключены" });
    expect(dayState(day())).toEqual({ tone: "wait", text: "Не сдан" });
    expect(dayState(day({ workday: false }))).toEqual({ tone: "none", text: "Выходной — можно сдать, без очков" });
    expect(dayState(day({ report: report() }))).toEqual({ tone: "ok", text: "Сдан в 18:04 · +1" });
    expect(dayState(day({ report: report({ points: 0 }) })).text).toBe("Сдан в 18:04");
  });

  it("says it in two words for «Дела»", () => {
    expect(entryState(day())).toEqual({ tone: "wait", text: "не сдан" });
    expect(entryState(day({ report: report() })).text).toBe("сдан в 18:04");
    expect(entryState(day({ workday: false })).text).toBe("выходной");
    // D-198: the director's check, once it happened
    expect(entryState(day({ report: report({ checked_at: "2026-10-28T19:05:00+05:00" }) }))).toEqual({ tone: "ok", text: "сдан · проверен" });
    expect(entryState(day({ report: report({ seen_at: "2026-10-28T18:40:00+05:00" }) })).text).toBe("сдан в 18:04");
  });

  it("names a company holiday where it names a day off (D-155 §7)", () => {
    const holiday = day({ workday: false, holiday: true });
    expect(dayState(holiday)).toEqual({ tone: "none", text: "Праздник — отчёт сегодня не нужен" });
    expect(entryState(holiday)).toEqual({ tone: "muted", text: "праздник" });
    // a report handed in on the holiday still says when it went
    expect(dayState({ ...holiday, report: report({ points: 0 }) }).text).toBe("Сдан в 18:04");
  });

  it("promises a minus only where the miss costs one (D-155 §1)", () => {
    expect(pointsHint(day(), true)).toEqual(["+1 за сданный · −10, если не сдать до конца дня"]);
    const first = day({ points: { enabled: true, reward: 1, penalty: 0 } });
    expect(pointsHint(first, false)).toEqual(["+1 за сданный", "Пока не сдан первый отчёт, пропуск не штрафуется"]);
    // the past days still loading, or a company without a fine: nothing about a minus
    expect(pointsHint(first, undefined)).toEqual(["+1 за сданный"]);
    expect(pointsHint(first, true)).toEqual(["+1 за сданный"]);
  });

  it("points and lines of a past day", () => {
    expect(pointsText(1)).toBe("+1");
    expect(pointsText(-10)).toBe("−10");
    expect(pointsText(0)).toBe("");
    const tasks = [1, 2, 3].map((i) => ({ id: `t${i}`, title: "x", status: "done" as const, completed_at: null, closed_at: null, on_time: true }));
    // D-198: the first line of the words — no length of the day, the points stand beside the day once
    expect(historyLine(report({ tasks }))).toBe("Сверка с поставщиком");
    expect(historyLine(report({ summary: "\n  Сверил объёмы   по кровле\nПрайс — в задаче" }))).toBe("Сверил объёмы по кровле");
    // a report without words (an older build): the tasks, never «0 задач»
    expect(historyLine(report({ summary: null, tasks }))).toBe("сдан · 3 задачи");
    expect(historyLine(report({ summary: "  ", tasks: [] }))).toBe("сдан");
    // the minus stands beside the day, once
    expect(historyLine(report({ status: "missed", points: -10, arrived_at: null, left_at: null }))).toBe("не сдан");
    // a minus given back — by «Оспорить» or by the D-155 refund — nets the day to 0
    expect(historyLine(report({ status: "missed", points: 0, arrived_at: null, left_at: null }))).toBe("не сдан · без штрафа");
    // D-183: the director excused the day — the minus is back, the director's reason is said
    const excused = { status: "missed" as const, points: 0, arrived_at: null, left_at: null, excused_at: "2026-10-29T10:00:00+05:00" };
    expect(historyLine(report({ ...excused, excused_reason: "болел" }))).toBe("не сдан · уважительная причина: болел");
    expect(historyLine(report({ ...excused, excused_reason: null }))).toBe("не сдан · уважительная причина");
  });

  it("takes the first line that says anything", () => {
    expect(firstLine("Склад\nОфис")).toBe("Склад");
    expect(firstLine("\r\n \r\nОбъект «Север»  \r\n")).toBe("Объект «Север»");
    expect(firstLine("   ")).toBe("");
    expect(firstLine(null)).toBe("");
    expect(capitalized("сдан 17:52")).toBe("Сдан 17:52");
    expect(capitalized("")).toBe("");
  });

  it("says a task's state and its deadline", () => {
    const task = { id: "t", title: "КП", status: "done" as const, completed_at: null, closed_at: null, on_time: true };
    expect(taskMeta(task)).toBe("принята · в срок");
    expect(taskMeta({ ...task, status: "pending_review", on_time: false })).toBe("на проверке · после срока");
    expect(taskMeta({ ...task, on_time: null })).toBe("принята");
  });

  it("stops the form on the common slips — words only, no times (D-198)", () => {
    expect(formProblem("Сверка")).toBeNull();
    expect(formProblem("x".repeat(4001))).toBe("Слишком длинно: до 4000 знаков");
    expect(formProblem(` ${"x".repeat(4000)} `)).toBeNull();
  });

  it("asks for one line of words always, tasks or not (D-183)", () => {
    expect(formProblem("")).toBe("Напишите одной строкой, что сделали");
    expect(formProblem("  \n ")).toBe("Напишите одной строкой, что сделали");
  });
});

describe("the director's marks as the person sees them (D-198)", () => {
  const at = (hm: string, ymd = "2026-10-28") => `${ymd}T${hm}:00+05:00`;
  const texts = (r: DailyReport) => reviewFacts(r).map((fact) => fact.text);

  it("only what happened: handed in, seen, checked — in that order, with their times", () => {
    expect(texts(report())).toEqual(["сдан 18:04"]);
    expect(texts(report({ seen_at: at("18:40") }))).toEqual(["сдан 18:04", "просмотрен 18:40"]);
    expect(texts(report({ seen_at: at("18:40"), checked_at: at("19:05"), checked_by: "d" }))).toEqual(["сдан 18:04", "просмотрен 18:40", "проверен 19:05"]);
    expect(reviewFacts(report({ seen_at: at("18:40"), checked_at: at("19:05") })).map((fact) => fact.kind)).toEqual(["submitted", "seen", "checked"]);
    // checked straight away: no «просмотрен» invented
    expect(texts(report({ checked_at: at("19:05") }))).toEqual(["сдан 18:04", "проверен 19:05"]);
  });

  it("a mark on a later day says the day, not a time that reads as the report's own", () => {
    expect(texts(report({ seen_at: at("09:15", "2026-10-29"), checked_at: at("09:16", "2026-10-29") }))).toEqual([
      "сдан 18:04",
      "просмотрен 29 окт.",
      "проверен 29 окт.",
    ]);
  });

  it("changed after a check: the check is off, the director will see it again", () => {
    expect(texts(report({ changed_after_check_at: at("19:12") }))).toEqual(["сдан 18:04", "изменён после проверки — директор увидит снова"]);
    // seen again since: the promise is kept, the fact stays
    expect(texts(report({ changed_after_check_at: at("19:12"), seen_at: at("19:30") }))).toEqual(["сдан 18:04", "изменён после проверки", "просмотрен 19:30"]);
    // checked again: the change is behind it
    expect(texts(report({ changed_after_check_at: at("19:12"), seen_at: at("19:30"), checked_at: at("19:31") }))).toEqual([
      "сдан 18:04",
      "просмотрен 19:30",
      "проверен 19:31",
    ]);
  });

  it("nothing on a missed day; a base before the migration has no marks", () => {
    expect(reviewFacts(report({ status: "missed", submitted_at: null }))).toEqual([]);
    const old = report();
    delete old.seen_at;
    delete old.checked_at;
    expect(texts(old)).toEqual(["сдан 18:04"]);
    expect(reviewMark(old)).toBeNull();
  });

  it("one word for a closed card: checked wins over seen, nothing for neither", () => {
    expect(reviewMark(report())).toBeNull();
    expect(reviewMark(report({ seen_at: at("18:40") }))).toBe("seen");
    expect(reviewMark(report({ seen_at: at("18:40"), checked_at: at("19:05") }))).toBe("checked");
    expect(reviewMark(report({ status: "missed", checked_at: at("19:05") }))).toBeNull();
  });
});

describe("the database's refusals", () => {
  it("finds our codes in the database's words", () => {
    expect(errorCodeOf("bad_times")).toBe("bad_times");
    expect(errorCodeOf('P0001: daily_report_disabled')).toBe("daily_report_disabled");
    expect(errorCodeOf("summary_too_long")).toBe("summary_too_long");
    expect(errorCodeOf("connection reset")).toBeNull();
  });
});

describe("the director's day", () => {
  const row = (patch: Partial<TeamDay["rows"][number]> = {}): TeamDay["rows"][number] => ({
    user_id: "u1",
    full_name: "Айгуль Нурланова",
    position: null,
    avatar_url: null,
    availability: "active",
    state: "submitted",
    report: report({ left_at: "2026-10-28T18:10:00+05:00" }),
    tasks: [],
    activity: { accepted: 3, handed_over: 2, closed: 2, messages: 5 },
    hours: 9.1,
    reminded: null,
    ...patch,
  });

  it("writes the person's line", () => {
    // D-183: times without a gender
    // D-194: the moment it was handed in, not the typed times and their hours
    expect(personDayLine(row())).toBe("сдан в 18:04");
    expect(personDayLine(row({ state: "pending", report: null, hours: null }))).toBe("отчёта пока нет");
    expect(personDayLine(row({ state: "off", report: null, hours: null }))).toBe("отчёт не нужен");
    expect(personDayLine(row({ state: "away", availability: "sick", report: null }))).toBe("на больничном");
  });

  it("writes the activity without zeros", () => {
    expect(activityLine({ accepted: 3, handed_over: 2, closed: 2, messages: 5 })).toBe("взято 3 · сдано 2 · принято 2 · сообщений 5");
    expect(activityLine({ accepted: 0, handed_over: 1, closed: 0, messages: 0 })).toBe("сдано 1");
    expect(activityLine({ accepted: 0, handed_over: 0, closed: 0, messages: 0 })).toBe("в задачах тихо");
  });

  it("sums the team's day", () => {
    const totals = { team: 12, submitted: 7, missed: 2, pending: 0, away: 1, excused: 0, handed_over: 15, closed: 9 };
    expect(teamTotalsLine({ date: "2026-10-27", today: false, workday: true, rows: [], totals })).toBe(
      "сдано задач 15 · принято 9",
    );
    // a quiet day: no «сдано задач 0 · принято 0»
    expect(teamTotalsLine({ date: "2026-10-27", today: false, workday: true, rows: [], totals: { ...totals, missed: 0, away: 0, handed_over: 0, closed: 0 } })).toBe("");
  });
});

describe("markGone", () => {
  it("the database's flag wins, the roster fills in for an older database; the team first, order kept", () => {
    const rows = [{ user_id: "a" }, { user_id: "b", gone: true }, { user_id: "c" }, { user_id: "d", gone: false }];
    expect(markGone(rows, new Set(["c", "d"])).map((row) => [row.user_id, row.gone])).toEqual([
      ["a", false],
      ["d", false],
      ["b", true],
      ["c", true],
    ]);
    expect(markGone([], new Set())).toEqual([]);
  });
});
