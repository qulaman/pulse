import { describe, expect, it } from "vitest";

import { matchSections, matchTasks, searchPeople } from "./palette";

const sections = [
  { href: "/desk/today", label: "Сегодня" },
  { href: "/desk/tasks", label: "Задачи" },
  { href: "/desk/errands", label: "Заявки" },
  { href: "/desk/notes", label: "Заметки" },
  { href: "/desk/screen", label: "Экран" },
  { href: "/desk/settings", label: "Настройки" },
  { href: "/desk/profile", label: "Профиль" },
];

const people = [
  { id: "e1", full_name: "Ерлан Бекмуханов", position: "Прораб", aliases: ["Ерлан Б"] },
  { id: "e2", full_name: "Ерлан Досжанов", position: "Снабжение", aliases: [] },
  { id: "m1", full_name: "Марат Оспанов", position: "Главный бухгалтер", aliases: null },
  { id: "d1", full_name: "Дина Ахметова", position: null, aliases: null },
];

const task = (id: string, title: string, status: string, assignee: string | null, created_at: string) => ({ id, title, status, assignee, deadline: null, created_at });
const tasks = [
  task("t1", "Проверить смету по объекту", "sent", "Ерлан Бекмуханов", "2026-11-01T10:00:00Z"),
  task("t2", "Смета на крышу", "done", "Марат Оспанов", "2026-11-02T10:00:00Z"),
  task("t3", "Сметы за октябрь", "accepted", "Марат Оспанов", "2026-10-20T10:00:00Z"),
  task("t4", "Позвонить поставщику", "sent", "Ерлан Досжанов", "2026-11-03T10:00:00Z"),
];

describe("matchSections", () => {
  it("finds sections by the start of the name", () => {
    expect(matchSections("за", sections).map((s) => s.href)).toEqual(["/desk/tasks", "/desk/errands", "/desk/notes"]);
    expect(matchSections("наст", sections).map((s) => s.href)).toEqual(["/desk/settings"]);
  });

  it("finds them by their other words", () => {
    expect(matchSections("тв", sections).map((s) => s.href)).toEqual(["/desk/screen"]);
    expect(matchSections("пароль", sections).map((s) => s.href)).toEqual(["/desk/profile"]);
  });

  it("finds nothing in an order", () => {
    expect(matchSections("Ерлану смета до пятницы", sections)).toEqual([]);
    expect(matchSections("  ", sections)).toEqual([]);
  });
});

describe("searchPeople", () => {
  it("is everybody for an empty query", () => {
    expect(searchPeople(people, "").map((p) => p.id)).toEqual(["e1", "e2", "m1", "d1"]);
  });

  it("finds by the name, both words, and the position", () => {
    expect(searchPeople(people, "ер б").map((p) => p.id)).toEqual(["e1"]);
    expect(searchPeople(people, "бух").map((p) => p.id)).toEqual(["m1"]);
    expect(searchPeople(people, "оспан").map((p) => p.id)).toEqual(["m1"]);
  });

  it("puts a first-name match before a surname one", () => {
    const more = [...people, { id: "x1", full_name: "Айгуль Динова", position: null, aliases: null }];
    expect(searchPeople(more, "дин").map((p) => p.id)).toEqual(["d1", "x1"]);
  });
});

describe("matchTasks", () => {
  it("finds a task by its words in another case, the open ones first", () => {
    expect(matchTasks("смету", tasks).map((t) => t.id)).toEqual(["t1", "t3", "t2"]);
  });

  it("puts a title that starts with the words first", () => {
    expect(matchTasks("смет", tasks).map((t) => t.id)).toEqual(["t3", "t1", "t2"]);
  });

  it("finds by the assignee too", () => {
    expect(matchTasks("смета ерлан", tasks).map((t) => t.id)).toEqual(["t1"]);
  });

  it("needs two letters", () => {
    expect(matchTasks("с", tasks)).toEqual([]);
  });
});
