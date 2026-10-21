import { describe, expect, it } from "vitest";

import {
  boardCountLine,
  boardFrame,
  boardFrom,
  freshKey,
  isFresh,
  litPoint,
  mapFits,
  pageAt,
  PAGE_MS,
  PROGRESS_GAP,
  progressScale,
  stageOf,
  tagOf,
  wallView,
  zoomedBranch,
  type TvBoardData,
  type TvBoardItem,
} from "./board";

function item(n: number, patch: Partial<TvBoardItem> = {}): TvBoardItem {
  return { id: `p-${n}`, text: `Пункт ${n}`, done: false, created_at: "2026-09-18T08:00:00Z", assignee: null, handed_done: false, children: [], ...patch };
}

describe("pageAt", () => {
  it("листает страницы по часам киоска", () => {
    const start = new Date(PAGE_MS * 1000);
    expect(pageAt(start, 1)).toBe(0);
    expect(pageAt(start, 2)).toBe(0);
    expect(pageAt(new Date(start.getTime() + PAGE_MS), 2)).toBe(1);
    expect(pageAt(new Date(start.getTime() + 2 * PAGE_MS), 2)).toBe(0);
  });

  it("стоит на странице подсвеченного пункта, пока подсветка не снята", () => {
    const start = new Date(PAGE_MS * 1000);
    expect(pageAt(start, 3, 2)).toBe(2);
    expect(pageAt(new Date(start.getTime() + PAGE_MS), 3, 2)).toBe(2);
    // a stale page number (the board got shorter) does not stop the clock
    expect(pageAt(start, 2, 5)).toBe(0);
  });
});

describe("wallView и mapFits", () => {
  it("карта — только до двенадцати ветвей и не пустая, иначе список", () => {
    const items = (n: number) => Array.from({ length: n }, (_, i) => item(i + 1));
    expect(mapFits(0)).toBe(false);
    expect(wallView({ view: "map", items: items(12) })).toBe("map");
    expect(wallView({ view: "map", items: items(13) })).toBe("list");
    expect(wallView({ view: "map", items: [] })).toBe("list");
    expect(wallView({ view: "list", items: items(3) })).toBe("list");
  });
});

describe("boardFrame", () => {
  it("16:9 — 164 vh в ширину, уже экран — уже поле, высота одна", () => {
    expect(boardFrame(16 / 9).width).toBe(163.6);
    expect(boardFrame(16 / 10).width).toBe(147.2);
    expect(boardFrame(21 / 9).width).toBe(164);
    expect(boardFrame(16 / 9).height).toBe(boardFrame(4 / 3).height);
  });
});

describe("boardFrom", () => {
  it("база старше клиента: без веток, вида и подсветки — список без подсветки", () => {
    const old = boardFrom({ hidden: false, board: { id: "b1", title: "Доска", items: [{ id: "p1", text: "Пункт" }] } });
    expect(old.board?.view).toBe("list");
    expect(old.board?.focus).toBeNull();
    expect(old.board?.items[0].children).toEqual([]);
  });

  it("подсветка на пункте, которого нет, — не светит", () => {
    const data = boardFrom({ board: { id: "b1", title: "Доска", view: "map", focus: "gone", items: [{ id: "p1", text: "Пункт" }] } });
    expect(data.board?.focus).toBeNull();
    expect(data.board?.view).toBe("map");
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

  it("ключ свежих — пункты и подпункты, меняется только со свечением", () => {
    const now = new Date("2026-09-18T08:00:30Z");
    const old = "2026-09-18T07:00:00Z";
    const items = [
      item(1, { created_at: old, children: [{ ...item(2), id: "c1" }] }),
      item(3, { created_at: old }),
    ];
    expect(freshKey(items, now)).toBe("c1");
    expect(freshKey(items, new Date("2026-09-18T08:05:00Z"))).toBe("");
  });
});

describe("tagOf и boardCountLine", () => {
  it("пишет нейтрально: кому поручено и сдано ли", () => {
    expect(tagOf(item(1))).toBeNull();
    expect(tagOf(item(1, { assignee: "Марат" }))).toBe("→\u00a0Марат");
    expect(tagOf(item(1, { assignee: "Марат", handed_done: true }))).toBe("→\u00a0Марат · сдано");
  });

  it("считает пункты и отмеченные", () => {
    expect(boardCountLine({ total: 0, done: 0 })).toBe("Пока пусто");
    expect(boardCountLine({ total: 5, done: 0 })).toBe("5 пунктов");
    expect(boardCountLine({ total: 3, done: 2 })).toBe("3 пункта · 2 отмечено");
    expect(boardCountLine({ total: 1, done: 1 })).toBe("1 пункт · 1 отмечен");
  });
});

describe("progressScale", () => {
  it("шкала не шире пятой части строки, сегмент — от 0,9 до 3,2 vh", () => {
    for (const count of [1, 3, 7, 12, 30]) {
      const { segment } = progressScale(count, 0);
      expect(segment).toBeGreaterThanOrEqual(0.9);
      expect(segment).toBeLessThanOrEqual(3.2);
      if (count <= 20) expect(count * segment + (count - 1) * PROGRESS_GAP).toBeLessThanOrEqual(34.01);
    }
  });

  it("капсула — по центру своего сегмента и на шаг сегмента дальше с каждым пунктом", () => {
    const first = progressScale(7, 0);
    const third = progressScale(7, 2);
    expect(first.thumb).toBeCloseTo(first.segment * 1.6);
    // centred: the capsule's middle is the segment's middle
    expect(first.shift + first.thumb / 2).toBeCloseTo(first.segment / 2);
    expect(third.shift - first.shift).toBeCloseTo(2 * (first.segment + PROGRESS_GAP));
  });

  it("пункт не найден — капсула у первого; за краем — у последнего", () => {
    expect(progressScale(5, -1).shift).toBe(progressScale(5, 0).shift);
    expect(progressScale(5, 9).shift).toBe(progressScale(5, 4).shift);
  });
});

describe("стадии поручений на стене (D-144)", () => {
  it("says only neutral stages: no declines, no lateness (D-45)", () => {
    expect(stageOf("sent")).toBe("sent");
    expect(stageOf("accepted")).toBe("work");
    expect(stageOf("in_progress")).toBe("work");
    expect(stageOf("rework")).toBe("work");
    expect(stageOf("pending_review")).toBe("review");
    expect(stageOf("done")).toBe("done");
    expect(stageOf("declined")).toBeNull();
    expect(stageOf("scheduled")).toBeNull();
    expect(stageOf("revoked")).toBeNull();
  });

  it("puts the stage beside the name", () => {
    expect(tagOf(item(1, { assignee: "Марат", stage: "work" }))).toBe("→\u00a0Марат · в работе");
    expect(tagOf(item(1, { assignee: "Марат", stage: "review" }))).toBe("→\u00a0Марат · на приёмке");
    expect(tagOf(item(1, { assignee: "Марат", stage: "sent" }))).toBe("→\u00a0Марат · отправлено");
    // a declined task: the name only
    expect(tagOf(item(1, { assignee: "Марат", stage: null }))).toBe("→\u00a0Марат");
    // a base older than the client: «сдано» from handed_done
    expect(tagOf(item(1, { assignee: "Марат", handed_done: true }))).toBe("→\u00a0Марат · сдано");
    // a guest: no name, no tag at all
    expect(tagOf(item(1, { assignee: null, stage: "work" }))).toBeNull();
  });

  it("reads the stage and the week mark from the base, and drops a stranger", () => {
    const value = boardFrom({
      board: {
        id: "b1",
        week: true,
        items: [
          { id: "p1", text: "Отгрузка", assignee: "Марат", stage: "review", children: [{ id: "c1", text: "Склад", stage: "declined" }] },
        ],
      },
    });
    expect(value.board?.week).toBe(true);
    expect(value.board?.items[0].stage).toBe("review");
    expect(value.board?.items[0].children[0].stage).toBeNull();
    expect(boardFrom({ board: { id: "b2", items: [] } }).board?.week).toBe(false);
  });
});

describe("пункт во весь экран (D-141, D-144)", () => {
  const board = (patch: Partial<TvBoardData>): TvBoardData => ({
    id: "b1",
    title: "Планёрка",
    total: 3,
    done: 0,
    updated_at: "2026-10-21T08:00:00Z",
    view: "map",
    focus: null,
    items: [
      item(1, { children: [item(11), item(12)] }),
      item(2),
      item(3, { children: [item(31)], sketch: { v: 1, strokes: [{ c: "text", w: 1, p: [0, 0, 10, 10] }] } }),
    ],
    ...patch,
  });

  it("finds the lit point and its place", () => {
    expect(litPoint(board({ focus: "p-2" }))).toMatchObject({ at: 1 });
    expect(litPoint(board({ focus: null }))).toBeNull();
    expect(litPoint(board({ focus: "nope" }))).toBeNull();
  });

  it("opens a lit branch on the map only, with its sub-points, and never over a drawing", () => {
    expect(zoomedBranch(board({ focus: "p-1" }))?.at).toBe(0);
    expect(zoomedBranch(board({ focus: "p-1", view: "list" }))).toBeNull();
    expect(zoomedBranch(board({ focus: "p-2" }))).toBeNull();
    expect(zoomedBranch(board({ focus: "p-3" }))).toBeNull();
  });
});
