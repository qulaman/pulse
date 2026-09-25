import { describe, expect, it } from "vitest";

import { boardCountLine, boardLayout, isFresh, pageAt, pageItems, PAGE_MS, tagOf, type TvBoardItem } from "./board";

function item(n: number, patch: Partial<TvBoardItem> = {}): TvBoardItem {
  return { id: `p-${n}`, text: `Пункт ${n}`, done: false, created_at: "2026-09-18T08:00:00Z", assignee: null, handed_done: false, children: [], ...patch };
}

describe("boardLayout", () => {
  it("один столбец до шести, два до четырнадцати, дальше страницы", () => {
    expect(boardLayout(0)).toEqual({ columns: 1, pages: 1, perPage: 1 });
    expect(boardLayout(6)).toEqual({ columns: 1, pages: 1, perPage: 6 });
    expect(boardLayout(7)).toEqual({ columns: 2, pages: 1, perPage: 14 });
    expect(boardLayout(14)).toEqual({ columns: 2, pages: 1, perPage: 14 });
    expect(boardLayout(15)).toEqual({ columns: 2, pages: 2, perPage: 14 });
    expect(boardLayout(29)).toEqual({ columns: 2, pages: 3, perPage: 14 });
  });
});

describe("pageAt и pageItems", () => {
  it("листает страницы по часам киоска", () => {
    const start = new Date(PAGE_MS * 1000);
    expect(pageAt(start, 1)).toBe(0);
    expect(pageAt(start, 2)).toBe(0);
    expect(pageAt(new Date(start.getTime() + PAGE_MS), 2)).toBe(1);
    expect(pageAt(new Date(start.getTime() + 2 * PAGE_MS), 2)).toBe(0);
  });

  it("нумерует пункты сквозь страницы", () => {
    const items = Array.from({ length: 20 }, (_, i) => item(i + 1));
    const layout = boardLayout(items.length);
    expect(pageItems(items, layout, 0).map((row) => row.n)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    expect(pageItems(items, layout, 1).map((row) => row.n)).toEqual([15, 16, 17, 18, 19, 20]);
  });
});

describe("isFresh", () => {
  it("светится минуту после того, как сказан", () => {
    const now = new Date("2026-09-18T08:00:30Z");
    expect(isFresh(item(1), now)).toBe(true);
    expect(isFresh(item(1, { created_at: "2026-09-18T07:58:00Z" }), now)).toBe(false);
    // часы сервера на пару секунд впереди киоска: только что сказанный — всё равно новый
    expect(isFresh(item(1, { created_at: "2026-09-18T08:00:32Z" }), now)).toBe(true);
    // а на пять минут «из будущего» — нет
    expect(isFresh(item(1, { created_at: "2026-09-18T08:05:00Z" }), now)).toBe(false);
  });
});

describe("tagOf и boardCountLine", () => {
  it("пишет нейтрально: кому поручено и сдано ли", () => {
    expect(tagOf(item(1))).toBeNull();
    expect(tagOf(item(1, { assignee: "Марат" }))).toBe("→ Марат");
    expect(tagOf(item(1, { assignee: "Марат", handed_done: true }))).toBe("→ Марат · сдано");
  });

  it("считает пункты и отмеченные", () => {
    expect(boardCountLine({ total: 0, done: 0 })).toBe("Пока пусто");
    expect(boardCountLine({ total: 5, done: 0 })).toBe("5 пунктов");
    expect(boardCountLine({ total: 3, done: 2 })).toBe("3 пункта · 2 отмечено");
    expect(boardCountLine({ total: 1, done: 1 })).toBe("1 пункт · 1 отмечен");
  });
});
