import { describe, expect, it } from "vitest";

import { commandHint, matchCommands, matchSections, matchTasks, taskLookup } from "./palette";

const sections = [
  { href: "/desk/today", label: "Сегодня" },
  { href: "/desk/tasks", label: "Задачи" },
  { href: "/desk/errands", label: "Секретарь" },
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
    expect(matchSections("за", sections).map((s) => s.href)).toEqual(["/desk/tasks", "/desk/notes", "/desk/errands"]);
    expect(matchSections("секр", sections).map((s) => s.href)).toEqual(["/desk/errands"]);
    expect(matchSections("наст", sections).map((s) => s.href)).toEqual(["/desk/settings"]);
  });

  it("finds them by their other words", () => {
    expect(matchSections("тв", sections).map((s) => s.href)).toEqual(["/desk/screen"]);
    expect(matchSections("пароль", sections).map((s) => s.href)).toEqual(["/desk/profile"]);
    // «Секретарь» was «Заявки» (D-197): the old word still finds it
    expect(matchSections("заявки", sections).map((s) => s.href)).toEqual(["/desk/errands"]);
  });

  it("a section's former name still finds it (D-194)", () => {
    const renamed = [
      { href: "/desk/inbox", label: "Ждут вас" },
      { href: "/desk/ether", label: "Эфир" },
    ];
    expect(matchSections("разобрать", renamed).map((s) => s.href)).toEqual(["/desk/inbox"]);
    expect(matchSections("объявления", renamed).map((s) => s.href)).toEqual(["/desk/ether"]);
  });

  it("finds nothing in an order", () => {
    expect(matchSections("Ерлану смета до пятницы", sections)).toEqual([]);
    expect(matchSections("  ", sections)).toEqual([]);
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

describe("commandHint (D-194)", () => {
  it("the whole example on a wide line, a shorter one where it would be cut", () => {
    expect(commandHint(900, false)).toBe("Кому и что сделать: «Ерлану смета по объекту до пятницы» — Enter");
    expect(commandHint(400, false)).toBe("Кому и что сделать — Enter");
    expect(commandHint(150, false)).toBe("Поручение — Enter");
    expect(commandHint(40, false)).toBe("Поручение — Enter");
  });

  it("a pinned person: what and by when", () => {
    expect(commandHint(900, true)).toBe("Что сделать и к какому сроку — Enter");
    expect(commandHint(200, true)).toBe("Что сделать — Enter");
  });

  it("the chosen example always fits the width it was chosen for", () => {
    for (const width of [180, 240, 320, 420, 520, 640]) {
      const hint = commandHint(width, false);
      if (hint !== "Поручение — Enter") expect(hint.length * 7.6).toBeLessThanOrEqual(width);
    }
  });
});
