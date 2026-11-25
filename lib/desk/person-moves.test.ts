import { describe, expect, it } from "vitest";

import { allMoves, personMoves, type MoveContext, type MovePerson, type MovePlace } from "./person-moves";

const DIRECTOR = { id: "boss", role: "director" as const };
const SECRETARY = { id: "sec", role: "secretary" as const };
const worker: MovePerson = { id: "a", role: "employee", is_active: true, availability: "active" };

const keys = (set: ReturnType<typeof personMoves>) => ({
  main: set.main.map((move) => move.key),
  more: set.more.map((move) => (move === "separator" ? "|" : move.key)),
});
const at = (place: MovePlace, extra: Partial<MoveContext> = {}): MoveContext => ({ place, viewer: DIRECTOR, pointsOn: true, ...extra });

describe("personMoves — one set, one order on every desk card", () => {
  it("the director over a person at work", () => {
    expect(keys(personMoves(worker, at("card")))).toEqual({
      main: ["give", "edit", "card"],
      more: ["tasks", "reports", "award", "|", "vacation", "sick", "|", "login", "|", "remove"],
    });
  });

  it("every place gives the same moves in the same order, minus the place itself", () => {
    const full = allMoves(personMoves(worker, at("card"))).map((move) => (move === "separator" ? "|" : move.key));
    for (const place of ["today", "card", "panel", "page", "diary"] as const) {
      const here = allMoves(personMoves(worker, at(place))).map((move) => (move === "separator" ? "|" : move.key));
      const left = full.filter((key) => key === "|" || here.includes(key));
      expect(here).toEqual(left);
    }
    expect(keys(personMoves(worker, at("page"))).main).toEqual(["give", "edit"]);
    expect(keys(personMoves(worker, at("diary"))).more).not.toContain("reports");
  });

  it("the words are the dictionary's", () => {
    const set = personMoves(worker, at("today"));
    expect(set.main.map((move) => move.label)).toEqual(["Дать задачу", "Изменить", "Карточка"]);
    const labels = set.more.filter((move) => move !== "separator").map((move) => (move as { label: string }).label);
    expect(labels).toEqual(["Задачи человека", "Отчёты человека", "Начислить очки…", "В отпуске с сегодня", "На больничном с сегодня", "Выдать код входа…", "Удалить…"]);
    // «Все дела» and «Похвалить» were the same moves under other words
    expect(labels).not.toContain("Все дела");
    expect(labels).not.toContain("Похвалить");
  });

  it("a person away comes back with one move", () => {
    const set = personMoves({ ...worker, availability: "vacation" }, at("card"));
    expect(keys(set).more).toContain("back");
    expect(keys(set).more).not.toContain("vacation");
  });

  it("no points, no reports — no such moves", () => {
    expect(keys(personMoves(worker, at("card", { pointsOn: false, reportsOn: false }))).more).toEqual(["tasks", "|", "vacation", "sick", "|", "login", "|", "remove"]);
  });

  it("the secretary edits and lets in, never gives work or points (D-104)", () => {
    expect(keys(personMoves(worker, at("card", { viewer: SECRETARY })))).toEqual({
      main: ["edit", "card"],
      more: ["vacation", "sick", "|", "login", "|", "remove"],
    });
  });

  it("another director's card: no task to give, no game, no availability", () => {
    const other = { id: "d2", role: "director" as const, is_active: true, availability: "active" as const };
    expect(keys(personMoves(other, at("card")))).toEqual({ main: ["edit", "card"], more: ["tasks", "|", "remove"] });
    expect(keys(personMoves(other, at("card", { viewer: SECRETARY })))).toEqual({ main: ["card"], more: [] });
  });

  it("nobody gives a task to themselves or removes themselves", () => {
    const me = { ...worker, id: DIRECTOR.id, role: "director" as const };
    const set = keys(personMoves(me, at("page")));
    expect(set.main).not.toContain("give");
    expect(set.more).not.toContain("remove");
  });

  it("who left: back to the team first, their open work handed over, erased for good last", () => {
    const gone = { ...worker, is_active: false };
    expect(keys(personMoves(gone, at("page", { held: 2 })))).toEqual({ main: ["revive", "edit"], more: ["pass", "|", "remove"] });
    expect(personMoves(gone, at("page")).more.at(-1)).toMatchObject({ key: "remove", label: "Удалить насовсем…", danger: true });
    expect(keys(personMoves(gone, at("page"))).more).not.toContain("pass");
  });

  it("the wall is switched off and on, not removed", () => {
    const wall = { id: "tv", role: "tv" as const, is_active: true, availability: "active" as const };
    const set = personMoves(wall, at("page"));
    expect(set.main.map((move) => move.key)).toEqual(["edit"]);
    expect(set.more.at(-1)).toMatchObject({ key: "remove", label: "Выключить экран…" });
    expect(personMoves({ ...wall, is_active: false }, at("page")).main[0]).toMatchObject({ key: "revive", label: "Включить экран" });
  });

  it("the right button's menu is the head's moves, then «⋯»", () => {
    const set = personMoves(worker, at("card"));
    expect(allMoves(set).slice(0, 4).map((move) => (move === "separator" ? "|" : move.key))).toEqual(["give", "edit", "card", "|"]);
  });
});
