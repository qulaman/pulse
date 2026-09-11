import { describe, expect, it } from "vitest";

import { buildBriefing, greeting, quietLine, quoteTitle, MAX_FACTS, type BriefTask } from "./briefing";

// 2026-09-11 09:30 Aqtobe (UTC+5)
const NOW = new Date("2026-09-11T04:30:00Z");

const task = (id: string, title: string, assignee: string | null, deadline: string | null = null): BriefTask => ({
  id,
  title,
  assignee,
  deadline,
});

const EMPTY = { now: NOW, directorName: "Асхат", overdue: [], questions: [], review: [], accepted: [], open: [] };

describe("greeting", () => {
  it.each([
    ["2026-09-11T00:30:00Z", "Доброе утро, Асхат."], // 05:30 Aqtobe
    ["2026-09-11T06:00:00Z", "Доброе утро, Асхат."], // 11:00
    ["2026-09-11T07:00:00Z", "Добрый день, Асхат."], // 12:00
    ["2026-09-11T13:00:00Z", "Добрый вечер, Асхат."], // 18:00
    ["2026-09-11T21:30:00Z", "Доброй ночи, Асхат."], // 02:30 next day
  ])("%s → %s", (iso, expected) => {
    expect(greeting(new Date(iso), "Асхат")).toBe(expected);
  });

  it("no name — no comma", () => {
    expect(greeting(NOW, "")).toBe("Доброе утро.");
  });
});

describe("quoteTitle", () => {
  it("quotes and trims long titles with an ellipsis", () => {
    expect(quoteTitle("КП по Казхрому")).toBe("«КП по Казхрому»");
    const long = quoteTitle("Подготовить коммерческое предложение по Казхрому до конца недели");
    expect(long.length).toBeLessThanOrEqual(38);
    expect(long.endsWith("…»")).toBe(true);
  });
});

describe("buildBriefing", () => {
  it("starts with the greeting and says it is quiet when nothing needs the director", () => {
    const lines = buildBriefing({ ...EMPTY, open: [task("a", "Отчёт", "Марат", "2026-09-11T13:00:00Z")] });
    expect(lines.map((l) => l.kind)).toEqual(["greeting", "quiet"]);
    expect(lines[1]!.text).toBe("Пока тихо. 1 задача в работе, ближайший срок сегодня 18:00 (Марат, «Отчёт»).");
  });

  it("orders facts overdue → questions → review, grouped by person", () => {
    const lines = buildBriefing({
      ...EMPTY,
      review: [task("r1", "КП по Казхрому", "Марат"), task("r2", "Смета", "Марат")],
      questions: [task("q1", "Сроки КП", "Динара")],
      overdue: [task("o1", "Отчёт по складу", "Тимур", "2026-09-10T13:00:00Z")],
    });
    expect(lines.map((l) => l.kind)).toEqual(["greeting", "verdict", "fact", "fact", "fact"]);
    expect(lines[1]!.text).toBe("1 просрочка, 1 вопрос, 2 на приёмке. По порядку:");
    expect(lines[1]!.tone).toBe("danger");
    expect(lines[2]!.text).toBe("Тимур просрочил «Отчёт по складу», срок был вчера 18:00");
    expect(lines[3]!.text).toBe("Динара спрашивает по «Сроки КП»");
    expect(lines[4]!.text).toBe("Марат сдал 2 задачи, ждут приёмки");
    expect(lines[4]!.taskIds).toEqual(["r1", "r2"]);
  });

  it("a refusal comes right after the overdue, with the reason in running text", () => {
    const lines = buildBriefing({
      ...EMPTY,
      overdue: [task("o1", "Отчёт", "Тимур", "2026-09-10T13:00:00Z")],
      declined: [{ ...task("d1", "Смета по складу", "Ерлан"), reason: "Занят срочным" }],
      review: [task("r1", "КП", "Марат")],
    });
    expect(lines[1]!.text).toBe("1 просрочка, 1 отказ, 1 на приёмке. По порядку:");
    expect(lines.map((l) => l.id)).toEqual(["greeting", "verdict", "overdue:Тимур", "declined:Ерлан", "review:Марат"]);
    expect(lines[3]!.text).toBe("Ерлан не может «Смета по складу»: занят срочным");
    expect(lines[3]!.tone).toBe("warn");
  });

  it("tells accepted tasks as news after the facts, with the time", () => {
    const lines = buildBriefing({
      ...EMPTY,
      accepted: [{ task: task("a1", "КП", "Марат"), at: "2026-09-11T04:14:00Z" }],
    });
    expect(lines.map((l) => l.kind)).toEqual(["greeting", "quiet", "fact"]);
    expect(lines[2]!.text).toBe("Марат принял «КП» сегодня 09:14");
    expect(lines[2]!.tone).toBe("muted");
  });

  it("folds everything past the limit into «и ещё N»", () => {
    const review = Array.from({ length: MAX_FACTS + 3 }, (_, i) => task(`r${i}`, `Задача ${i}`, `Человек${i}`));
    const lines = buildBriefing({ ...EMPTY, review });
    const facts = lines.filter((l) => l.kind === "fact");
    expect(facts).toHaveLength(MAX_FACTS);
    const more = lines.at(-1)!;
    expect(more.kind).toBe("more");
    expect(more.text).toBe("И ещё 3 — в «Задачах»");
    expect(more.taskIds).toHaveLength(3);
  });

  it("names the count of open tasks without a deadline honestly", () => {
    expect(quietLine([task("a", "Без срока", "Марат")], NOW)).toBe("Пока тихо. 1 задача в работе, все без срока.");
    expect(quietLine([], NOW)).toBe("Пока тихо. Задач в работе нет.");
  });
});
