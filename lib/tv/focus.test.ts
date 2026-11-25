import { describe, expect, it } from "vitest";

import { STAGE_WORDS } from "./board";
import { PERSON_ITEMS, personView, STAGE_WORD, stageOf, taskPath, taskTitle } from "./focus";
import type { TvFocusEmployee, TvFocusTask, TvStoryEvent } from "./queries";
import { STAGE, stageWord } from "./words";

function focus(tasks: Partial<TvFocusTask>[], guest = false): TvFocusEmployee {
  return {
    mode: "employee",
    guest,
    expires_at: "2026-09-18T09:10:00Z",
    employee: { id: "e1", name: guest ? "Марат" : "Марат Оспанов", position: "Специалист" },
    tasks: tasks.map((task, index) => ({
      id: task.id ?? `t${index}`,
      title: "title" in task ? (task.title ?? null) : "Подписать акт",
      status: task.status ?? "sent",
      deadline: task.deadline ?? null,
      story: task.story,
    })),
  };
}

/** Everything the person scene would print, joined: what a passer-by could read off the wall. */
function printed(f: TvFocusEmployee): string {
  const view = personView(f);
  return [view.name, view.position, ...view.stats.map((stat) => `${stat.value} ${stat.label}`), ...view.items.flatMap((item) => [item.title, item.word])]
    .filter(Boolean)
    .join(" | ");
}

/** Words that must never reach the wall about a person (D-45, D-185). */
const NEGATIVE = /просроч|опозд|отказ|не мож|доработ|снова|возвра|новый срок|в срок|штраф|дел нет|нет дел|ждёт/i;

/** A whole life of an order, every kind of event — the wall must not turn any of it into words. */
const LIFE: TvStoryEvent[] = (
  ["posted", "seen", "accepted", "question", "text", "photo", "voice", "director", "deadline", "review", "again", "done"] as const
).map((k, i) => ({ k, at: `2026-09-18T0${Math.min(8, i)}:00:00Z`, to: "2026-09-10T05:00:00Z" }));

describe("stageOf — стадия словами стены", () => {
  it("нейтральные слова настоящего времени; доработка — «В работе» (D-45)", () => {
    expect(["sent", "accepted", "in_progress", "rework", "pending_review", "done"].map((s) => STAGE_WORD[stageOf(s)!])).toEqual([
      "Поручено",
      "В работе",
      "В работе",
      "В работе",
      "На проверке",
      "Готово",
    ]);
  });

  it("одни и те же четыре слова по всей стене: человек, дело, доска (lib/tv/words.ts)", () => {
    expect(Object.values(STAGE_WORD)).toEqual(Object.values(STAGE));
    expect(Object.values(STAGE)).toEqual(["Поручено", "В работе", "На проверке", "Готово"]);
    // inside a line — the same word in lower case
    expect(Object.values(STAGE_WORDS)).toEqual(["поручено", "в работе", "на проверке", "готово"]);
    expect((["sent", "work", "review", "done"] as const).map(stageWord)).toEqual(Object.values(STAGE_WORDS));
    expect([...Object.values(STAGE), ...Object.values(STAGE_WORDS)].join(" ")).not.toMatch(NEGATIVE);
  });

  it("отказ, отзыв и отложенное на стену не попадают вовсе", () => {
    for (const status of ["declined", "revoked", "scheduled", "whatever"]) expect(stageOf(status)).toBeNull();
    const view = personView(focus([{ status: "declined" }, { status: "revoked" }, { status: "accepted" }]));
    expect(view.items.map((item) => item.word)).toEqual(["В работе"]);
  });
});

describe("personView — человек на стене (D-185)", () => {
  const full = (): TvFocusEmployee => ({
    ...focus([{ status: "sent" }, { status: "accepted" }, { status: "rework" }, { status: "pending_review" }, { status: "accepted" }]),
    counts: { new: 1, work: 3, review: 1 },
    done_today: { count: 2, titles: ["Сверка", "Вывоз"] },
    rating: { points: true, rank: 2, weeks: [10, 20, 30, 90], done_week: 9, on_time_week: 8 },
    points_week: 90,
  });

  it("три хороших числа: сделано за неделю, в работе, очки недели", () => {
    expect(personView(full()).stats).toEqual([
      { key: "done", value: 9, label: "сделано за неделю" },
      { key: "open", value: 3, label: "задачи в работе" },
      { key: "points", value: 90, label: "очков за неделю" },
    ]);
  });

  it("до четырёх открытых дел — название и стадия, без сроков и хроники", () => {
    const view = personView(full());
    expect(view.mode).toBe("open");
    expect(view.items).toHaveLength(PERSON_ITEMS);
    expect(view.items.map((item) => item.word)).toEqual(["Поручено", "В работе", "В работе", "На проверке"]);
    expect(Object.keys(view.items[0]).sort()).toEqual(["id", "stage", "title", "word"]);
  });

  it("в работе — только взятые, по числам базы, не по показанным: поручено и на проверке — не «в работе»", () => {
    const f = { ...full(), counts: { new: 3, work: 9, review: 3 } };
    expect(personView(f).stats.find((stat) => stat.key === "open")?.value).toBe(9);
    // only orders not yet accepted: no «в работе» at all, the list names them «Поручено»
    const fresh = { ...full(), counts: { new: 2, work: 0, review: 0 }, tasks: focus([{ status: "sent" }, { status: "sent" }]).tasks };
    expect(personView(fresh).stats.find((stat) => stat.key === "open")).toBeUndefined();
    expect(personView(fresh).items.map((item) => item.word)).toEqual(["Поручено", "Поручено"]);
  });

  it("на стене нет ни отказа, ни просрочки, ни «доработки», ни «в срок» — при любой истории и сроке (D-45)", () => {
    for (const status of ["sent", "accepted", "in_progress", "rework", "pending_review", "done", "declined", "revoked"]) {
      const f = { ...full(), tasks: focus([{ status, story: LIFE, deadline: "2026-09-10T05:00:00Z" }]).tasks };
      expect(printed(f)).not.toMatch(NEGATIVE);
    }
    expect(printed({ ...full(), tasks: [] })).not.toMatch(NEGATIVE);
  });

  it("нули не печатаются: ни «0 в работе», ни «0 очков», ни «0 сделано»", () => {
    const f: TvFocusEmployee = {
      ...focus([]),
      counts: { new: 0, work: 0, review: 0 },
      done_today: { count: 0, titles: [] },
      rating: { points: true, rank: null, weeks: [0, 0, 0, 0], done_week: 0, on_time_week: 0 },
    };
    expect(personView(f).stats).toEqual([]);
    expect(printed(f)).not.toMatch(/\b0\b/);
  });

  it("минус очков и падение не печатаются; очки выключены — без очков (D-45)", () => {
    const minus = { ...full(), rating: { points: true, rank: 7, weeks: [80, 90, 120, -20], done_week: 3, on_time_week: 0 } };
    expect(personView(minus).stats.map((stat) => stat.key)).toEqual(["done", "open"]);
    expect(printed(minus)).not.toMatch(/-|место/);
    const off = { ...full(), points_week: 340, rating: { points: false, done_week: 9, on_time_week: 9 } };
    expect(personView(off).stats.map((stat) => stat.key)).toEqual(["done", "open"]);
  });

  it("база v2 без рейтинга — очки недели как были", () => {
    expect(personView({ ...focus([]), points_week: 42 }).stats).toEqual([{ key: "points", value: 42, label: "очка за неделю" }]);
    expect(personView({ ...focus([]), points_week: 0 }).stats).toEqual([]);
  });

  it("открытых нет — сданное за неделю словом «Готово»; нет ничего — пусто", () => {
    const done = personView({ ...focus([]), done_recent: [{ id: "d", title: "Сверка", status: "done", deadline: null }] });
    expect([done.mode, done.items.map((item) => [item.title, item.word])]).toEqual(["done", [["Сверка", "Готово"]]]);
    expect(personView(focus([])).mode).toBe("none");
  });

  it("гость: имя и числа, без дел и без очков (D-33)", () => {
    const g: TvFocusEmployee = {
      ...focus([{ status: "accepted", title: null }, { status: "sent", title: null }], true),
      counts: { new: 1, work: 1, review: 0 },
      done_today: { count: 2, titles: [null, null] },
      points_week: 340,
      rating: null,
      done_recent: [{ id: "d", title: null, status: "done", deadline: null }],
    };
    const view = personView(g);
    expect(view.name).toBe("Марат");
    expect([view.items, view.mode]).toEqual([[], "none"]);
    expect(view.stats).toEqual([
      { key: "done", value: 2, label: "сделано сегодня" },
      { key: "open", value: 1, label: "задача в работе" },
    ]);
  });

  it("аватар — только настоящий адрес фото", () => {
    const f = focus([]);
    expect(personView({ ...f, employee: { ...f.employee, avatar_url: "https://x/a.jpg" } }).avatar).toBe("https://x/a.jpg");
    expect(personView({ ...f, employee: { ...f.employee, avatar_url: "" } }).avatar).toBeNull();
  });
});

describe("taskPath — одно дело во весь экран (D-123, D-185)", () => {
  const states = (status: string) => taskPath({ status }).map((step) => step.state);

  it("четыре шага словами настоящего времени, текущий — «сейчас»", () => {
    expect(taskPath({ status: "pending_review" })).toEqual([
      { key: "posted", label: "Поручено", state: "passed" },
      { key: "work", label: "В работе", state: "passed" },
      { key: "review", label: "На проверке", state: "now" },
      { key: "done", label: "Готово", state: "next" },
    ]);
    expect(states("sent")).toEqual(["now", "next", "next", "next"]);
    expect(states("done")).toEqual(["passed", "passed", "passed", "now"]);
    expect(taskPath({ status: "accepted" }).map((step) => step.label).join(" → ")).toBe("Поручено → В работе → На проверке → Готово");
  });

  it("возврат на доработку — снова «В работе»: проверка опять впереди, без своего слова (D-45)", () => {
    expect(states("rework")).toEqual(["passed", "now", "next", "next"]);
    for (const status of ["sent", "accepted", "rework", "pending_review", "done", "declined"]) {
      expect(taskPath({ status }).map((step) => step.label).join(" ")).not.toMatch(NEGATIVE);
    }
  });

  it("без заголовка — «Задача»", () => {
    expect(taskTitle({ title: null })).toBe("Задача");
    expect(taskTitle({ title: "  Замер окон " })).toBe("Замер окон");
  });
});
