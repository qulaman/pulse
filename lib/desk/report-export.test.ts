import { describe, expect, it } from "vitest";

import type { TeamDayRow, TeamPeriodRow } from "@/lib/daily-report/types";

import {
  csvCell,
  dayFileName,
  daySheet,
  daySheetTitle,
  inOrder,
  periodFileName,
  periodSheet,
  periodSheetTitle,
  printCell,
  toCsv,
  type ReportSheet,
} from "./report-export";

const periodRow = (patch: Partial<TeamPeriodRow>): TeamPeriodRow => ({
  user_id: "u1",
  full_name: "Айгуль Сапарова",
  position: null,
  avatar_url: null,
  workdays: 10,
  submitted: 8,
  missed: 2,
  submit_rate: 0.8,
  avg_arrived: "09:05",
  avg_left: "18:10",
  avg_hours: 8.5,
  hours_total: 68,
  handed_over: 3,
  closed: 2,
  on_time: 2,
  late: 1,
  points: -12,
  ...patch,
});

const report = { id: "r", user_id: "u1", report_date: "2026-11-04", status: "submitted" as const, tasks: [], updated_at: "2026-11-04T13:00:00Z" };

const dayRow = (patch: Partial<TeamDayRow>): TeamDayRow => ({
  user_id: "u1",
  full_name: "Айгуль Сапарова",
  position: null,
  avatar_url: null,
  availability: "active",
  state: "submitted",
  report: {
    ...report,
    arrived_at: "2026-11-04T04:05:00Z",
    left_at: "2026-11-04T13:10:00Z",
    summary: "Смета\nИ акт сверки",
    submitted_at: "2026-11-04T13:12:00Z",
    points: 1,
  },
  tasks: [],
  activity: { accepted: 0, handed_over: 0, closed: 0, messages: 0 },
  hours: 9.1,
  ...patch,
});

describe("csvCell", () => {
  it("doubles the quotes and wraps what would break the row", () => {
    expect(csvCell('ТОО "Арлан"')).toBe('"ТОО ""Арлан"""');
    expect(csvCell("смета; акт")).toBe('"смета; акт"');
    expect(csvCell("две\nстроки")).toBe('"две\nстроки"');
    expect(csvCell("простой текст, с запятой")).toBe("простой текст, с запятой");
  });

  it("puts an apostrophe before whatever a spreadsheet would run", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+77012223344")).toBe("'+77012223344");
    expect(csvCell("-10 за опоздание")).toBe("'-10 за опоздание");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\t=1+1")).toBe("'\t=1+1");
    expect(csvCell("\r=1+1")).toBe('"\'\n=1+1"');
  });

  it("guards first, quotes after: the apostrophe stays inside the quotes", () => {
    expect(csvCell('=A1;"x"')).toBe('"\'=A1;""x"""');
  });

  it("leaves a formula character in the middle alone", () => {
    expect(csvCell("Ерлан = молодец + @team")).toBe("Ерлан = молодец + @team");
  });

  it("keeps a number a number: a sign is no formula, a zero is no gap", () => {
    expect(csvCell(-10)).toBe("-10");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(-0)).toBe("0");
    expect(csvCell(8.5)).toBe("8,5");
    expect(csvCell(-2.5)).toBe("-2,5");
  });

  it("writes nothing for no value", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell("")).toBe("");
    expect(csvCell(Number.NaN)).toBe("");
    expect(csvCell(Number.POSITIVE_INFINITY)).toBe("");
  });

  it("makes every break inside a cell the same LF, a row's end stays CRLF", () => {
    expect(csvCell("раз\r\nдва\rтри")).toBe('"раз\nдва\nтри"');
  });
});

describe("toCsv", () => {
  const sheet: ReportSheet = {
    columns: [{ title: "Кто" }, { title: "Очки", right: true }],
    rows: [
      ["Айгуль", -10],
      ["Ербол", 0],
    ],
    total: ["Итого", -10],
  };

  it("is UTF-8 with a BOM, «;» between cells, CRLF between rows, the total last", () => {
    expect(toCsv(sheet)).toBe("﻿Кто;Очки\r\nАйгуль;-10\r\nЕрбол;0\r\nИтого;-10\r\n");
  });

  it("the BOM survives the encoding", () => {
    expect([...new TextEncoder().encode(toCsv(sheet)).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });
});

describe("printCell", () => {
  it("the dash, the real minus, the comma, the sign only where asked", () => {
    expect(printCell(null)).toBe("—");
    expect(printCell("")).toBe("—");
    expect(printCell(0)).toBe("0");
    expect(printCell(0, true)).toBe("0");
    expect(printCell(-10)).toBe("−10");
    expect(printCell(12)).toBe("12");
    expect(printCell(12, true)).toBe("+12");
    expect(printCell(8.5)).toBe("8,5");
    expect(printCell("5 из 7")).toBe("5 из 7");
  });
});

describe("inOrder", () => {
  const row = (id: string) => ({ id });
  const id = (r: { id: string }) => r.id;

  it("follows the screen's order", () => {
    expect(inOrder([row("a"), row("b"), row("c")], id, ["c", "a", "b"]).map(id)).toEqual(["c", "a", "b"]);
  });

  it("keeps the given order for rows the screen did not name, last", () => {
    expect(inOrder([row("a"), row("b"), row("c")], id, ["c"]).map(id)).toEqual(["c", "a", "b"]);
  });

  it("without an order the rows stay as they came", () => {
    expect(inOrder([row("b"), row("a")], id, []).map(id)).toEqual(["b", "a"]);
  });
});

describe("file names and titles", () => {
  it("names the file by the days, two digits each", () => {
    expect(periodFileName("2026-11-01", "2026-11-30")).toBe("Табель 01.11–30.11.csv");
    expect(periodFileName("2026-10-28", "2026-11-03")).toBe("Табель 28.10–03.11.csv");
    expect(dayFileName("2026-11-04")).toBe("Отчёты 04.11.csv");
  });

  it("says the year on paper", () => {
    expect(periodSheetTitle("2026-11-01", "2026-11-30")).toBe("Табель · 01.11.2026 – 30.11.2026");
    expect(daySheetTitle("2026-11-04")).toBe("Отчёты · Среда, 4 ноября 2026");
  });
});

describe("periodSheet", () => {
  it("has the screen's columns, points only while the game is on", () => {
    const titles = (pointsOn: boolean) => periodSheet([], { pointsOn }).columns.map((column) => column.title);
    expect(titles(true)).toEqual(["Сотрудник", "Сдача", "Сдал", "Приход", "Уход", "Часы в день", "Всего", "Задачи сдано", "Задачи принято", "После срока", "Очки"]);
    expect(titles(false)).not.toContain("Очки");
    expect(periodSheet([periodRow({})], { pointsOn: false }).rows[0]).toHaveLength(10);
  });

  it("a row: numbers as numbers, an unknown as empty", () => {
    const sheet = periodSheet([periodRow({})], { pointsOn: true });
    expect(sheet.rows[0]).toEqual(["Айгуль Сапарова", "80%", "8 из 10", "9:05", "18:10", 8.5, 68, 3, 2, 1, -12]);
    const blank = periodSheet([periodRow({ submit_rate: null, submitted: 0, missed: 0, avg_arrived: null, avg_left: null, avg_hours: null, hours_total: 0, points: 0 })], { pointsOn: true });
    expect(blank.rows[0]).toEqual(["Айгуль Сапарова", null, "0 из 0", null, null, null, 0, 3, 2, 1, 0]);
  });

  it("the total is over the rows given", () => {
    const sheet = periodSheet(
      [periodRow({ hours_total: 68.1 }), periodRow({ user_id: "u2", submitted: 4, missed: 0, hours_total: 34.2, handed_over: 1, closed: 1, late: 0, points: 5 })],
      { pointsOn: true },
    );
    expect(sheet.total).toEqual(["Итого", "86%", "12 из 14", null, null, 8.5, 102.3, 4, 3, 1, -7]);
  });

  it("nobody shown: the total says nothing rather than NaN", () => {
    expect(periodSheet([], { pointsOn: false }).total).toEqual(["Итого", null, "0 из 0", null, null, null, 0, 0, 0, 0]);
  });

  it("goes through the file with the signs and zeros intact", () => {
    const text = toCsv(periodSheet([periodRow({ late: 0 })], { pointsOn: true }));
    expect(text.split("\r\n")[1]).toBe("Айгуль Сапарова;80%;8 из 10;9:05;18:10;8,5;68;3;2;0;-12");
  });

  it("a name typed as a formula is guarded in the file", () => {
    expect(toCsv(periodSheet([periodRow({ full_name: "=cmd|'/c calc'!A0" })], { pointsOn: false })).split("\r\n")[1]).toMatch(/^'=cmd/);
  });
});

describe("daySheet", () => {
  it("has the screen's columns, points only while the game is on", () => {
    expect(daySheet([], { pointsOn: true }).columns.map((column) => column.title)).toEqual(["Кто", "Пришёл", "Ушёл", "Часы", "Задачи", "Чем занимался", "Очки"]);
    expect(daySheet([], { pointsOn: false }).columns).toHaveLength(6);
  });

  it("a handed-in report: the times, the hours, the words whole", () => {
    expect(daySheet([dayRow({})], { pointsOn: true }).rows[0]).toEqual(["Айгуль Сапарова", "9:05", "18:10", 9.1, 0, "Смета\nИ акт сверки", 1]);
  });

  it("no report: empty cells and the screen's words, a minus stays a number", () => {
    const missed = dayRow({ state: "missed", hours: null, report: { ...report, status: "missed", arrived_at: null, left_at: null, summary: null, submitted_at: null, points: -10 } });
    const row = daySheet([missed], { pointsOn: true }).rows[0];
    expect(row.slice(0, 5)).toEqual(["Айгуль Сапарова", null, null, null, 0]);
    expect(row[5]).toEqual(expect.any(String));
    expect(row[6]).toBe(-10);
  });

  it("hours count with a handed-in report only", () => {
    const stray = dayRow({ state: "missed", hours: 4, report: null });
    expect(daySheet([stray], { pointsOn: false }).rows[0][3]).toBeNull();
  });

  it("the total: out of everyone shown, as the screen's headline counts", () => {
    const rows = [dayRow({}), dayRow({ user_id: "u2", state: "pending", hours: null, report: null }), dayRow({ user_id: "u3", state: "away", hours: null, report: null })];
    expect(daySheet(rows, { pointsOn: true }).total).toEqual(["Итого", null, null, 9.1, 0, "сдали 1 из 3", 1]);
  });

  it("a day off: the total does not say «из 0»", () => {
    expect(daySheet([dayRow({ state: "off", hours: null, report: null })], { pointsOn: false }).total[5]).toBe("сдали 0");
  });

  it("a multi-line report stays one row of the file", () => {
    const lines = toCsv(daySheet([dayRow({})], { pointsOn: false })).split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('Айгуль Сапарова;9:05;18:10;9,1;0;"Смета\nИ акт сверки"');
  });
});
