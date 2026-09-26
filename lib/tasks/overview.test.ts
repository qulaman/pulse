import { describe, expect, it } from "vitest";

import { statusWord as wordOf, stepsOf as stepsFor } from "./overview";

describe("a handed-over task (D-129)", () => {
  const base = {
    id: "t-passed",
    status: "revoked" as const,
    deadline: null,
    priority: "normal" as const,
    created_at: "2026-09-20T04:00:00Z",
    title: "Датчики",
    body: null,
    assignee_id: "u",
    assignee: null,
    accepted_at: null,
    completed_at: null,
    closed_at: "2026-09-21T04:00:00Z",
    updated_at: "2026-09-21T04:00:00Z",
    scheduled_send_at: null,
  };

  it("says «передана» and ends calm", () => {
    expect(wordOf({ ...base, passed_to: "p" }, "employee")).toBe("передана");
    expect(stepsFor({ ...base, passed_to: "p" }).at(-1)).toMatchObject({ label: "Передана", state: "done" });
  });

  it("a plain revoke stays «отозвана»", () => {
    expect(wordOf(base, "director")).toBe("отозвана");
    expect(stepsFor(base).at(-1)).toMatchObject({ label: "Отозвана", state: "bad" });
  });
});

import type { DeskReason } from "./desk";
import {
  closedSections,
  closedTodayCount,
  directorScreen,
  directorTabOf,
  employeeScreen,
  employeeTabOf,
  matchesQuery,
  peopleLoad,
  reasonFor,
  spanRu,
  statusWord,
  stepsOf,
  timeLeft,
  workingSections,
  yoursSections,
  type ListTask,
} from "./overview";
import type { TaskStatus } from "./status-text";

// 2026-09-17 12:00 Aqtobe (UTC+5)
const NOW = new Date("2026-09-17T07:00:00Z");

/** Aqtobe wall clock: 18:00 local is 13:00 UTC. */
const at = (day: string, hour = 18) => `2026-09-${day}T${String(hour - 5).padStart(2, "0")}:00:00Z`;

let seq = 0;

function task(extra: Partial<ListTask> & { status?: TaskStatus } = {}): ListTask {
  seq += 1;
  return {
    id: `t-${seq}`,
    status: "sent",
    deadline: null,
    priority: "normal",
    created_at: at("15", 9),
    updated_at: at("15", 9),
    title: `Задача ${seq}`,
    body: null,
    assignee_id: "marat",
    assignee: { full_name: "Марат Оспанов" },
    accepted_at: null,
    completed_at: null,
    closed_at: null,
    scheduled_send_at: null,
    ...extra,
  };
}

function reasonsOf(tasks: ListTask[], questions: Record<string, string> = {}): Map<string, DeskReason> {
  const map = new Map<string, DeskReason>();
  for (const t of tasks) {
    const reason = reasonFor(t, questions[t.id], NOW);
    if (reason) map.set(t.id, reason);
  }
  return map;
}

describe("tabs", () => {
  it("the director's piles are disjoint: my move, their move, history", () => {
    expect(directorTabOf({ status: "pending_review" }, "review")).toBe("yours");
    expect(directorTabOf({ status: "accepted" }, "overdue")).toBe("yours");
    expect(directorTabOf({ status: "declined" }, "declined")).toBe("yours");
    expect(directorTabOf({ status: "accepted" }, null)).toBe("working");
    expect(directorTabOf({ status: "scheduled" }, null)).toBe("working");
    expect(directorTabOf({ status: "done" }, null)).toBe("closed");
    expect(directorTabOf({ status: "revoked" }, null)).toBe("closed");
  });

  it("the employee's piles: to accept, in hand, over", () => {
    expect(employeeTabOf({ status: "sent" })).toBe("new");
    expect(employeeTabOf({ status: "accepted" })).toBe("working");
    expect(employeeTabOf({ status: "rework" })).toBe("working");
    expect(employeeTabOf({ status: "pending_review" })).toBe("working");
    expect(employeeTabOf({ status: "done" })).toBe("closed");
    expect(employeeTabOf({ status: "declined" })).toBe("closed");
    expect(employeeTabOf({ status: "revoked" })).toBe("closed");
  });

  it("a question needs the board row: without it the task is just in work", () => {
    const t = task({ status: "accepted" });
    expect(reasonFor(t, "Какой адрес?", NOW)).toBe("question");
    expect(reasonFor(t, null, NOW)).toBeNull();
  });

  it("search looks at the title, the description and the person", () => {
    const t = task({ title: "КП для Казхрома", body: "с ценами на сентябрь" });
    expect(matchesQuery(t, "казхром")).toBe(true);
    expect(matchesQuery(t, "сентябрь")).toBe(true);
    expect(matchesQuery(t, "марат")).toBe(true);
    expect(matchesQuery(t, "асхат")).toBe(false);
    expect(matchesQuery(t, "  ")).toBe(true);
  });
});

describe("sections", () => {
  it("«Ждут вас»: one section per reason in the queue's order", () => {
    const review = task({ status: "pending_review" });
    const late = task({ status: "accepted", deadline: at("16") });
    const asked = task({ status: "accepted" });
    const sections = yoursSections([
      { task: late, reason: "overdue" },
      { task: asked, reason: "question" },
      { task: review, reason: "review" },
    ]);
    expect(sections.map((s) => [s.title, s.tone, s.tasks.length])).toEqual([
      ["На приёмке", "warn", 1],
      ["Вопросы", "warn", 1],
      ["Просрочено", "danger", 1],
    ]);
  });

  it("«В работе»: deadline piles, handed-in work at the foot, «отправлю позже» last", () => {
    const today = task({ status: "accepted", deadline: at("17") });
    const tomorrow = task({ status: "sent", deadline: at("18") });
    const none = task({ status: "accepted" });
    const handedIn = task({ status: "pending_review" });
    const later = task({ status: "scheduled", scheduled_send_at: at("18", 9) });
    const titles = workingSections([later, none, handedIn, tomorrow, today], NOW).map((s) => s.title);
    expect(titles).toEqual(["Сегодня", "Завтра", "Без срока", "На проверке у директора", "Отправлю позже"]);
  });

  it("history by the day it closed, newest first", () => {
    const todayDone = task({ status: "done", closed_at: at("17", 10) });
    const yesterday = task({ status: "revoked", closed_at: at("16", 10) });
    const old = task({ status: "done", closed_at: at("01", 10) });
    const legacy = task({ status: "done", updated_at: at("17", 11) });
    const sections = closedSections([old, yesterday, todayDone, legacy], NOW);
    expect(sections.map((s) => s.title)).toEqual(["Сегодня", "Вчера", "Раньше"]);
    expect(sections[0].tasks.map((t) => t.id)).toEqual([legacy.id, todayDone.id]);
  });
});

describe("the director's status screen", () => {
  it("my move first, red while something is late", () => {
    const tasks = [
      task({ status: "pending_review" }),
      task({ status: "accepted", deadline: at("16") }),
      task({ status: "accepted", id: "asked" }),
      task({ status: "sent" }),
      task({ status: "accepted" }),
      task({ status: "scheduled" }),
      task({ status: "done", closed_at: at("17", 9) }),
    ];
    const screen = directorScreen(tasks, reasonsOf(tasks, { asked: "Какой адрес?" }), NOW);
    expect(screen.eyebrow).toBe("Ваш ход");
    expect(screen.tone).toBe("danger");
    expect(screen.value).toBe(3);
    expect(screen.label).toBe("задачи ждут вас");
    expect(screen.detail).toBe("1 на приёмке · 1 вопрос · 1 просрочка");
    expect(screen.segments.map((s) => [s.key, s.count])).toEqual([
      ["overdue", 1],
      ["waiting", 2],
      ["unseen", 1],
      ["working", 1],
      ["scheduled", 1],
    ]);
    expect(screen.open).toBe(6);
    expect(screen.closedToday).toBe(1);
  });

  it("nothing waits: how much the team carries, and the nearest deadline", () => {
    const soon = task({ status: "accepted", deadline: at("17", 18), title: "КП для Казхрома" });
    const tasks = [soon, task({ status: "sent" }), task({ status: "accepted", deadline: at("20") })];
    const screen = directorScreen(tasks, reasonsOf(tasks), NOW);
    expect(screen.tone).toBe("ok");
    expect(screen.value).toBe(3);
    expect(screen.label).toBe("задачи у команды");
    expect(screen.detail).toBe("1 ещё не принята · решений не ждут");
    expect(screen.nearest).toEqual({ id: soon.id, title: "КП для Казхрома", who: "Марат", at: soon.deadline });
  });

  it("all closed: a calm check and today's count", () => {
    const tasks = [task({ status: "done", closed_at: at("17", 9) }), task({ status: "revoked", closed_at: at("17", 9) })];
    const screen = directorScreen(tasks, reasonsOf(tasks), NOW);
    expect(screen.value).toBeNull();
    expect(screen.label).toBe("Открытых задач нет");
    expect(screen.detail).toBe("Сегодня закрыто: 1");
    expect(screen.segments).toEqual([]);
  });
});

describe("the employee's status screen", () => {
  it("new work first", () => {
    const screen = employeeScreen([task({ status: "sent" }), task({ status: "sent" }), task({ status: "accepted" })], NOW);
    expect(screen.eyebrow).toBe("Новые поручения");
    expect(screen.value).toBe(2);
    expect(screen.label).toBe("новых поручения");
    expect(screen.detail).toBe("примите в работу");
  });

  it("then what is late", () => {
    const screen = employeeScreen([task({ status: "accepted", deadline: at("16") }), task({ status: "accepted" })], NOW);
    expect(screen.tone).toBe("danger");
    expect(screen.value).toBe(1);
    expect(screen.label).toBe("дело просрочено");
  });

  it("then what is in hand, handed-in work counted but quiet", () => {
    const screen = employeeScreen(
      [task({ status: "accepted", deadline: at("17", 18) }), task({ status: "rework" }), task({ status: "pending_review" })],
      NOW,
    );
    expect(screen.value).toBe(2);
    expect(screen.tone).toBe("warn");
    expect(screen.detail).toBe("ближайший срок сегодня 18:00 · 1 на проверке");
    expect(screen.segments.map((s) => s.key)).toEqual(["rework", "working", "review"]);
  });

  it("nothing open", () => {
    const screen = employeeScreen([task({ status: "done", closed_at: at("17", 9) })], NOW);
    expect(screen.value).toBeNull();
    expect(screen.label).toBe("Открытых дел нет");
    expect(screen.detail).toBe("Сегодня закрыто: 1");
  });
});

describe("peopleLoad", () => {
  it("the director's move first, then late work, then the busiest; closed work does not count", () => {
    const tasks = [
      task({ assignee_id: "a", assignee: { full_name: "Асхат" }, status: "accepted" }),
      task({ assignee_id: "a", assignee: { full_name: "Асхат" }, status: "accepted" }),
      task({ assignee_id: "b", assignee: { full_name: "Бота" }, status: "pending_review" }),
      task({ assignee_id: "c", assignee: { full_name: "Ерлан" }, status: "done" }),
    ];
    const people = peopleLoad(tasks, reasonsOf(tasks));
    expect(people.map((p) => [p.name, p.open, p.yours])).toEqual([
      ["Бота", 1, 1],
      ["Асхат", 2, 0],
    ]);
  });
});

describe("stepsOf", () => {
  const states = (t: ListTask) => stepsOf(t, NOW).map((s) => `${s.label}:${s.state}`);

  it("follows the task from handed out to accepted", () => {
    expect(states(task({ status: "sent" }))).toEqual(["Выдана:done", "Принять:current", "Сдана:todo", "Принята:todo"]);
    expect(states(task({ status: "accepted", accepted_at: at("15", 10) }))).toEqual([
      "Выдана:done",
      "В работе:done",
      "Сдать:current",
      "Принята:todo",
    ]);
    expect(states(task({ status: "pending_review", accepted_at: at("15", 10), completed_at: at("16", 10) }))).toEqual([
      "Выдана:done",
      "В работе:done",
      "Сдана:done",
      "Проверка:current",
    ]);
    expect(states(task({ status: "done", closed_at: at("17", 9) }))).toEqual(["Выдана:done", "В работе:done", "Сдана:done", "Принята:done"]);
  });

  it("a late step is red, a detour replaces the step it happened at", () => {
    expect(states(task({ status: "accepted", deadline: at("16") }))[2]).toBe("Сдать:bad");
    expect(states(task({ status: "rework" }))[2]).toBe("Доработка:warn");
    expect(states(task({ status: "declined" }))[1]).toBe("Отказ:bad");
    expect(states(task({ status: "revoked" }))[3]).toBe("Отозвана:bad");
    expect(states(task({ status: "scheduled", scheduled_send_at: at("18", 9) }))[0]).toBe("Уйдёт:current");
  });
});

describe("statusWord", () => {
  it("says what each reader watches", () => {
    expect(statusWord(task({ status: "sent" }), "director", NOW)).toBe("не принята");
    expect(statusWord(task({ status: "sent" }), "employee", NOW)).toBe("новая · примите");
    // a new task past its deadline still asks the employee for «Принял» first
    expect(statusWord(task({ status: "sent", deadline: at("16") }), "employee", NOW)).toBe("новая · примите");
    expect(statusWord(task({ status: "sent", deadline: at("16") }), "director", NOW)).toBe("просрочена");
    expect(statusWord(task({ status: "pending_review" }), "employee", NOW)).toBe("на проверке");
    expect(statusWord(task({ status: "pending_review" }), "director", NOW)).toBe("на приёмке");
    expect(statusWord(task({ status: "scheduled", scheduled_send_at: at("18", 9) }), "director", NOW)).toBe("уйдёт завтра 09:00");
  });
});

describe("closedTodayCount", () => {
  it("counts accepted work of today, or of the last N days", () => {
    const tasks = [
      task({ status: "done", closed_at: at("17", 9) }),
      task({ status: "done", closed_at: at("14", 9) }),
      task({ status: "revoked", closed_at: at("17", 9) }),
      task({ status: "done", closed_at: at("01", 9) }),
    ];
    expect(closedTodayCount(tasks, NOW)).toBe(1);
    expect(closedTodayCount(tasks, NOW, 7)).toBe(2);
  });
});

describe("spanRu / timeLeft", () => {
  it("says a span the way a person does", () => {
    expect(spanRu(40 * 60_000)).toBe("40 мин");
    expect(spanRu(20_000)).toBe("1 мин");
    expect(spanRu((3 * 60 + 20) * 60_000)).toBe("3 ч 20 мин");
    expect(spanRu(9 * 3_600_000 + 5 * 60_000)).toBe("9 ч");
    expect(spanRu((2 * 24 + 4) * 3_600_000)).toBe("2 дня 4 ч");
    expect(spanRu(12 * 24 * 3_600_000)).toBe("12 дней");
  });

  it("time left, late, and how it ended", () => {
    const open = task({ status: "accepted", created_at: at("17", 6), deadline: at("17", 18) });
    expect(timeLeft(open, NOW)).toEqual({ text: "осталось 6 ч", tone: "warn", used: 0.5 });
    expect(timeLeft(task({ status: "accepted", deadline: at("17", 10) }), NOW)).toMatchObject({ text: "просрочено на 2 ч", tone: "danger", used: 1 });
    expect(timeLeft(task({ status: "sent" }), NOW)).toEqual({ text: "без срока", tone: "muted", used: null });
    expect(timeLeft(task({ status: "accepted", priority: "high" }), NOW)).toEqual({ text: "срочно — время не названо", tone: "warn", used: null });
    expect(timeLeft(task({ status: "done", closed_at: at("17", 9) }), NOW).text).toBe("принята сегодня 09:00");
    expect(timeLeft(task({ status: "pending_review", completed_at: at("16", 15) }), NOW).text).toBe("сдана вчера 15:00 · ждёт проверки");
  });
});
