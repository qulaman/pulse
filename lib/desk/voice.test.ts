import { describe, expect, it } from "vitest";

import { flightSteps, isVoiceKey, linkAnswerLines, micLine, sentNotice, type SentItem } from "./voice";

const key = (code: string, extra: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; repeat: boolean }> = {}) => ({
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  ...extra,
});

describe("isVoiceKey", () => {
  it("is the plain V key, whatever the layout prints on it", () => {
    expect(isVoiceKey(key("KeyV"))).toBe(true);
    expect(isVoiceKey(key("KeyM"))).toBe(false);
  });

  it("leaves V with a modifier and a held key alone", () => {
    expect(isVoiceKey(key("KeyV", { ctrlKey: true }))).toBe(false);
    expect(isVoiceKey(key("KeyV", { metaKey: true }))).toBe(false);
    expect(isVoiceKey(key("KeyV", { shiftKey: true }))).toBe(false);
    expect(isVoiceKey(key("KeyV", { altKey: true }))).toBe(false);
    expect(isVoiceKey(key("KeyV", { repeat: true }))).toBe(false);
  });
});

describe("flightSteps", () => {
  it("walks the spoken phrase step by step", () => {
    expect(flightSteps("recording").map((s) => `${s.state}:${s.label}`)).toEqual(["now:Слушаю…", "next:Сохраняю", "next:Распознаю", "next:Разбираю"]);
    expect(flightSteps("transcribing").map((s) => `${s.state}:${s.label}`)).toEqual(["done:Записал", "done:Сохранил", "now:Распознаю…", "next:Разбираю"]);
    expect(flightSteps("parsing").map((s) => s.state)).toEqual(["done", "done", "done", "now"]);
  });
});

describe("micLine", () => {
  it("says what to do when the browser blocks the microphone", () => {
    expect(micLine("mic_denied", true)).toMatch(/разрешите «Микрофон»/);
    expect(micLine("mic_denied", null)).toMatch(/разрешите «Микрофон»/);
  });

  it("tells a missing microphone from a refused one", () => {
    expect(micLine("mic_denied", false)).toMatch(/Не нашёл микрофон/);
  });

  it("has nothing to say about a failure of the parser", () => {
    expect(micLine("parse_failed", null)).toBeNull();
  });
});

const task = (title: string, who: string | null): SentItem => ({ kind: "task", title, who });

describe("sentNotice", () => {
  it("one task: whom and what, «Открыть» leads to it", () => {
    expect(sentNotice([task("Проверить склад", "Жасулан")], { task_ids: ["t1"] })).toEqual({
      text: "Отправил: Жасулан — «Проверить склад»",
      href: "/desk/tasks?id=t1",
    });
  });

  it("several tasks to one person: the count", () => {
    const notice = sentNotice([task("А", "Жасулан"), task("Б", "Жасулан"), task("В", "Жасулан")], { task_ids: ["t1", "t2", "t3"] });
    expect(notice).toEqual({ text: "Отправил: Жасулан — 3 задачи", href: "/desk/tasks" });
  });

  it("several people: the count and the names", () => {
    expect(sentNotice([task("А", "Жасулан"), task("Б", "Гульмира")], { task_ids: ["t1", "t2"] }).text).toBe("Отправил 2 задачи: Жасулан и Гульмира");
    expect(
      sentNotice([task("А", "Жасулан"), task("Б", "Гульмира"), task("В", "Марат"), task("Г", "Дина"), task("Д", "Ерлан")], { task_ids: [] }).text,
    ).toBe("Отправил 5 задач: Жасулан, Гульмира и ещё 3");
  });

  it("a mixed batch names the rest after the tasks", () => {
    const notice = sentNotice([task("Проверить склад", "Жасулан"), { kind: "announcement", title: "Завтра субботник", who: null }], { task_ids: ["t1"] });
    expect(notice.text).toBe("Отправил: Жасулан — «Проверить склад» и объявление в Эфир");
    expect(notice.href).toBe("/desk/tasks?id=t1");
  });

  it("a batch without tasks opens its own section", () => {
    expect(sentNotice([{ kind: "announcement", title: "Субботник", who: null }], {})).toEqual({ text: "Отправил объявление в Эфир", href: "/desk/ether" });
    expect(sentNotice([{ kind: "event", title: "Планёрка", who: null }], {}).href).toBe("/desk/calendar");
    expect(sentNotice([{ kind: "reminder", title: "Позвонить", who: null }], {}).href).toBe("/desk/notes");
    expect(sentNotice([{ kind: "recurrence", title: "Отчёт", who: "Гульмира" }], {})).toEqual({ text: "Отправил повтор «Отчёт» — Гульмира", href: "/desk/tasks" });
  });

  it("quiet hours: the batch waits for the morning and says so", () => {
    expect(sentNotice([task("Проверить склад", "Жасулан")], { task_ids: ["t1"], scheduled: true }).text).toBe("Отправлю утром: Жасулан — «Проверить склад»");
  });

  it("a long title is cut like everywhere the assistant quotes one", () => {
    const text = sentNotice([task("Подготовить коммерческое предложение по объекту на Абая и согласовать", "Жасулан")], { task_ids: ["t1"] }).text;
    expect(text.startsWith("Отправил: Жасулан — «Подготовить коммерческое")).toBe(true);
    expect(text.endsWith("…»")).toBe(true);
  });
});

describe("linkAnswerLines", () => {
  const candidates = [
    { id: "a", title: "Проверить склад", assignee: "Жасулан", createdAt: "2026-11-01T10:00:00Z" },
    { id: "b", title: "Проверить склад", assignee: "Гульмира", createdAt: "2026-11-05T10:00:00Z" },
    { id: "c", title: "Сверка за октябрь", assignee: "Гульмира", createdAt: "2026-11-02T10:00:00Z" },
    { id: "d", title: "Сверка за октябрь", assignee: "Гульмира", createdAt: "2026-11-09T10:00:00Z" },
  ];

  it("a line about a task points to it; a head points nowhere", () => {
    expect(linkAnswerLines(["Нашёл одну задачу:", "Гульмира, «Сверка за октябрь» — принята, до пт 18:00"], candidates.slice(2, 3))).toEqual([null, "c"]);
  });

  it("one title, two people: the one the line names", () => {
    expect(linkAnswerLines(["Нашёл 2:", "Жасулан, «Проверить склад» — отправлена, без срока", "Гульмира, «Проверить склад» — принята, без срока"], candidates)).toEqual([null, "a", "b"]);
    expect(linkAnswerLines(["Гульмира, «Проверить склад» — принята"], candidates)).toEqual(["b"]);
  });

  it("the head names the person: their task, not a namesake's of another", () => {
    expect(linkAnswerLines(["Жасулан: 1 задача в работе:", "«Проверить склад» — отправлена, без срока"], candidates)).toEqual([null, "a"]);
  });

  it("one title, nobody named: the newest, then the next one", () => {
    expect(linkAnswerLines(["Гульмира: 2 задачи в работе:", "«Сверка за октябрь» — принята, без срока", "«Сверка за октябрь» — отправлена, без срока"], candidates)).toEqual([null, "d", "c"]);
  });

  it("the same task in two lists is one task", () => {
    expect(linkAnswerLines(["«Сверка за октябрь» — срок был вчера"], [candidates[2]!, candidates[2]!])).toEqual(["c"]);
  });

  it("a title is matched whole, with its quotes", () => {
    expect(linkAnswerLines(["Жасулан, «Проверить склад №2» — принята"], candidates)).toEqual([null]);
  });
});
