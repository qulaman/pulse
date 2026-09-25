import { describe, expect, it } from "vitest";

import type { Note } from "@/lib/notes/queries";
import type { TvState } from "@/lib/tv/queries";

import {
  boardExpiresAt,
  boardOnWall,
  boardSummary,
  cleanTitle,
  defaultTitle,
  nextPosition,
  pointsOf,
  positionBetween,
  splitBoards,
  summariesOf,
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
    expect(summary).toEqual({ total: 2, done: 1, lastAt: "2026-09-23T06:30:00Z" });
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
});
