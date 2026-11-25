import { describe, expect, it } from "vitest";

import { statusWord as wordOf, stepsOf as stepsFor } from "./overview";

describe("a handed-over task (D-128)", () => {
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

  it("a recall after a refusal keeps the refusal on its way (D-142)", () => {
    const refusedAt = "2026-09-20T05:00:00Z";
    expect(stepsFor(base, new Date("2026-09-22T04:00:00Z"), { declinedAt: refusedAt }).map((s) => `${s.label}:${s.state}`)).toEqual([
      "Поручено:done",
      "Отказ:bad",
      "На проверке:todo",
      "Отозвана:bad",
    ]);
    // refused after it was taken: the refusal stands where the handover would have been
    const taken = { ...base, accepted_at: "2026-09-20T04:30:00Z" };
    expect(stepsFor(taken, new Date("2026-09-22T04:00:00Z"), { declinedAt: refusedAt }).map((s) => s.label)).toEqual(["Поручено", "В работе", "Отказ", "Отозвана"]);
  });

  it("a plain revoke stays «отозвана»", () => {
    expect(wordOf(base, "director")).toBe("отозвана");
    expect(stepsFor(base).at(-1)).toMatchObject({ label: "Отозвана", state: "bad" });
  });
});

import type { DeskReason } from "./reasons";
import {
  closedSections,
  closedTodayCount,
  directorScreen,
  directorTabOf,
  DIRECTOR_TAB_LABEL,
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

  it("the director's middle tab is «У команды»: taken and not taken yet live in it (the owner, 2026-11-25)", () => {
    expect(DIRECTOR_TAB_LABEL).toEqual({ yours: "Ждут вас", working: "У команды", closed: "Закрытые" });
    expect(directorTabOf({ status: "sent" }, null)).toBe("working");
  });

  it("the employee's piles: to take up (new and returned, D-173), in hand, over", () => {
    expect(employeeTabOf({ status: "sent" })).toBe("new");
    expect(employeeTabOf({ status: "rework" })).toBe("new");
    expect(employeeTabOf({ status: "accepted" })).toBe("working");
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
      ["На проверке", "warn", 1],
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

  it("the director's «В работе»: orders nobody has taken stand first as «Не приняты», amber once one waited half an hour", () => {
    const fresh = task({ status: "sent", created_at: "2026-09-17T06:50:00Z", deadline: at("17") });
    const taken = task({ status: "accepted", deadline: at("17") });
    const calm = workingSections([taken, fresh], NOW, { reviewTitle: "На проверке", unacceptedFirst: true });
    expect(calm.map((s) => [s.title, s.tone, s.tasks.length])).toEqual([
      ["Не приняты", "muted", 1],
      ["Сегодня", "muted", 1],
    ]);
    const stale = task({ status: "sent" });
    expect(workingSections([fresh, stale], NOW, { unacceptedFirst: true })[0]).toMatchObject({ title: "Не приняты", tone: "warn" });
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
    // the order untaken for two days needs him too, said after the queue
    expect(screen.detail).toBe("1 на проверке · 1 вопрос · 1 просрочка · 1 не принята давно");
    expect(screen.segments.map((s) => [s.key, s.count, s.tone])).toEqual([
      ["overdue", 1, "danger"],
      ["waiting", 2, "warn"],
      ["working", 1, "ok"],
      ["unseen", 1, "wait"],
      ["scheduled", 1, "muted"],
    ]);
    expect(screen.open).toBe(6);
    expect(screen.closedToday).toBe(1);
  });

  it("nothing waits and nothing needs him: «по плану» with the work taken, the nearest deadline", () => {
    const soon = task({ status: "accepted", deadline: at("17", 18), title: "КП для Казхрома" });
    // handed out ten minutes ago: inside the half hour it is not a worry yet
    const fresh = task({ status: "sent", created_at: "2026-09-17T06:50:00Z" });
    const tasks = [soon, fresh, task({ status: "accepted", deadline: at("20") })];
    const screen = directorScreen(tasks, reasonsOf(tasks), NOW);
    expect(screen.eyebrow).toBe("Всё идёт по плану");
    expect(screen.tone).toBe("ok");
    expect(screen.value).toBe(3);
    expect(screen.label).toBe("задачи у команды");
    // the legend says «1 не принята» — the words do not say it again
    expect(screen.detail).toBe("решений от вас не ждут");
    expect(screen.attention?.ok).toBe(true);
    expect(screen.nearest).toEqual({ id: soon.id, title: "КП для Казхрома", who: "Марат", at: soon.deadline });
  });

  it("D-194: an order untaken since yesterday is never «всё идёт по плану»", () => {
    const stale = task({ status: "sent", title: "Тест", created_at: "2026-09-16T12:40:00Z" });
    const screen = directorScreen([stale], reasonsOf([stale]), NOW);
    expect(screen.eyebrow).toBe("Требует внимания");
    expect(screen.tone).toBe("warn");
    expect([screen.value, screen.label]).toEqual([1, "задача не принята"]);
    expect(screen.detail).toBe("Тест · не принята с вчера 17:40");
    expect(screen.focus).toBe(stale.id);
    expect(screen.detail).not.toMatch(/решений не ждут/);
    // the bar: nothing taken — one hollow segment, never a full green one
    expect(screen.segments).toEqual([{ key: "unseen", label: "не принята", count: 1, tone: "wait" }]);
  });

  it("D-194: pushes that do not reach the holder need the director at once, before the half hour", () => {
    const fresh = task({ status: "sent", title: "Тест", created_at: "2026-09-17T06:55:00Z" });
    const screen = directorScreen([fresh], reasonsOf([fresh]), NOW, { noPush: new Set(["marat"]) });
    expect(screen.eyebrow).toBe("Требует внимания");
    expect(screen.detail).toBe("Марат · уведомления не доходят");
    expect(screen.attention?.action).toBe("call");
  });

  it("nothing taken yet and inside the half hour: «Ждём ответа» in grey, not green", () => {
    const fresh = task({ status: "sent", created_at: "2026-09-17T06:55:00Z" });
    const screen = directorScreen([fresh], reasonsOf([fresh]), NOW);
    expect([screen.eyebrow, screen.tone, screen.label, screen.detail]).toEqual(["Ждём ответа", "muted", "задача у команды", "ещё не принята · решений не ждут"]);
  });

  it("one task for one reason: the words do not repeat the big «1»", () => {
    const review = task({ status: "pending_review" });
    const screen = directorScreen([review], reasonsOf([review]), NOW);
    expect([screen.value, screen.label, screen.detail]).toEqual([1, "задача ждёт вас", "на проверке"]);
  });

  it("all closed: a calm check and today's count", () => {
    const tasks = [task({ status: "done", closed_at: at("17", 9) }), task({ status: "revoked", closed_at: at("17", 9) })];
    const screen = directorScreen(tasks, reasonsOf(tasks), NOW);
    expect(screen.value).toBeNull();
    expect(screen.label).toBe("Открытых задач нет");
    expect(screen.detail).toBe("");
    expect(screen.closedToday).toBe(1);
    expect(screen.segments).toEqual([]);
  });
});

describe("the employee's status screen (D-173)", () => {
  it("one line while orders wait for the person: new, returned and late in work, counted as the badge counts them", () => {
    const late = task({ status: "accepted", deadline: at("16"), title: "Акт сверки" });
    const screen = employeeScreen(
      [task({ status: "sent" }), task({ status: "rework" }), late, task({ status: "accepted" }), task({ status: "pending_review", deadline: at("17", 9) })],
      NOW,
    );
    expect(screen.variant).toBe("compact");
    expect(screen.value).toBe(3);
    expect(screen.label).toBe("задачи ждут вас");
    expect(screen.detail).toBe("1 новая · 1 на доработке · 1 просрочена");
    expect(screen.tone).toBe("danger");
    // the late one is named, handed-in work (its deadline met) never is
    expect(screen.nearest).toEqual({ id: late.id, title: "Акт сверки", who: "", at: late.deadline, late: true });
  });

  it("a new order alone: one line in amber — the person's move, never the brand colour", () => {
    const fresh = task({ status: "sent", deadline: at("17", 18) });
    const screen = employeeScreen([fresh], NOW);
    expect(screen.variant).toBe("compact");
    expect([screen.value, screen.label, screen.tone]).toEqual([1, "задача ждёт вас", "warn"]);
    expect(screen.nearest).toMatchObject({ id: fresh.id, late: false });
  });

  it("nothing waits: the work in hand is the «В работе» tab's own number, handed-in work counted in it", () => {
    const soon = task({ status: "accepted", deadline: at("17", 18), title: "Каски" });
    const screen = employeeScreen([soon, task({ status: "accepted" }), task({ status: "pending_review", deadline: at("17", 13) })], NOW);
    expect(screen.variant).toBe("lean");
    expect(screen.eyebrow).toBe("Всё по плану");
    expect(screen.value).toBe(3);
    expect(screen.label).toBe("задачи в работе");
    expect(screen.detail).toBe("из них 1 на проверке у директора");
    expect(screen.tone).toBe("ok");
    // the nearest deadline is the person's own, not the handed-in one at 13:00
    expect(screen.nearest).toMatchObject({ id: soon.id, title: "Каски", late: false });
  });

  it("only handed in: a calm check, the director's move", () => {
    const screen = employeeScreen([task({ status: "pending_review" })], NOW);
    expect([screen.variant, screen.value, screen.label, screen.detail, screen.tone]).toEqual(["lean", null, "1 задача на проверке", "директор посмотрит и закроет", "muted"]);
  });

  it("nothing open", () => {
    const screen = employeeScreen([task({ status: "done", closed_at: at("17", 9) })], NOW);
    expect(screen.variant).toBe("lean");
    expect(screen.value).toBeNull();
    // the one empty phrase of the product (DESIGN §5)
    expect([screen.eyebrow, screen.label]).toEqual(["Дел нет", "Придёт задача — я позову"]);
    expect(screen.closedToday).toBe(1);
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

  it("the wall's ladder Поручено → В работе → На проверке → Готово, the ring on the stage the task is at now", () => {
    // D-194: an untaken task stands at «Поручено» — «В работе» has not happened yet
    const fresh = task({ status: "sent", created_at: "2026-09-17T06:50:00Z" });
    expect(states(fresh)).toEqual(["Поручено:current", "В работе:todo", "На проверке:todo", "Готово:todo"]);
    // untaken for two days: the stage turns amber, still not «В работе»
    expect(states(task({ status: "sent" }))).toEqual(["Поручено:warn", "В работе:todo", "На проверке:todo", "Готово:todo"]);
    // the assignee's own view: a new one waits for them (D-173)
    const mine = (t: ListTask) => stepsOf(t, NOW, { forAssignee: true }).map((s) => `${s.label}:${s.state}`);
    expect(mine(task({ status: "sent" }))).toEqual(["Ждёт вас:current", "В работе:todo", "На проверке:todo", "Готово:todo"]);
    expect(mine(task({ status: "sent", deadline: at("16") }))[0]).toBe("Ждёт вас:bad");
    // past «Принял» the assignee reads the same stations as the director
    expect(mine(task({ status: "accepted", accepted_at: at("15", 10) }))).toEqual(states(task({ status: "accepted", accepted_at: at("15", 10) })));
    expect(states(task({ status: "accepted", accepted_at: at("15", 10) }))).toEqual(["Поручено:done", "В работе:current", "На проверке:todo", "Готово:todo"]);
    expect(states(task({ status: "pending_review", accepted_at: at("15", 10), completed_at: at("16", 10) }))).toEqual([
      "Поручено:done",
      "В работе:done",
      "На проверке:current",
      "Готово:todo",
    ]);
    expect(states(task({ status: "done", closed_at: at("17", 9) }))).toEqual(["Поручено:done", "В работе:done", "На проверке:done", "Готово:done"]);
    // the words of the ladder never say «Сдана», «Сдача», «Выдана» (FIX §4.4)
    const all = (["sent", "accepted", "pending_review", "done", "rework", "declined", "scheduled"] as const).flatMap((status) =>
      stepsOf(task({ status, scheduled_send_at: status === "scheduled" ? at("18", 9) : null }), NOW).map((s) => s.label),
    );
    expect(all.filter((label) => /Сдан|Сдача|Выдана|Закрыта|Проверка$/.test(label))).toEqual([]);
  });

  it("a late step is red, a detour replaces the step it happened at", () => {
    expect(states(task({ status: "accepted", deadline: at("16") }))[1]).toBe("В работе:bad");
    expect(states(task({ status: "rework" }))[1]).toBe("Доработка:warn");
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
    // a return sits with the new ones (D-173): «на доработке», late or not — the short word fits beside the pill
    expect(statusWord(task({ status: "rework" }), "employee", NOW)).toBe("на доработке");
    expect(statusWord(task({ status: "rework", deadline: at("16") }), "employee", NOW)).toBe("на доработке");
    expect(statusWord(task({ status: "rework" }), "director", NOW)).toBe("на доработке");
    expect(statusWord(task({ status: "pending_review" }), "director", NOW)).toBe("на проверке");
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
