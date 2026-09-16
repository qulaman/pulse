import { describe, expect, it } from "vitest";

import { greeting, quietLine, quoteTitle, type BriefTask } from "./briefing";

// 2026-09-11 09:30 Aqtobe (UTC+5)
const NOW = new Date("2026-09-11T04:30:00Z");

const task = (id: string, title: string, assignee: string | null, deadline: string | null = null): BriefTask => ({
  id,
  title,
  assignee,
  deadline,
});

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
    // the cut lands on a word boundary, and a trailing comma does not survive it
    expect(quoteTitle("Сходить за сигаретами в магазин на углу")).toBe("«Сходить за сигаретами в магазин…»");
    expect(quoteTitle("Позвонить, написать, договориться, отчитаться")).toBe("«Позвонить, написать, договориться…»");
  });
});

describe("quietLine", () => {
  it("names the nearest deadline with the person in the nominative", () => {
    expect(quietLine([task("a", "Отчёт", "Марат", "2026-09-11T13:00:00Z")], NOW)).toBe(
      "Пока тихо. 1 задача в работе, ближайший срок сегодня 18:00 (Марат, «Отчёт»).",
    );
  });

  it("names the count of open tasks without a deadline honestly", () => {
    expect(quietLine([task("a", "Без срока", "Марат")], NOW)).toBe("Пока тихо. 1 задача в работе, все без срока.");
    expect(quietLine([], NOW)).toBe("Пока тихо. Задач в работе нет.");
  });
});
