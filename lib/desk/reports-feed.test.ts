import { describe, expect, it } from "vitest";

import type { FeedReport } from "@/lib/daily-report/types";

import { allChecked, checkableIds, checkedText, dayCountLine, dayHead, highlightParts, landingDay, neighbourDay, nextUnchecked } from "./reports-feed";

const report = (id: string, marks: Partial<FeedReport> = {}): FeedReport => ({
  id,
  user_id: `u-${id}`,
  report_date: "2026-11-25",
  status: "submitted",
  arrived_at: null,
  left_at: null,
  summary: "слова",
  tasks: [],
  submitted_at: "2026-11-25T12:52:00Z",
  updated_at: "2026-11-25T12:52:00Z",
  points: 0,
  excused_at: null,
  excused_reason: null,
  full_name: "Сергей Волков",
  position: null,
  avatar_url: null,
  ...marks,
});

describe("dayHead", () => {
  it("says today and yesterday by name with the weekday beside, older days by weekday, another year with it", () => {
    expect(dayHead("2026-11-25", "2026-11-25")).toEqual({ name: "Сегодня", date: "среда, 25 ноября" });
    expect(dayHead("2026-11-24", "2026-11-25")).toEqual({ name: "Вчера", date: "вторник, 24 ноября" });
    expect(dayHead("2026-11-23", "2026-11-25")).toEqual({ name: "Понедельник", date: "23 ноября" });
    expect(dayHead("2025-12-30", "2026-01-02")).toEqual({ name: "Вторник", date: "30 декабря 2025" });
  });
});

describe("dayCountLine", () => {
  it("counts who owed the report; a day nothing was due says what day it was", () => {
    expect(dayCountLine({ due: 10, submitted: 4, workday: true }, false)).toBe("сдали 4 из 10");
    expect(dayCountLine({ due: 0, submitted: 0, workday: false }, false)).toBe("выходной");
    expect(dayCountLine({ due: 0, submitted: 0, workday: false }, true)).toBe("праздник");
    expect(dayCountLine({ due: 0, submitted: 0, workday: true }, false)).toBe("отчёт не нужен");
  });
});

describe("checking", () => {
  const day = [report("a", { seen_at: "x" }), report("b"), report("c", { seen_at: "x", checked_at: "y" }), report("d", { seen_at: "x", status: "missed" })];

  it("«Проверить все» takes only the seen and not checked handed-in reports", () => {
    expect(checkableIds(day)).toEqual(["a"]);
  });

  it("«все проверены» only when every handed-in report is", () => {
    expect(allChecked(day)).toBe(false);
    expect(allChecked([report("a", { checked_at: "y" }), report("m", { status: "missed" })])).toBe(true);
    expect(allChecked([])).toBe(false);
  });

  it("says the batch in words", () => {
    expect(checkedText(1)).toBe("Проверено 1 отчёт");
    expect(checkedText(3)).toBe("Проверено 3 отчёта");
    expect(checkedText(5)).toBe("Проверено 5 отчётов");
  });

  it("A moves on to the next report that waits: below first, then from the top", () => {
    const waits = new Set(["a", "d"]);
    expect(nextUnchecked(["a", "b", "c", "d"], "b", (id) => waits.has(id))).toBe("d");
    expect(nextUnchecked(["a", "b", "c", "d"], "d", (id) => waits.has(id))).toBe("a");
    expect(nextUnchecked(["a", "b"], "a", () => false)).toBeNull();
    expect(nextUnchecked(["a", "b"], null, (id) => id === "b")).toBe("b");
  });
});

describe("highlightParts", () => {
  it("marks every typed word in any case, ё as е, overlaps merged", () => {
    expect(highlightParts("Смета по Северному, смета на кровлю", "смета")).toEqual([
      { text: "Смета", hit: true },
      { text: " по Северному, ", hit: false },
      { text: "смета", hit: true },
      { text: " на кровлю", hit: false },
    ]);
    expect(highlightParts("Ещё раз", "еще").map((part) => part.hit)).toEqual([true, false]);
    expect(highlightParts("абвгд", "абв бвг")).toEqual([
      { text: "абвг", hit: true },
      { text: "д", hit: false },
    ]);
  });

  it("leaves the words whole without a search or a match; one letter is no search", () => {
    expect(highlightParts("слова", "")).toEqual([{ text: "слова", hit: false }]);
    expect(highlightParts("слова", "я")).toEqual([{ text: "слова", hit: false }]);
    expect(highlightParts("слова", "кот")).toEqual([{ text: "слова", hit: false }]);
    expect(highlightParts("", "кот")).toEqual([]);
  });
});

describe("days of the feed", () => {
  const days = ["2026-11-25", "2026-11-24", "2026-11-20"];

  it("← goes to an older day, → to a newer one, nothing past the edge", () => {
    expect(neighbourDay(days, "2026-11-24", -1)).toBe("2026-11-20");
    expect(neighbourDay(days, "2026-11-24", 1)).toBe("2026-11-25");
    expect(neighbourDay(days, "2026-11-25", 1)).toBeNull();
    expect(neighbourDay(days, null, -1)).toBe("2026-11-24");
  });

  it("a jump lands on the day or the first older one listed", () => {
    expect(landingDay(days, "2026-11-22")).toBe("2026-11-20");
    expect(landingDay(days, "2026-11-24")).toBe("2026-11-24");
    expect(landingDay(days, "2026-11-01")).toBeNull();
  });
});
