import { describe, expect, it } from "vitest";

import type { BriefLine } from "./briefing";
import { ALL_HANDLED_PREFIX, isHandled, mergeLines } from "./merge";

const greeting: BriefLine = { id: "greeting", kind: "greeting", text: "Добрый день, Тест." };
const quiet: BriefLine = { id: "quiet", kind: "quiet", tone: "ok", text: "Пока тихо. 1 задача в работе." };
const verdict: BriefLine = { id: "verdict", kind: "verdict", tone: "warn", text: "1 отказ. По порядку:" };
const declined: BriefLine = { id: "declined:Марат", kind: "fact", tone: "warn", text: "Марат не может «X»", taskIds: ["t1"] };
const news: BriefLine = { id: "accepted:Марат", kind: "fact", tone: "muted", text: "Марат принял «Y»", taskIds: ["t2"] };

describe("mergeLines", () => {
  it("a first briefing is taken as is", () => {
    expect(mergeLines([], [greeting, quiet])).toEqual([greeting, quiet]);
  });

  it("facts arriving after «Пока тихо» are appended without a verdict", () => {
    const merged = mergeLines([greeting, quiet], [greeting, verdict, declined]);
    expect(merged.map((l) => l.id)).toEqual(["greeting", "quiet", "declined:Марат"]);
  });

  it("closes with «Всё разобрано» once the verdict's facts are gone, and only once", () => {
    const merged = mergeLines([greeting, verdict, declined], [greeting, quiet]);
    expect(merged.map((l) => l.id)).toEqual(["greeting", "verdict", "declined:Марат", "quiet:after"]);
    expect(merged[3].text).toBe(`${ALL_HANDLED_PREFIX} 1 задача в работе.`);
    const again = mergeLines(merged, [greeting, { ...quiet, text: "Пока тихо. Задач в работе нет." }]);
    expect(again.filter((l) => l.kind === "quiet")).toHaveLength(1);
    expect(again[3].text).toBe(`${ALL_HANDLED_PREFIX} Задач в работе нет.`);
  });

  it("closes under facts that followed «Пока тихо», leaving the quiet line as it was said", () => {
    const spoken = mergeLines([greeting, quiet], [greeting, verdict, declined]);
    const merged = mergeLines(spoken, [greeting, { ...quiet, text: "Пока тихо. Задач в работе нет." }]);
    expect(merged.map((l) => l.id)).toEqual(["greeting", "quiet", "declined:Марат", "quiet:after"]);
    expect(merged[1].text).toBe(quiet.text);
    expect(merged[3].text).toBe(`${ALL_HANDLED_PREFIX} Задач в работе нет.`);
  });

  it("news alone does not earn a closing line", () => {
    const merged = mergeLines([greeting, quiet, news], [greeting, { ...quiet, text: "Пока тихо. Задач в работе нет." }]);
    expect(merged.map((l) => l.id)).toEqual(["greeting", "quiet", "accepted:Марат"]);
    expect(merged[1].text).toBe("Пока тихо. Задач в работе нет.");
  });

  it("updates a line's text in place and never drops what was said", () => {
    const merged = mergeLines([greeting, verdict, declined], [greeting, { ...verdict, text: "1 отказ, 1 вопрос. По порядку:" }]);
    expect(merged).toHaveLength(3);
    expect(merged[1].text).toBe("1 отказ, 1 вопрос. По порядку:");
    expect(merged[2]).toBe(declined);
  });

  it("returns the same array when nothing changed", () => {
    const snapshot = [greeting, verdict, declined];
    expect(mergeLines(snapshot, [greeting, verdict, declined])).toBe(snapshot);
  });
});

describe("isHandled", () => {
  it("a fact is handled when its tasks left the director's attention", () => {
    expect(isHandled(declined, new Set(["t1"]), new Set())).toBe(false);
    expect(isHandled(declined, new Set(), new Set())).toBe(true);
  });

  it("news is over when its tasks are no longer in work — and never before the open list is known", () => {
    expect(isHandled(news, new Set(), null)).toBe(false);
    expect(isHandled(news, new Set(), new Set(["t2"]))).toBe(false);
    expect(isHandled(news, new Set(), new Set(["t9"]))).toBe(true);
  });

  it("state and greeting lines are never handled", () => {
    expect(isHandled(verdict, new Set(), new Set())).toBe(false);
    expect(isHandled(quiet, new Set(), new Set())).toBe(false);
  });
});
