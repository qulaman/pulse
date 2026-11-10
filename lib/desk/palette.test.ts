import { describe, expect, it } from "vitest";

import { matchCommands, matchSections, matchTasks, searchPeople, taskLookup } from "./palette";

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

  it("takes the server's word for what it found, and still ranks it", () => {
    const old = task("t5", "Пересмотреть договор", "done", null, "2025-01-01T10:00:00Z");
    expect(matchTasks("смотр", [...tasks, old]).map((t) => t.id)).toEqual([]);
    expect(matchTasks("смотр", [...tasks, old], 5, new Set(["t5"])).map((t) => t.id)).toEqual(["t5"]);
    expect(matchTasks("смет", [...tasks, old], 5, new Set(["t5"])).map((t) => t.id)).toEqual(["t3", "t1", "t2", "t5"]);
  });
});

describe("taskLookup", () => {
  it("gives the names to the assignee and the rest to the title", () => {
    expect(taskLookup("смета ерлан", people)).toEqual({ text: "смета", assignees: ["e1", "e2"] });
    expect(taskLookup("марату смета кровля", people)).toEqual({ text: "смета кровля", assignees: ["m1"] });
  });

  it("keeps the text whole when there is no name in it", () => {
    expect(taskLookup("смета по объекту", people)).toEqual({ text: "смета по объекту", assignees: [] });
  });

  it("keeps a lone name as a word of a title", () => {
    expect(taskLookup("ерлан", people)).toEqual({ text: "ерлан", assignees: [] });
  });
});

describe("matchCommands — a move named in words (D-160)", () => {
  it("«новый сотрудник» and «добавить человека» lead to the form, picked by themselves", () => {
    expect(matchCommands("добавить нового сотрудника", people)[0]).toEqual({ kind: "new", lead: true });
    expect(matchCommands("добавь человека", people)[0]).toEqual({ kind: "new", lead: true });
    expect(matchCommands("новый сотрудник", people)[0]).toMatchObject({ kind: "new" });
  });

  it("a long sentence with the same words stays an order unless picked", () => {
    const commands = matchCommands("добавить в смету новый пункт для сотрудника склада завтра", people);
    expect(commands[0]).toEqual({ kind: "new", lead: false });
  });

  it("an order that starts with a name is no command", () => {
    expect(matchCommands("Ерлану добавить нового сотрудника в чат", people)).toEqual([]);
    expect(matchCommands("Марат проверь смету", people)).toEqual([]);
  });

  it("«удалить Марата» finds the person in any case of the name; one hit is picked by itself", () => {
    const commands = matchCommands("удалить Марата", people);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ kind: "remove", lead: true, person: { id: "m1" } });
    expect(matchCommands("уволить сотрудника Дину из команды", people)[0]).toMatchObject({ kind: "remove", person: { id: "d1" } });
  });

  it("two namesakes are both offered, none picked", () => {
    const commands = matchCommands("удалить ерлана", people);
    expect(commands.map((c) => (c.kind === "remove" ? c.person.id : c.kind))).toEqual(["e1", "e2"]);
    expect(commands.every((c) => !c.lead)).toBe(true);
  });

  it("«удалить старые файлы» names nobody: no command, the words stay an order", () => {
    expect(matchCommands("удалить старые файлы", people)).toEqual([]);
    expect(matchCommands("удалить сотрудника", people)).toEqual([{ kind: "team", lead: false }]);
  });
});
