import { describe, expect, it } from "vitest";

import type { Note } from "@/lib/notes/queries";
import type { TvState } from "@/lib/tv/queries";

import {
  boardExpiresAt,
  boardOnWall,
  boardSummary,
  cleanTitle,
  defaultTitle,
  boardText,
  nextPosition,
  nextTitle,
  openPoints,
  pointsOf,
  previewOf,
  positionBetween,
  splitBoards,
  summariesOf,
  summaryLine,
} from "./list";
import type { MindBoard } from "./queries";

function point(overrides: Partial<Note> = {}): Note {
  return {
    id: crypto.randomUUID(),
    company_id: "c-1",
    user_id: "u-1",
    text: "Пункт",
    raw_transcript: null,
    audio_path: null,
    inbox_item_id: null,
    pinned: false,
    converted_task_id: null,
    converted_announcement_id: null,
    converted_at: null,
    deleted_at: null,
    remind_at: null,
    reminded_at: null,
    parent_id: null,
    board_id: "b-1",
    position: 1,
    done_at: null,
    client_request_id: null,
    created_at: "2026-09-23T05:00:00Z",
    updated_at: "2026-09-23T05:00:00Z",
    ...overrides,
  };
}

function board(overrides: Partial<MindBoard> = {}): MindBoard {
  return {
    id: "b-1",
    company_id: "c-1",
    user_id: "u-1",
    title: "Планёрка",
    deleted_at: null,
    pinned_at: null,
    finished_at: null,
    client_request_id: null,
    created_at: "2026-09-23T05:00:00Z",
    updated_at: "2026-09-23T05:00:00Z",
    ...overrides,
  };
}

// 2026-09-23 12:00 in Aqtobe (UTC+5)
const NOW = new Date("2026-09-23T07:00:00Z");

describe("pointsOf", () => {
  it("keeps the live points of one board in the order of the board", () => {
    const third = point({ text: "третий", position: 3 });
    const first = point({ text: "первый", position: 1 });
    const moved = point({ text: "между", position: 1.5 });
    const gone = point({ text: "удалён", position: 2, deleted_at: "2026-09-23T06:00:00Z" });
    const other = point({ text: "чужая доска", board_id: "b-2" });
    const loose = point({ text: "мысль", board_id: null, position: null });

    expect(pointsOf([third, first, moved, gone, other, loose], "b-1").map((p) => p.text)).toEqual(["первый", "между", "третий"]);
  });

  it("breaks a tie of places by the time the point was said", () => {
    const later = point({ text: "позже", position: 2, created_at: "2026-09-23T06:00:00Z" });
    const earlier = point({ text: "раньше", position: 2, created_at: "2026-09-23T05:30:00Z" });
    expect(pointsOf([later, earlier], "b-1").map((p) => p.text)).toEqual(["раньше", "позже"]);
  });
});

describe("boardSummary and summariesOf", () => {
  it("counts the points, the ticked ones and the latest", () => {
    const summary = boardSummary([
      point({ done_at: "2026-09-23T06:00:00Z", created_at: "2026-09-23T05:00:00Z" }),
      point({ created_at: "2026-09-23T06:30:00Z" }),
    ]);
    expect(summary).toEqual({ total: 2, subs: 0, done: 1, lastAt: "2026-09-23T06:30:00Z" });
  });

  it("counts sub-points apart and ticks by the points, as the wall does (D-121)", () => {
    const a = point({ id: "a" });
    const summary = boardSummary([
      a,
      point({ id: "a1", parent_id: "a", done_at: "2026-09-23T06:00:00Z", created_at: "2026-09-23T07:00:00Z" }),
      point({ id: "a2", parent_id: "a" }),
      point({ id: "b", done_at: "2026-09-23T06:00:00Z" }),
      // its point is not among the rows: drawn as a point, counted as one
      point({ id: "orphan", parent_id: "gone" }),
    ]);
    expect(summary).toMatchObject({ total: 3, subs: 2, done: 1, lastAt: "2026-09-23T07:00:00Z" });
  });

  it("files the live points of every board from one cache", () => {
    const map = summariesOf([
      point({ board_id: "b-1" }),
      point({ board_id: "b-1", done_at: "2026-09-23T06:00:00Z" }),
      point({ board_id: "b-2" }),
      point({ board_id: "b-2", deleted_at: "2026-09-23T06:00:00Z" }),
      point({ board_id: null, position: null }),
    ]);
    expect(map.get("b-1")?.total).toBe(2);
    expect(map.get("b-1")?.done).toBe(1);
    expect(map.get("b-2")?.total).toBe(1);
    expect(map.size).toBe(2);
  });
});

describe("places", () => {
  it("puts a new point after the last one", () => {
    expect(nextPosition([])).toBe(1);
    expect(nextPosition([{ position: 1 }, { position: 3 }, { position: 2.5 }])).toBe(4);
    expect(nextPosition([{ position: 1.5 }])).toBe(2);
  });

  it("moves a point between its new neighbours, or one past the edge", () => {
    expect(positionBetween(1, 2)).toBe(1.5);
    expect(positionBetween(null, 1)).toBe(0);
    expect(positionBetween(3, null)).toBe(4);
    expect(positionBetween(null, null)).toBe(1);
  });
});

describe("titles", () => {
  it("names a new board by the Aqtobe date", () => {
    expect(defaultTitle(NOW)).toMatch(/^Доска · 23 сент/);
    // 23:30 UTC is already the 24th in Aqtobe
    expect(defaultTitle(new Date("2026-09-23T19:30:00Z"))).toMatch(/^Доска · 24 сент/);
  });

  it("keeps a clean title of one to 120 characters, else the old one", () => {
    expect(cleanTitle("  Планёрка   понедельник ", "Доска")).toBe("Планёрка понедельник");
    expect(cleanTitle("   ", "Доска")).toBe("Доска");
    expect(cleanTitle("я".repeat(200), "Доска")).toHaveLength(120);
  });
});

describe("boardOnWall", () => {
  const wall = (overrides: Partial<TvState>) => ({ scene: "board", board_id: "b-1", board_until: "2026-09-23T16:00:00Z", ...overrides }) as TvState;

  it("is on the wall while the board scene shows this board and its time is not over", () => {
    expect(boardOnWall(wall({}), "b-1", NOW)).toBe(true);
    expect(boardOnWall(wall({}), "b-2", NOW)).toBe(false);
    expect(boardOnWall(wall({ scene: "clock" }), "b-1", NOW)).toBe(false);
    expect(boardOnWall(wall({ board_until: "2026-09-23T06:00:00Z" }), "b-1", NOW)).toBe(false);
    expect(boardOnWall(null, "b-1", NOW)).toBe(false);
  });
});

describe("splitBoards", () => {
  it("keeps live boards latest first and the bin for three days", () => {
    const old = board({ id: "old", updated_at: "2026-09-20T05:00:00Z" });
    const fresh = board({ id: "fresh", updated_at: "2026-09-23T05:00:00Z" });
    const binned = board({ id: "binned", deleted_at: "2026-09-22T05:00:00Z" });
    const expired = board({ id: "expired", deleted_at: "2026-09-19T05:00:00Z" });

    const { live, trash } = splitBoards([old, fresh, binned, expired], NOW);
    expect(live.map((b) => b.id)).toEqual(["fresh", "old"]);
    expect(trash.map((b) => b.id)).toEqual(["binned"]);
    expect(boardExpiresAt(binned).toISOString()).toBe("2026-09-25T05:00:00.000Z");
  });
  it("puts the board on the wall first, the pinned next, and the finished apart (D-140)", () => {
    const old = board({ id: "old", updated_at: "2026-09-20T05:00:00Z" });
    const fresh = board({ id: "fresh", updated_at: "2026-09-23T05:00:00Z" });
    const pinned = board({ id: "pinned", updated_at: "2026-09-10T05:00:00Z", pinned_at: "2026-09-21T05:00:00Z" });
    const pinnedLater = board({ id: "pinned-later", updated_at: "2026-09-01T05:00:00Z", pinned_at: "2026-09-22T05:00:00Z" });
    const done = board({ id: "done", finished_at: "2026-09-22T05:00:00Z" });
    const doneLater = board({ id: "done-later", finished_at: "2026-09-23T05:00:00Z" });
    const binnedDone = board({ id: "binned-done", finished_at: "2026-09-22T05:00:00Z", deleted_at: "2026-09-22T06:00:00Z" });

    const piles = splitBoards([old, fresh, pinned, pinnedLater, done, doneLater, binnedDone], NOW, "old");
    expect(piles.live.map((b) => b.id)).toEqual(["old", "pinned-later", "pinned", "fresh"]);
    expect(piles.finished.map((b) => b.id)).toEqual(["done-later", "done"]);
    expect(piles.trash.map((b) => b.id)).toEqual(["binned-done"]);
    expect(splitBoards([fresh, pinned], NOW).live.map((b) => b.id)).toEqual(["pinned", "fresh"]);
  });
});

describe("nextTitle", () => {
  it("moves the date of the meeting to today", () => {
    expect(nextTitle("Планёрка · 16 сент.", NOW)).toBe("Планёрка · 23 сент.");
    expect(nextTitle("Доска · 3 мая", NOW)).toBe("Доска · 23 сент.");
    expect(nextTitle("Совещание по складу", NOW)).toBe("Совещание по складу · 23 сент.");
    expect(nextTitle(" · 1 сент.", NOW)).toBe("Доска · 23 сент.");
    // a number with a word that is not a month is the director's, not a date
    expect(nextTitle("Склад · 2 этаж", NOW)).toBe("Склад · 2 этаж · 23 сент.");
    expect(nextTitle("Отдел · 3 смены · 16 сент.", NOW)).toBe("Отдел · 3 смены · 23 сент.");
    // every month the date is written with
    for (const month of ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."]) {
      expect(nextTitle(`Планёрка · 5 ${month}`, NOW)).toBe("Планёрка · 23 сент.");
    }
  });
});

describe("openPoints, previewOf, boardText", () => {
  const rows = [
    point({ id: "p1", text: "Новый склад\nаренда до пятницы", position: 1 }),
    point({ id: "p2", text: "Продажи Q4", position: 2, done_at: "2026-09-23T05:00:00Z" }),
    point({ id: "p3", text: "Поручено", position: 3, converted_task_id: "t-1" }),
    point({ id: "p4", text: "", position: 4, audio_path: "a.webm" }),
    point({ id: "p5", text: "Отпуска", position: 0.5 }),
    point({ id: "s1", text: "Охрана", parent_id: "p1", position: 2 }),
    point({ id: "s2", text: "Аренда", parent_id: "p1", position: 1, done_at: "2026-09-23T05:00:00Z" }),
    point({ id: "gone", text: "Удалён", position: 6, deleted_at: "2026-09-23T05:00:00Z" }),
  ];

  it("takes the open points with words for a new board", () => {
    expect(openPoints(rows).map((row) => row.id)).toEqual(["p5", "p1"]);
  });

  it("previews the first points with words", () => {
    expect(previewOf(rows)).toEqual(["Отпуска", "Новый склад"]);
    expect(previewOf([])).toEqual([]);
  });

  it("writes the board for a messenger, numbered as the wall numbers it", () => {
    expect(boardText("Планёрка · 23 сент.", rows)).toBe(
      ["Планёрка · 23 сент.", "", "1. Отпуска", "2. Новый склад", "   аренда до пятницы", "   – ✓ Аренда", "   – Охрана", "3. ✓ Продажи Q4", "4. Поручено"].join("\n"),
    );
  });
});

describe("summaryLine", () => {
  it("says the points, the sub-points apart and the ticked ones", () => {
    expect(summaryLine({ total: 5, subs: 3, done: 2, lastAt: null })).toBe("5 пунктов · 3 подпункта · 2 отмечено");
    expect(summaryLine({ total: 1, subs: 1, done: 0, lastAt: null })).toBe("1 пункт · 1 подпункт");
    expect(summaryLine({ total: 2, subs: 0, done: 1, lastAt: null })).toBe("2 пункта · 1 отмечен");
  });

  it("is «Пока пусто» for an empty board", () => {
    expect(summaryLine(undefined)).toBe("Пока пусто");
    expect(summaryLine({ total: 0, subs: 0, done: 0, lastAt: null })).toBe("Пока пусто");
  });
});
