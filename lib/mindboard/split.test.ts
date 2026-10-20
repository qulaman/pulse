import { describe, expect, it } from "vitest";

import { flatLines, splitLabel, splitList } from "./split";

describe("splitList", () => {
  it("takes one line as nothing to split", () => {
    expect(splitList("Новый склад")).toBeNull();
    expect(splitList("Новый склад\n\n   \n")).toBeNull();
  });

  it("makes a point of every line, markers dropped", () => {
    expect(splitList("1. Новый склад\n2) Продажи Q4\n3. Отпуска")).toEqual([
      { text: "Новый склад", children: [] },
      { text: "Продажи Q4", children: [] },
      { text: "Отпуска", children: [] },
    ]);
    expect(splitList("- Склад\n• Продажи\n— Отпуска\n* Офис")?.map((point) => point.text)).toEqual(["Склад", "Продажи", "Отпуска", "Офис"]);
    expect(splitList("Склад\nПродажи")?.map((point) => point.text)).toEqual(["Склад", "Продажи"]);
  });

  it("hangs deeper lines under the point above", () => {
    expect(splitList("Склад\n  аренда\n\tохрана\nПродажи\n    план 120")).toEqual([
      { text: "Склад", children: ["аренда", "охрана"] },
      { text: "Продажи", children: ["план 120"] },
    ]);
  });

  it("reads bullets under numbered points as their details", () => {
    expect(splitList("1. Склад\n- аренда\n- охрана\n2. Продажи\n- план 120")).toEqual([
      { text: "Склад", children: ["аренда", "охрана"] },
      { text: "Продажи", children: ["план 120"] },
    ]);
  });

  it("keeps bullets as points when there is nothing numbered", () => {
    expect(splitList("- Склад\n- Продажи")).toEqual([
      { text: "Склад", children: [] },
      { text: "Продажи", children: [] },
    ]);
  });

  it("never drops a first line that is indented: it becomes a point", () => {
    expect(splitList("   аренда\nСклад")).toEqual([
      { text: "аренда", children: [] },
      { text: "Склад", children: [] },
    ]);
    expect(splitList("- аренда\n1. Склад")).toEqual([
      { text: "аренда", children: [] },
      { text: "Склад", children: [] },
    ]);
  });

  it("measures indent from the list itself, Windows line ends too", () => {
    expect(splitList("  Склад\r\n    аренда\r\n  Продажи")).toEqual([
      { text: "Склад", children: ["аренда"] },
      { text: "Продажи", children: [] },
    ]);
  });

  it("does not take a number inside the words for a marker", () => {
    expect(splitList("2026 год — итоги\n10 человек в отделе")?.map((point) => point.text)).toEqual(["2026 год — итоги", "10 человек в отделе"]);
    expect(splitList("а) Склад\nб) Продажи")?.map((point) => point.text)).toEqual(["Склад", "Продажи"]);
  });
});

describe("splitLabel", () => {
  it("says what the split makes", () => {
    expect(splitLabel([{ text: "a", children: [] }, { text: "b", children: [] }])).toBe("Разбить на 2 пункта");
    expect(splitLabel(Array.from({ length: 5 }, () => ({ text: "x", children: [] })))).toBe("Разбить на 5 пунктов");
    expect(splitLabel([{ text: "a", children: ["1", "2", "3"] }, { text: "b", children: [] }])).toBe("Разбить: 2 пункта · 3 подпункта");
    expect(splitLabel([{ text: "a", children: ["1"] }])).toBe("Разбить: 1 пункт · 1 подпункт");
  });
});

describe("flatLines", () => {
  it("flattens a list for the sub-points of one point", () => {
    expect(flatLines("1. Склад\n- аренда\n2. Продажи")).toEqual(["Склад", "аренда", "Продажи"]);
    expect(flatLines("одна строка")).toEqual([]);
  });
});
