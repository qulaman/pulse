import { describe, expect, it } from "vitest";

import { buildTabel, type TabelMark } from "@/lib/daily-report/tabel";
import type { DailyReport, FeedDay, FeedReport, TeamPeriodRow } from "@/lib/daily-report/types";
import type { ReportPerson, ReportRules } from "@/lib/people/stats";

import {
  csvCell,
  dayFileName,
  daySheetTitle,
  feedFileName,
  feedSheet,
  feedSheetTitle,
  printCell,
  tabelFileName,
  tabelSheet,
  tabelSheetTitle,
  toCsv,
  type ReportSheet,
} from "./report-export";

const report = (patch: Partial<DailyReport>): DailyReport => ({
  id: "r",
  user_id: "u1",
  report_date: "2026-11-04",
  status: "submitted",
  arrived_at: "2026-11-04T04:20:00Z",
  left_at: "2026-11-04T13:02:00Z",
  summary: "Смета\nИ акт сверки",
  tasks: [],
  submitted_at: "2026-11-04T13:04:00Z",
  updated_at: "2026-11-04T13:04:00Z",
  points: 1,
  excused_at: null,
  excused_reason: null,
  ...patch,
});

const feedReport = (patch: Partial<FeedReport>): FeedReport => ({ ...report({}), full_name: "Айгуль Сапарова", position: "Бухгалтер", avatar_url: null, ...patch });

const feedDay = (patch: Partial<FeedDay>): FeedDay => ({
  date: "2026-11-04",
  today: false,
  workday: true,
  due: 5,
  submitted: 2,
  missed: 1,
  excused: 1,
  pending: 0,
  reports: [],
  missed_people: [],
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
    columns: [{ title: "Кто" }, { title: "Сдал", right: true }],
    rows: [
      ["Айгуль", 10],
      ["Ербол", 0],
    ],
    total: ["Итого", 10],
  };

  it("is UTF-8 with a BOM, «;» between cells, CRLF between rows, the total last", () => {
    expect(toCsv(sheet)).toBe("﻿Кто;Сдал\r\nАйгуль;10\r\nЕрбол;0\r\nИтого;10\r\n");
  });

  it("the notes come after an empty line, each a line of its own, guarded like any text", () => {
    expect(toCsv({ ...sheet, notes: ["Обозначения: ✓ сдан", "=1+1"] })).toBe("﻿Кто;Сдал\r\nАйгуль;10\r\nЕрбол;0\r\nИтого;10\r\n\r\nОбозначения: ✓ сдан\r\n'=1+1\r\n");
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

describe("file names and titles", () => {
  it("a calendar month by its name, anything else by its days, the year always", () => {
    expect(tabelFileName("2026-11-01", "2026-11-30")).toBe("Табель отчётов ноябрь 2026.csv");
    expect(tabelFileName("2026-11-03", "2026-11-09")).toBe("Табель отчётов 3–9 нояб. 2026.csv");
    expect(tabelFileName("2026-10-26", "2026-11-01")).toBe("Табель отчётов 26 окт. – 1 нояб. 2026.csv");
    expect(tabelSheetTitle("2026-11-01", "2026-11-30")).toBe("Табель отчётов · ноябрь 2026");
  });

  it("the day by its date and year", () => {
    expect(dayFileName("2026-11-04")).toBe("Отчёты 4 ноября 2026.csv");
    expect(daySheetTitle("2026-11-04")).toBe("Отчёты · Среда, 4 ноября 2026");
  });
});

describe("tabelSheet", () => {
  // Thursday the 12th; the tick closed the 10th; the 3rd is a holiday
  const TODAY = "2026-11-12";
  const RULES: ReportRules = { enabled: true, workdays: [1, 2, 3, 4, 5], holidays: ["2026-11-03"], started_on: "2026-10-01", checked_on: "2026-11-10" };
  const PERSON: ReportPerson = { is_active: true, role: "employee", availability: "active", created_at: "2026-09-01T04:00:00Z" };
  const handed = (day: string): TabelMark => ({ status: "submitted", arrived_at: `${day}T04:20:00Z`, left_at: `${day}T13:02:00Z` });
  const missed: TabelMark = { status: "missed", arrived_at: null, left_at: null };
  const row = (user_id: string, full_name: string): TeamPeriodRow => ({
    user_id,
    full_name,
    position: null,
    avatar_url: null,
    workdays: 0,
    submitted: 0,
    missed: 0,
    excused: 0,
    submit_rate: null,
    avg_arrived: null,
    avg_left: null,
    avg_hours: 8.7,
    hours_total: 87,
    handed_over: 0,
    closed: 0,
    on_time: 0,
    late: 0,
    points: -20,
  });
  const make = (marks: Map<string, Map<string, TabelMark>>, people = new Map<string, ReportPerson>([["a", PERSON], ["b", { ...PERSON, availability: "sick" }]])) =>
    buildTabel({ from: "2026-11-02", to: "2026-11-15", today: TODAY, rows: [row("b", "=Бауыржан"), row("a", "Айгуль")], marks, rules: RULES, people });
  const tabel = make(
    new Map([
      [
        "a",
        new Map<string, TabelMark>([
          ["2026-11-02", handed("2026-11-02")],
          ["2026-11-04", { ...missed, excused_at: "2026-11-05T05:00:00Z", excused_reason: "болел" }],
          ["2026-11-05", missed],
          ["2026-11-06", handed("2026-11-06")],
        ]),
      ],
    ]),
  );
  const sheet = tabelSheet(tabel, tabel.people);

  it("a column a day titled by its number, the weekday and the day off for the paper, then the totals", () => {
    const titles = sheet.columns.map((column) => column.title);
    expect(titles).toEqual(["Сотрудник", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "Сдал", "Не сдал", "Уваж.", "Доля"]);
    expect(sheet.columns[1]).toMatchObject({ day: true, sub: "пн", dim: false });
    expect(sheet.columns[2]).toMatchObject({ sub: "вт", dim: true });
    expect(sheet.columns[6]).toMatchObject({ sub: "сб", dim: true });
  });

  it("the accountant's short words in the cells, numbers in the totals, no hours, no points", () => {
    const a = sheet.rows.find((cells) => cells[0] === "Айгуль")!;
    const b = sheet.rows.find((cells) => cells[0] === "=Бауыржан")!;
    // the 9th and 10th closed by the tick without a row: away, the kind unknown; the 11th not closed yet: missed
    expect(a).toEqual(["Айгуль", "✓", "пр.", "ув.", "✕", "✓", "вых.", "вых.", "о/б", "о/б", "✕", null, null, "вых.", "вых.", 2, 2, 1, "50%"]);
    // sick now: the closed days do not say which, the open ones do
    expect(b.slice(1, 15)).toEqual(["о/б", "пр.", "о/б", "о/б", "о/б", "вых.", "вых.", "о/б", "о/б", "бол.", "бол.", null, "вых.", "вых."]);
    expect(b.slice(15)).toEqual([0, 0, 0, null]);
    expect(sheet.rows.flat()).not.toContain(-20);
    expect(sheet.rows.flat()).not.toContain(87);
  });

  it("«Итого»: who did not hand in each day it was due, empty where nothing was, the totals of the shown", () => {
    expect(sheet.total).toEqual(["Итого", 0, null, 0, 1, 0, null, null, 0, 0, 1, 0, null, null, null, 2, 2, 1, "50%"]);
    const sick = tabel.people.find((person) => person.row.user_id === "b")!;
    expect(tabelSheet(tabel, [sick]).total.slice(-4)).toEqual([0, 0, 0, null]);
  });

  it("«Уваж.» only when anybody has one", () => {
    const plain = make(new Map([["a", new Map([["2026-11-05", missed]])]]));
    expect(tabelSheet(plain, plain.people).columns.map((column) => column.title)).not.toContain("Уваж.");
  });

  it("the file: the legend after an empty line, a name typed as a formula guarded", () => {
    const lines = toCsv(sheet).split("\r\n");
    expect(lines).toContain("Айгуль;✓;пр.;ув.;✕;✓;вых.;вых.;о/б;о/б;✕;;;вых.;вых.;2;2;1;50%");
    expect(lines.some((line) => line.startsWith("'=Бауыржан;"))).toBe(true);
    expect(lines[4]).toBe("");
    expect(lines[5]).toMatch(/^Обозначения: ✓ сдан · ✕ не сдан · ув\. уважительная причина/);
    expect(lines[5]).toContain("часов и очков в нём нет");
  });
});

describe("feedSheet", () => {
  const days = [
    feedDay({
      date: "2026-11-03",
      reports: [feedReport({ id: "o", report_date: "2026-11-03", submitted_at: "2026-11-03T12:00:00Z", summary: "Старый" })],
    }),
    feedDay({
      reports: [
        feedReport({
          id: "s2",
          full_name: "Жанна",
          summary: "  ",
          submitted_at: "2026-11-05T03:05:00Z",
          checked_at: "2026-11-05T04:10:00Z",
          tasks: [{ id: "t", title: "Акт сверки", status: "done", completed_at: null, closed_at: null, on_time: true }],
        }),
        feedReport({ id: "s1" }),
      ],
      missed_people: [
        { user_id: "m", full_name: "Дана", avatar_url: null, excused: false, report_id: "rm" },
        { user_id: "e", full_name: "Арман", avatar_url: null, excused: true, report_id: "re" },
      ],
    }),
  ];
  const sheet = feedSheet(days);

  it("the columns of «Подряд»: no arrival, no leaving, no hours, no points", () => {
    expect(sheet.columns.map((column) => column.title)).toEqual(["День", "Сотрудник", "Состояние", "Сдан в", "Задачи", "Что сделано"]);
    expect(sheet.rows.flat()).not.toContain(1);
    expect(sheet.rows.flat().join(" ")).not.toMatch(/9:20|18:02|\d,\d ч/);
  });

  it("newest day first, its reports as on screen, then who did not hand one in", () => {
    expect(sheet.rows.map((row) => `${row[0]} ${row[1]}`)).toEqual(["04.11 Жанна", "04.11 Айгуль Сапарова", "04.11 Дана", "04.11 Арман", "03.11 Айгуль Сапарова"]);
  });

  it("a report: when it came (another day says it), the director's check, the words whole", () => {
    expect(sheet.rows[1]).toEqual(["04.11", "Айгуль Сапарова", "сдан", "18:04", null, "Смета\nИ акт сверки"]);
    expect(sheet.rows[0]).toEqual(["04.11", "Жанна", "сдан, проверено 9:10", "05.11 8:05", "Акт сверки — принята · в срок", null]);
  });

  it("a missed day in plain words; the total counts the reports and their tasks", () => {
    expect(sheet.rows[2].slice(2)).toEqual(["не сдан", null, null, null]);
    expect(sheet.rows[3][2]).toBe("уважительная");
    expect(sheet.total).toEqual(["Итого", null, "отчётов 3", null, "задач 1", null]);
  });

  it("names the file and the paper by the days on screen", () => {
    expect(feedFileName(days)).toBe("Отчёты 3–4 нояб. 2026.csv");
    expect(feedSheetTitle(days)).toBe("Отчёты · 3–4 нояб. 2026");
    expect(feedFileName([days[1]])).toBe("Отчёты 4 ноября 2026.csv");
    expect(feedSheetTitle([])).toBe("Отчёты");
  });

  it("a multi-line report stays one row of the file", () => {
    const lines = toCsv(feedSheet([feedDay({ reports: [feedReport({})] })])).split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('04.11;Айгуль Сапарова;сдан;18:04;;"Смета\nИ акт сверки"');
  });
});
