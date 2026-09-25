import { describe, expect, it } from "vitest";

import { emWidth, lineWidth, snugWidth, textLines, wrapLines } from "./boardText";

describe("wrapLines", () => {
  it("короткий текст — одна строка, пустой — тоже одна", () => {
    expect(wrapLines("Отгрузка Казхром", 40)).toBe(1);
    expect(wrapLines("", 10)).toBe(1);
    expect(wrapLines("   ", 10)).toBe(1);
  });

  it("переносит по словам, не разрывая слово", () => {
    // «Новый прайс на мерч» ≈ 10 em: в 6 em — две строки, в 12 — одна
    const text = "Новый прайс на мерч";
    expect(wrapLines(text, 12)).toBe(1);
    expect(wrapLines(text, 6)).toBe(2);
  });

  it("слово длиннее строки рвётся где угодно", () => {
    const word = "Ааааааааааааааааааааааааааааааааааааааааа"; // 41 letters ≈ 22.8 em
    expect(wrapLines(word, 10)).toBe(3);
  });

  it("чем уже колонка, тем больше строк — никогда не меньше", () => {
    const text = "Надо срочно решить вопрос с парковкой для гостей и сотрудников, потому что соседи жалуются уже третью неделю";
    let prev = 0;
    for (const width of [80, 60, 40, 30, 20, 12, 8]) {
      const lines = wrapLines(text, width);
      expect(lines).toBeGreaterThanOrEqual(prev);
      prev = lines;
    }
  });
});

describe("textLines и lineWidth", () => {
  it("режет по max и говорит, что обрезал", () => {
    const long = "слово ".repeat(80);
    expect(textLines(long, 30, 3, 2, "point")).toMatchObject({ lines: 2, clamped: true });
    expect(textLines(long, 30, 3, 2, "point").all).toBeGreaterThan(2);
    expect(textLines("Коротко", 30, 3, 2, "point")).toEqual({ lines: 1, clamped: false, all: 1 });
  });

  it("широкие буквы шире узких, запас гарнитуры — сверху", () => {
    expect(emWidth("ЖЖЖ")).toBeGreaterThan(emWidth("иии"));
    expect(lineWidth("Кофе", 3, "leaf")).toBeGreaterThan(lineWidth("Кофе", 3, "title"));
  });

  it("«→ Марат» не рвётся на стрелке, а стрелка Golos — широкая (1.09 em в Chrome)", () => {
    // with a plain space the arrow may end a line («ааааа →» / «Марат»); with the
    // non-breaking one «→ Марат» is one word, wider than this line, and is broken as one
    expect(wrapLines("ааааа → Марат", 4.2)).toBe(2);
    expect(wrapLines("ааааа → Марат", 4.2)).toBe(3);
    expect(emWidth("→")).toBeGreaterThanOrEqual(1.08);
    expect(emWidth("→ Марат")).toBeCloseTo(emWidth("→ Марат"), 5);
  });
});

describe("snugWidth", () => {
  const text = "Новый прайс на мерч — согласовать с бухгалтерией";

  it("многострочный текст — самая узкая колонка с тем же числом строк", () => {
    const width = 40;
    const lines = textLines(text, width, 4, 4, "point").lines;
    const snug = snugWidth(text, width, 4, 4, "point");
    expect(snug).toBeLessThan(width);
    expect(textLines(text, snug, 4, 4, "point").all).toBe(lines);
    // a hair narrower and the text needs another line
    expect(textLines(text, snug - 0.5, 4, 4, "point").all).toBeGreaterThan(lines);
  });

  it("одна строка — ширина строки; обрезанный текст — вся колонка", () => {
    expect(snugWidth("Коротко", 40, 4, 2, "point")).toBeCloseTo(lineWidth("Коротко", 4, "point"), 5);
    expect(snugWidth("слово ".repeat(80), 30, 3, 2, "point")).toBe(30);
  });
});
