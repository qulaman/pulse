import { describe, expect, it } from "vitest";

import { bandOver, boardShown, EMPTY_SUMMARY, quietScene, resolveScene, sceneKey, sceneReady, stageOf, type SceneData } from "./scenes";

const DATA: SceneData = { calendar: null, calendarView: "week", rating: null, board: null, summary: null };
const board = { hidden: false, board: { id: "b1", title: "Планёрка", total: 1, done: 0, updated_at: "", view: "list" as const, focus: null, items: [] } };

describe("реестр сцен (D-182)", () => {
  it("приоритет: ночь, человек, дело, сцена", () => {
    const focus = { employee: { id: "p1" } } as never;
    const task = { task: { id: "t1" } } as never;
    expect(stageOf({ night: true, focus, task, scene: "board" }, DATA)).toEqual({ kind: "night", key: "night" });
    expect(stageOf({ night: false, focus, task, scene: "board" }, DATA)).toEqual({ kind: "focus", key: "focus:p1" });
    expect(stageOf({ night: false, focus: null, task, scene: "board" }, DATA)).toEqual({ kind: "task", key: "task:t1" });
    expect(stageOf({ night: false, focus: null, task: null, scene: "clock" }, DATA)).toEqual({ kind: "clock", key: "clock" });
  });

  it("ключ сцены меняется вместе с тем, что она показывает", () => {
    expect(sceneKey("calendar", { ...DATA, calendarView: "month" })).toBe("calendar:month");
    expect(sceneKey("rating", { ...DATA, rating: { period: "month" } as never })).toBe("rating:month");
    expect(sceneKey("board", { ...DATA, board })).toBe("board:b1");
    expect(sceneKey("board", { ...DATA, board: { hidden: true, board: null } })).toBe("board:hidden");
  });

  it("сцена ждёт свои данные: календарь, рейтинг и доска", () => {
    expect(sceneReady("calendar", DATA)).toBe(false);
    expect(sceneReady("rating", DATA)).toBe(false);
    expect(sceneReady("board", DATA)).toBe(false);
    expect(sceneReady("face", DATA)).toBe(true);
    expect(sceneReady("board", { ...DATA, board })).toBe(true);
  });

  it("сцена, которой нечего показать, уступает лицу — стена не чернеет от старой базы", () => {
    expect(resolveScene("day-result", { ...DATA, summary: EMPTY_SUMMARY })).toBe("face");
    expect(resolveScene("week-result", { ...DATA, summary: EMPTY_SUMMARY })).toBe("face");
    expect(resolveScene("announcement", { ...DATA, summary: EMPTY_SUMMARY })).toBe("face");
    expect(resolveScene("board", { ...DATA, board: { hidden: false, board: null } })).toBe("face");
    const summary = { ...EMPTY_SUMMARY, day: { done: 3, points: null, people: 2, awards: [] } };
    expect(resolveScene("day-result", { ...DATA, summary })).toBe("day-result");
    // a board still on its way waits, it does not turn into the face
    expect(resolveScene("board", DATA)).toBe("board");
  });

  it("доска на стене — её пункты или честное «скрыта»", () => {
    expect(boardShown("board", board)).toBe(board);
    expect(boardShown("board", { hidden: true, board: null })).not.toBeNull();
    expect(boardShown("board", null)).toBeNull();
    expect(boardShown("face", board)).toBeNull();
  });

  it("строка гаснет на часах и доске; надпись полосой — над доской, человеком, делом и объявлением", () => {
    expect(quietScene("clock")).toBe(true);
    expect(quietScene("board")).toBe(true);
    expect(quietScene("face")).toBe(false);
    expect(["focus", "task", "board", "announcement"].every((k) => bandOver(k as never))).toBe(true);
    expect(["face", "clock", "team", "calendar", "rating", "day-result", "welcome", "night"].some((k) => bandOver(k as never))).toBe(false);
  });
});
