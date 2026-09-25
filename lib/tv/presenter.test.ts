import { describe, expect, it } from "vitest";

import type { MindBoard } from "@/lib/mindboard/queries";
import type { Note } from "@/lib/notes/queries";

import {
  boardCounts,
  boardShelf,
  cartridgeLine,
  countLine,
  mapHint,
  pipsOf,
  presenterPill,
  presenterPoints,
  presenterStage,
  presenterWords,
  type PresenterPoint,
} from "./presenter";

const NOW = new Date("2026-09-25T05:00:00Z"); // 10:00 в Актобе

function note(id: string, patch: Partial<Note> = {}): Note {
  return {
    id,
    company_id: "c",
    user_id: "u",
    text: `Пункт ${id}`,
    raw_transcript: null,
    audio_path: null,
    inbox_item_id: null,
    pinned: false,
    board_id: "b1",
    position: 1,
    parent_id: null,
    done_at: null,
    converted_task_id: null,
    converted_announcement_id: null,
    converted_at: null,
    deleted_at: null,
    remind_at: null,
    reminded_at: null,
    client_request_id: null,
    created_at: "2026-09-25T04:00:00Z",
    updated_at: "2026-09-25T04:00:00Z",
    ...patch,
  };
}

function board(id: string, patch: Partial<MindBoard> = {}): MindBoard {
  return {
    id,
    company_id: "c",
    user_id: "u",
    title: `Доска ${id}`,
    deleted_at: null,
    client_request_id: null,
    created_at: "2026-09-25T03:00:00Z",
    updated_at: "2026-09-25T03:00:00Z",
    ...patch,
  };
}

const points = (n: number, done: number[] = []): PresenterPoint[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, text: `Пункт ${i + 1}`, done: done.includes(i + 1) }));

describe("presenterPoints", () => {
  it("шаги — пункты верхнего уровня со словами, в порядке доски", () => {
    const notes = [
      note("c", { position: 3 }),
      note("a", { position: 1 }),
      note("a1", { position: 1, parent_id: "a" }),
      note("b", { position: 2, done_at: "2026-09-25T04:30:00Z" }),
      note("other", { board_id: "b2" }),
      note("free", { board_id: null }),
    ];
    expect(presenterPoints(notes, "b1")).toEqual([
      { id: "a", text: "Пункт a", done: false },
      { id: "b", text: "Пункт b", done: true },
      { id: "c", text: "Пункт c", done: false },
    ]);
  });

  it("пропускает удалённый, пустой «Распознаю…» и сироту без своего пункта", () => {
    const notes = [
      note("a", { position: 1 }),
      note("gone", { position: 2, deleted_at: "2026-09-25T04:40:00Z" }),
      note("voice", { position: 3, text: "   " }),
      note("orphan", { position: 4, parent_id: "not-here" }),
    ];
    expect(presenterPoints(notes, "b1").map((point) => point.id)).toEqual(["a"]);
  });

  it("сводит переносы строк в пробелы: дисплей сам режет до двух строк", () => {
    expect(presenterPoints([note("a", { text: "  Новый склад:\nсроки  и бюджет " })], "b1")[0].text).toBe("Новый склад: сроки и бюджет");
  });
});

describe("presenterStage", () => {
  it("без пунктов — пусто, даже если подсветка осталась", () => {
    expect(presenterStage([], null)).toEqual({ kind: "empty" });
    expect(presenterStage([], "p1")).toEqual({ kind: "empty" });
  });

  it("до первого шага — вся доска; подсвеченный пункт пропал — подсветка снята", () => {
    expect(presenterStage(points(7, [2]), null)).toEqual({ kind: "ready", total: 7, done: 1, lost: false });
    expect(presenterStage(points(7), "gone")).toEqual({ kind: "ready", total: 7, done: 0, lost: true });
  });

  it("на пункте — номер, сам пункт и следующий", () => {
    const stage = presenterStage(points(7), "p3");
    expect(stage).toMatchObject({ kind: "point", at: 2, total: 7, point: { id: "p3" }, next: { id: "p4" } });
    expect(presenterStage(points(7), "p7")).toMatchObject({ kind: "point", at: 6, next: null });
  });
});

describe("presenterWords", () => {
  it("идёт по пункту: «Пункт 3 из 7», текст, «Дальше: …»", () => {
    expect(presenterWords(presenterStage(points(7), "p3"))).toEqual({
      eyebrow: "Пункт 3 из 7",
      headline: "Пункт 3",
      line: "Дальше: Пункт 4",
    });
  });

  it("говорит, что пункт отмечен и что он последний", () => {
    expect(presenterWords(presenterStage(points(3, [3]), "p3"))).toEqual({
      eyebrow: "Пункт 3 из 3 · отмечен",
      headline: "Пункт 3",
      line: "Это последний пункт",
    });
  });

  it("до первого шага зовёт начать, а пропавшую подсветку называет честно", () => {
    expect(presenterWords(presenterStage(points(7), null))).toEqual({
      eyebrow: "Ведущий · 7 пунктов",
      headline: "На стене вся доска",
      line: "▶ — начать с первого пункта",
    });
    expect(presenterWords(presenterStage(points(1), "gone")).headline).toBe("Подсветка снята");
    expect(presenterWords(presenterStage(points(1), "gone")).eyebrow).toBe("Ведущий · 1 пункт");
  });

  it("пустая доска — куда идти за пунктами", () => {
    expect(presenterWords({ kind: "empty" })).toEqual({
      eyebrow: "Ведущий",
      headline: "На доске нет пунктов",
      line: "Надиктуйте их на экране доски",
    });
  });
});

describe("presenterPill", () => {
  it("до первого шага — «Вести совещание», после пропажи — «Начать заново»", () => {
    expect(presenterPill({ kind: "ready", total: 4, done: 0, lost: false })).toEqual({
      kind: "start",
      title: "Вести совещание",
      line: "4 пункта · с первого",
    });
    expect(presenterPill({ kind: "ready", total: 4, done: 0, lost: true })).toMatchObject({ kind: "start", title: "Начать заново" });
  });

  it("на пункте — «3 из 7» и его слова", () => {
    const stage = presenterStage(points(7, [3]), "p3");
    if (stage.kind === "empty") throw new Error("unreachable");
    expect(presenterPill(stage)).toEqual({ kind: "point", step: "3 из 7", text: "Пункт 3", done: true });
  });
});

describe("pipsOf", () => {
  it("по точке на пункт до двенадцати, дальше точек нет", () => {
    expect(pipsOf(points(4, [1]), 1)).toEqual(["done", "now", "todo", "todo"]);
    expect(pipsOf(points(4), null)).toEqual(["todo", "todo", "todo", "todo"]);
    expect(pipsOf(points(12), 0)).toHaveLength(12);
    expect(pipsOf(points(13), 0)).toBeNull();
    expect(pipsOf([], null)).toBeNull();
  });
});

describe("mapHint", () => {
  it("молчит, пока карта влезает, и честно говорит, когда нет", () => {
    expect(mapHint(0)).toBeNull();
    expect(mapHint(12)).toBeNull();
    expect(mapHint(13)).toBe("Карта — до 12 пунктов, на стене список");
  });
});

describe("boardCounts и подписи", () => {
  it("считает, как стена: пункты верхнего уровня со словами", () => {
    const counts = boardCounts([
      note("a"),
      note("b", { done_at: "2026-09-25T04:30:00Z" }),
      note("a1", { parent_id: "a" }),
      note("voice", { text: "" }),
      note("gone", { deleted_at: "2026-09-25T04:40:00Z" }),
      note("x", { board_id: "b2" }),
      note("free", { board_id: null }),
    ]);
    expect(counts.get("b1")).toEqual({ total: 2, done: 1 });
    expect(counts.get("b2")).toEqual({ total: 1, done: 0 });
    expect(counts.has("free")).toBe(false);
  });

  it("подпись клавиши и картриджа", () => {
    expect(countLine(undefined)).toBe("пусто");
    expect(countLine({ total: 5, done: 0 })).toBe("5 пунктов");
    const until = new Date("2026-09-25T16:00:00Z"); // 21:00 в Актобе
    expect(cartridgeLine({ total: 7, done: 0 }, until)).toBe("7 пунктов · до 21:00");
    expect(cartridgeLine({ total: 7, done: 2 }, until)).toBe("7 пунктов · 2 отмечено · до 21:00");
    expect(cartridgeLine({ total: 1, done: 1 }, until)).toBe("1 пункт · 1 отмечен · до 21:00");
    expect(cartridgeLine(undefined, until)).toBe("Пока пусто · до 21:00");
  });
});

describe("boardShelf", () => {
  const boards = [
    board("old", { updated_at: "2026-09-20T03:00:00Z" }),
    board("new", { updated_at: "2026-09-25T04:00:00Z" }),
    board("mid", { updated_at: "2026-09-24T03:00:00Z" }),
    board("bin", { deleted_at: "2026-09-25T02:00:00Z" }),
    board("x", { updated_at: "2026-09-23T03:00:00Z" }),
  ];

  it("три последние живые на клавишах, остальное — «Все доски»", () => {
    const shelf = boardShelf(boards, NOW, null);
    expect(shelf.keys.map((b) => b.id)).toEqual(["new", "mid", "x"]);
    expect(shelf.rest).toBe(1);
    expect(shelf.live.map((b) => b.id)).toEqual(["new", "mid", "x", "old"]);
  });

  it("доска на стене стоит в картридже, а не на клавише", () => {
    const shelf = boardShelf(boards, NOW, "new");
    expect(shelf.keys.map((b) => b.id)).toEqual(["mid", "x", "old"]);
    expect(shelf.rest).toBe(0);
  });

  it("без досок — пустая полка", () => {
    expect(boardShelf([], NOW, null)).toEqual({ keys: [], rest: 0, live: [] });
  });
});
