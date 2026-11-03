import { describe, expect, it } from "vitest";

import {
  activityLine,
  addDaysYmd,
  dayState,
  dayTitle,
  durationText,
  entryState,
  errorCodeOf,
  formProblem,
  historyLine,
  hoursText,
  isoAt,
  isoWeekday,
  lengthText,
  periodOf,
  personDayLine,
  pointsHint,
  pointsText,
  rangeText,
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

  it("says a length the way people do", () => {
    expect(lengthText(520)).toBe("8 ч 40 мин");
    expect(lengthText(540)).toBe("9 ч");
    expect(lengthText(45)).toBe("45 мин");
    expect(durationText("2026-10-28T09:05:00+05:00", "2026-10-28T17:45:00+05:00")).toBe("8 ч 40 мин");
    expect(durationText("2026-10-28T18:00:00+05:00", "2026-10-28T09:00:00+05:00")).toBeNull();
  });

  it("writes the database's hours with a comma", () => {
    expect(hoursText(9)).toBe("9 ч");
    expect(hoursText(8.5)).toBe("8,5 ч");
    expect(hoursText(null)).toBe("");
  });

  it("builds an instant of the day with the offset", () => {
    expect(isoAt("2026-10-28", "09:05")).toBe("2026-10-28T09:05:00+05:00");
  });
});

describe("days", () => {
  it("names a day in full, capitalised", () => {
    expect(dayTitle("2026-10-28")).toBe("Среда, 28 октября");
  });

  it("walks across a month and knows the weekday", () => {
    expect(addDaysYmd("2026-10-28", 6)).toBe("2026-11-03");
    expect(addDaysYmd("2026-03-01", -1)).toBe("2026-02-28");
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
    expect(dayState(day())).toEqual({ tone: "accent", text: "Не сдан" });
    expect(dayState(day({ workday: false }))).toEqual({ tone: "none", text: "Выходной — можно сдать, без очков" });
    expect(dayState(day({ report: report() }))).toEqual({ tone: "ok", text: "Сдан в 18:04 · +1" });
    expect(dayState(day({ report: report({ points: 0 }) })).text).toBe("Сдан в 18:04");
  });

  it("says it in two words for «Дела»", () => {
    expect(entryState(day()).text).toBe("не сдан");
    expect(entryState(day({ report: report() })).text).toBe("сдан в 18:04");
    expect(entryState(day({ workday: false })).text).toBe("выходной");
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
    expect(historyLine(report({ tasks }))).toBe("сдан · 8 ч 40 мин · 3 задачи · +1");
    expect(historyLine(report({ status: "missed", points: -10, arrived_at: null, left_at: null }))).toBe("не сдан · −10");
    // a minus given back — by «Оспорить» or by the D-155 refund — nets the day to 0
    expect(historyLine(report({ status: "missed", points: 0, arrived_at: null, left_at: null }))).toBe("не сдан");
  });

  it("says a task's state and its deadline", () => {
    const task = { id: "t", title: "КП", status: "done" as const, completed_at: null, closed_at: null, on_time: true };
    expect(taskMeta(task)).toBe("принята · в срок");
    expect(taskMeta({ ...task, status: "pending_review", on_time: false })).toBe("на приёмке · после срока");
    expect(taskMeta({ ...task, on_time: null })).toBe("принята");
  });

  it("stops the form on the common slips", () => {
    const a = "2026-10-28T09:00:00+05:00";
    const b = "2026-10-28T18:00:00+05:00";
    expect(formProblem(a, b, "Сверка")).toBeNull();
    expect(formProblem(b, a, "Сверка")).toBe("«Ушёл» должно быть позже «Пришёл»");
    expect(formProblem(a, b, "   ")).toBe("Напишите, чем занимались");
    expect(formProblem(a, b, "x".repeat(4001))).toBe("Слишком длинно: до 4000 знаков");
  });

  it("asks for words only on a day without tasks (D-155 §7)", () => {
    const a = "2026-10-28T09:00:00+05:00";
    const b = "2026-10-28T18:00:00+05:00";
    expect(formProblem(a, b, "   ", true)).toBeNull();
    expect(formProblem(a, b, "", false)).toBe("Напишите, чем занимались");
    // the times and the length still count with tasks
    expect(formProblem(b, a, "", true)).toBe("«Ушёл» должно быть позже «Пришёл»");
    expect(formProblem(a, b, "x".repeat(4001), true)).toBe("Слишком длинно: до 4000 знаков");
  });

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
    ...patch,
  });

  it("writes the person's line", () => {
    expect(personDayLine(row())).toBe("пришёл 9:05 — ушёл 18:10 · 9,1 ч");
    expect(personDayLine(row({ state: "pending", report: null, hours: null }))).toBe("ещё не сдал");
    expect(personDayLine(row({ state: "away", availability: "sick", report: null }))).toBe("на больничном");
  });

  it("writes the activity without zeros", () => {
    expect(activityLine({ accepted: 3, handed_over: 2, closed: 2, messages: 5 })).toBe("принял 3 · сдал 2 · принято 2 · сообщений 5");
    expect(activityLine({ accepted: 0, handed_over: 1, closed: 0, messages: 0 })).toBe("сдал 1");
    expect(activityLine({ accepted: 0, handed_over: 0, closed: 0, messages: 0 })).toBe("в задачах тихо");
  });

  it("sums the team's day", () => {
    const totals = { team: 12, submitted: 7, missed: 2, pending: 0, away: 1, handed_over: 15, closed: 9 };
    expect(teamTotalsLine({ date: "2026-10-27", today: false, workday: true, rows: [], totals })).toBe(
      "не сдали 2 · в отпуске 1 · сдано задач 15 · принято 9",
    );
  });
});
