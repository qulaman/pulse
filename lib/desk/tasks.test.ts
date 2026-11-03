import { describe, expect, it } from "vitest";

import type { DeliveryRow } from "@/lib/tasks/receipts";

import {
  ACT_LABEL,
  bulkPlan,
  cursorStep,
  deadlinePresets,
  decisionLine,
  deliveryLine,
  enterMove,
  firstChanged,
  fitColumn,
  groupChoices,
  groupOf,
  inPlaceOf,
  isDangerAction,
  keyOfAction,
  latestLine,
  matchesDue,
  matchesStatus,
  opensRun,
  parseTab,
  parseTimeInput,
  personNow,
  pickedInOrder,
  pickRange,
  reasonHeadline,
  rowKeys,
  rowMoves,
  shiftYmd,
  stackMoves,
  stageOf,
  stepHm,
  tableSections,
  togglePick,
  underTitle,
  wallIso,
  wallYmd,
  weekdayOf,
  withSkipped,
} from "./tasks";

// 2026-11-03 12:00 in Aqtobe (UTC+5)
const NOW = new Date("2026-11-03T07:00:00Z");
const at = (iso: string) => new Date(iso).toISOString();

const delivery = (patch: Partial<DeliveryRow>): DeliveryRow =>
  ({
    acted_at: null,
    seen_at: null,
    status: "sent",
    sent_at: at("2026-11-03T04:14:00Z"),
    created_at: at("2026-11-03T04:14:00Z"),
    last_error: null,
    deliver_after: null,
    ...patch,
  }) as DeliveryRow;

describe("filters", () => {
  it("«сегодня» is what is still ahead today; a late task is «просрочено» only", () => {
    const today = { status: "accepted" as const, deadline: at("2026-11-03T13:00:00Z") };
    const late = { status: "accepted" as const, deadline: at("2026-11-03T05:00:00Z") };
    expect(matchesDue(today, "today", NOW)).toBe(true);
    expect(matchesDue(late, "today", NOW)).toBe(false);
    expect(matchesDue(late, "overdue", NOW)).toBe(true);
    expect(matchesDue({ status: "sent", deadline: at("2026-11-04T10:00:00Z") }, "tomorrow", NOW)).toBe(true);
    expect(matchesDue({ status: "sent", deadline: at("2026-11-09T10:00:00Z") }, "week", NOW)).toBe(true);
    expect(matchesDue({ status: "sent", deadline: at("2026-11-20T10:00:00Z") }, "week", NOW)).toBe(false);
    expect(matchesDue({ status: "sent", deadline: null }, "none", NOW)).toBe(true);
    expect(matchesDue({ status: "sent", deadline: null }, null, NOW)).toBe(true);
    // handed in three days ago against a deadline back then: neither today nor this week
    expect(matchesDue({ status: "pending_review", deadline: at("2026-10-31T10:00:00Z") }, "today", NOW)).toBe(false);
    expect(matchesDue({ status: "pending_review", deadline: at("2026-10-31T10:00:00Z") }, "week", NOW)).toBe(false);
  });

  it("«В работе» takes in_progress too", () => {
    expect(matchesStatus({ status: "in_progress" }, "accepted")).toBe(true);
    expect(matchesStatus({ status: "rework" }, "accepted")).toBe(false);
    expect(matchesStatus({ status: "rework" }, null)).toBe(true);
  });

  it("reads only the three tabs from the address", () => {
    expect(parseTab("closed")).toBe("closed");
    expect(parseTab("all")).toBeNull();
    expect(parseTab(null)).toBeNull();
  });
});

describe("a row's words", () => {
  it("the stage is the director's move by its name, else the stage", () => {
    const task = { status: "pending_review" as const, deadline: null };
    expect(stageOf(task, "review", NOW)).toEqual({ text: "на приёмке", tone: "warn" });
    expect(stageOf({ status: "sent", deadline: null }, null, NOW).text).toBe("не принята");
    // a question keeps the stage — «Последнее» says the question
    expect(stageOf({ status: "accepted", deadline: null }, "question", NOW).text).toBe("в работе");
  });

  it("«Доставка» says «не открывал с», never «не получил»; once taken — «принял»", () => {
    const sent = { status: "sent" as const, accepted_at: null };
    expect(deliveryLine(sent, delivery({}), NOW)).toEqual({ text: "не открывал с 09:14", tone: "warn" });
    expect(deliveryLine(sent, delivery({ seen_at: at("2026-11-03T04:20:00Z") }), NOW)?.text).toBe("увидел 09:20");
    expect(deliveryLine(sent, delivery({ status: "failed", last_error: "no_subscription" }), NOW)?.text).toBe("уведомления не включены");
    expect(deliveryLine(sent, null, NOW)).toBeNull();
    expect(deliveryLine({ status: "accepted", accepted_at: at("2026-11-03T04:22:00Z") }, null, NOW)).toEqual({ text: "принял 09:22", tone: "ok" });
    expect(deliveryLine({ status: "revoked", accepted_at: null }, null, NOW)).toBeNull();
  });

  it("«Последнее»: the question, the refusal, the handed-in work", () => {
    const task = { status: "accepted" as const, assignee_id: "e1" };
    const row = { question: "Какой формат?", time_request: null, decline_reason: null, partial: false, last_message: null };
    expect(latestLine(task, row, NOW)).toEqual({ text: "«Какой формат?»", tone: "warn" });
    expect(latestLine({ status: "declined", assignee_id: "e1" }, { ...row, question: null, decline_reason: "Нет доступа" }, NOW)?.text).toBe("отказ: Нет доступа");
    const handed = {
      ...row,
      question: null,
      partial: true,
      last_message: { id: "m1", content: "готово", type: "photo", sender_id: "e1", seq: 3, created_at: at("2026-11-03T06:00:00Z") },
    };
    expect(latestLine({ status: "pending_review", assignee_id: "e1" }, handed, NOW)?.text).toBe("сдано с фото · не всё · «готово»");
    expect(latestLine(task, undefined, NOW)).toBeNull();
  });

  it("the grey line under the title is the newest word unless «Последнее» says it", () => {
    const last = { id: "m1", content: "Еду", type: "text", sender_id: "e1", seq: 2, created_at: at("2026-11-03T06:00:00Z") };
    const row = { question: null, time_request: null, decline_reason: null, partial: false, last_message: last };
    expect(underTitle({ status: "accepted", assignee_id: "e1" }, row, "d1", NOW)).toBe("Еду");
    expect(underTitle({ status: "accepted", assignee_id: "e1" }, { ...row, last_message: { ...last, sender_id: "d1" } }, "d1", NOW)).toBe("Вы: Еду");
    expect(underTitle({ status: "accepted", assignee_id: "e1" }, { ...row, question: "Когда?" }, "d1", NOW)).toBeNull();
  });
});

describe("keeping one's place", () => {
  it("the row in the place of one that left", () => {
    expect(inPlaceOf(["a", "b", "c"], 1)).toBe("b");
    expect(inPlaceOf(["a", "b"], 5)).toBe("b");
    expect(inPlaceOf([], 0)).toBeNull();
  });

  it("skipped tasks go to the end, in the order skipped", () => {
    const items = ["a", "b", "c", "d"];
    expect(withSkipped(items, (id) => id, ["b", "a"])).toEqual(["c", "d", "b", "a"]);
    expect(withSkipped(items, (id) => id, ["x"])).toEqual(items);
  });

  it("a glow for a changed row or a new open one, not for a page of history", () => {
    const before = new Map([["a", "1"], ["b", "1"]]);
    expect(firstChanged(before, new Map([["a", "1"], ["b", "2"]]), () => "accepted")).toBe("b");
    expect(firstChanged(before, new Map([...before, ["c", "1"]]), () => "sent")).toBe("c");
    expect(firstChanged(before, new Map([...before, ["c", "1"]]), () => "done")).toBeNull();
    expect(firstChanged(new Map(), new Map([["a", "1"]]), () => "sent")).toBeNull();
  });
});

/* ---- D-154: the table's groups, a row's moves and letters, the words of a decision ---- */

type Row = {
  id: string;
  title: string;
  body: string | null;
  status: "sent" | "accepted" | "in_progress" | "rework" | "pending_review" | "declined" | "scheduled" | "done" | "revoked";
  deadline: string | null;
  priority: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  completed_at: string | null;
  accepted_at: string | null;
  scheduled_send_at: string | null;
  assignee_id: string;
  assignee: { full_name: string } | null;
};

const row = (id: string, patch: Partial<Row>): Row => ({
  id,
  title: `Задача ${id}`,
  body: null,
  status: "accepted",
  deadline: null,
  priority: "normal",
  created_at: at("2026-11-02T04:00:00Z"),
  updated_at: at("2026-11-02T04:00:00Z"),
  closed_at: null,
  completed_at: null,
  accepted_at: null,
  scheduled_send_at: null,
  assignee_id: "p1",
  assignee: { full_name: "Айгуль Бекова" },
  ...patch,
});

describe("grouping", () => {
  it("each tab offers its own grouping first, and only what fits it", () => {
    expect(groupChoices("yours").map((c) => c.value)).toEqual(["reason", "person", "due"]);
    expect(groupChoices("working")[0]).toEqual({ value: "due", label: "По сроку" });
    expect(groupChoices("closed").map((c) => c.value)).toEqual(["due", "person"]);
    expect(groupOf("closed", "reason")).toBe("due");
    expect(groupOf("yours", null)).toBe("reason");
    expect(groupOf("working", "person")).toBe("person");
  });

  it("«Ждут вас» by the reason keeps the queue's order; by the person the loudest person first", () => {
    const review = row("r", { status: "pending_review", assignee_id: "p2", assignee: { full_name: "Ерлан Сапаров" } });
    const late = row("o", { deadline: at("2026-11-01T10:00:00Z") });
    const reasons = new Map([
      ["r", "review" as const],
      ["o", "overdue" as const],
    ]);
    expect(tableSections("yours", "reason", [late, review], reasons, NOW).map((s) => s.key)).toEqual(["review", "overdue"]);
    const people = tableSections("yours", "person", [review, late], reasons, NOW);
    expect(people.map((s) => [s.key, s.tone])).toEqual([
      ["person:p1", "danger"],
      ["person:p2", "warn"],
    ]);
  });

  it("«Ждут вас» by the deadline names the refusals as such, not «Закрытые»", () => {
    const refused = row("d", { status: "declined" });
    const sections = tableSections("yours", "due", [refused], new Map([["d", "declined" as const]]), NOW);
    expect(sections.map((s) => s.title)).toEqual(["Отказы"]);
  });

  it("«В работе» by the stage: not taken, in work, redone, held", () => {
    const tasks = [row("a", { status: "rework" }), row("b", { status: "sent" }), row("c", { status: "scheduled" }), row("d", {})];
    expect(tableSections("working", "reason", tasks, new Map(), NOW).map((s) => s.title)).toEqual(["Не приняты", "В работе", "На доработке", "Отправлю позже"]);
  });
});

describe("a row's moves and letters", () => {
  const taken = { status: "accepted" as const, created_at: at("2026-11-03T06:00:00Z") };

  it("the reason's two moves, its own first", () => {
    expect(rowMoves({ ...taken, status: "pending_review" }, "review", {}, NOW).map((m) => [m.label, m.main, m.key])).toEqual([
      ["Принять", true, "KeyA"],
      ["Доработать", false, "KeyR"],
    ]);
    expect(rowMoves(taken, "overdue", {}, NOW).map((m) => m.action)).toEqual(["nudge", "extend"]);
    expect(rowMoves(taken, "question", {}, NOW).map((m) => m.action)).toEqual(["answer"]);
    expect(rowMoves(taken, "time", { request: { proposed: at("2026-11-04T05:00:00Z") } }, NOW).map((m) => [m.label, m.title])).toEqual([
      ["Да", "Согласовать срок до завтра 10:00"],
      ["Нет", "Оставить прежний срок"],
    ]);
    expect(rowMoves({ ...taken, status: "declined" }, "declined", {}, NOW).map((m) => [m.action, m.main])).toEqual([
      ["insist", true],
      ["reassign", false],
    ]);
    expect(rowMoves({ ...taken, status: "declined" }, "declined", { suggestion: { name: "Ерлан Сапаров" } }, NOW)[0].label).toBe("Передать · Ерлан");
  });

  it("a reminder within half an hour says when instead of asking again", () => {
    const [nudge] = rowMoves(taken, "overdue", { nudgedAt: at("2026-11-03T06:50:00Z") }, NOW);
    expect(nudge).toMatchObject({ label: "Напомнили 11:50", held: true, main: false });
    expect(rowMoves(taken, "overdue", { nudgedAt: at("2026-11-03T05:00:00Z") }, NOW)[0].label).toBe("Напомнить");
  });

  it("no reason: the card's quiet keys; closed — none", () => {
    expect(rowMoves(taken, null, {}, NOW).map((m) => [m.action, m.main])).toEqual([
      ["extend", false],
      ["reassign", false],
    ]);
    // a new task nobody has taken for a quarter of an hour: «Напомнить» comes forward
    expect(rowMoves({ status: "sent", created_at: at("2026-11-03T06:00:00Z") }, null, {}, NOW)[0].action).toBe("nudge");
    expect(rowMoves({ status: "scheduled", created_at: at("2026-11-03T06:00:00Z") }, null, {}, NOW)[0].action).toBe("sendNow");
    expect(rowMoves({ status: "done", created_at: at("2026-11-03T06:00:00Z") }, null, {}, NOW)).toEqual([]);
  });

  it("the hint names only the letters that work on this row", () => {
    const codes = (status: Row["status"], request = false) => rowKeys({ status }, { request }).map((k) => k.code);
    expect(codes("pending_review")).toEqual(["KeyA", "KeyR", "KeyO"]);
    expect(codes("accepted")).toEqual(["KeyO", "KeyN", "KeyD", "KeyT"]);
    expect(codes("accepted", true)).toEqual(["KeyO", "KeyD", "KeyT"]);
    expect(rowKeys({ status: "accepted" }, { request: true }).find((k) => k.code === "KeyD")?.action).toBe("retime");
    expect(codes("declined")).toEqual(["KeyO", "KeyT"]);
    expect(codes("scheduled")).toEqual(["KeyO", "KeyD"]);
    expect(codes("done")).toEqual(["KeyO"]);
    expect(codes("revoked")).toEqual([]);
  });
});

describe("why a task waits, in words", () => {
  const waiting = {
    deadline: null,
    completed_at: null,
    assignee_id: "e1",
    question: null,
    question_at: null,
    decline_reason: null,
    time_request: null,
    suggestion: null,
    partial: false,
    last_message: null,
    nudged_at: null,
  };

  it("the headline of «Разобрать» carries a number", () => {
    const head = { ...waiting, closed_at: null, updated_at: at("2026-11-03T06:10:00Z") };
    expect(reasonHeadline("overdue", { ...head, deadline: at("2026-10-27T07:00:00Z") }, NOW)).toBe("Просрочена на 7 дней");
    expect(reasonHeadline("review", { ...head, completed_at: at("2026-11-03T06:20:00Z") }, NOW)).toBe("Сдана 40 мин назад — ждёт приёмки");
    expect(reasonHeadline("declined", { ...head, closed_at: at("2026-11-03T06:10:00Z") }, NOW)).toBe("Отказ 50 мин назад — решение за вами");
    expect(reasonHeadline("question", { ...head, question_at: at("2026-11-03T06:46:00Z") }, NOW)).toBe("Вопрос ждёт ответа 14 мин");
    const request = { id: "q", proposed: at("2026-11-04T05:00:00Z"), words: null, at: at("2026-11-03T06:35:00Z"), senderId: "e1" };
    expect(reasonHeadline("time", { ...head, time_request: request }, NOW)).toBe("Просьба о сроке ждёт ответа 25 мин");
  });

  it("the line of a decision says what exactly waits, never guessing a gender", () => {
    const handed = {
      ...waiting,
      completed_at: at("2026-11-03T06:20:00Z"),
      last_message: { id: "m", content: "всё во вложении", type: "photo", sender_id: "e1", seq: 4, created_at: at("2026-11-03T06:20:00Z") },
    };
    expect(decisionLine("review", handed, NOW)).toBe("сдано 40 мин назад · фото · «всё во вложении»");
    expect(decisionLine("question", { ...waiting, question: "какой адрес?", question_at: at("2026-11-03T06:46:00Z") }, NOW)).toBe("«какой адрес?» · 14 мин без ответа");
    expect(decisionLine("declined", { ...waiting, decline_reason: "нет доступа", suggestion: { id: "e2", name: "Ерлан Сапаров" } }, NOW)).toBe(
      "не может: «нет доступа» · предлагает: Ерлан",
    );
    expect(decisionLine("overdue", { ...waiting, deadline: at("2026-11-03T05:00:00Z"), nudged_at: at("2026-11-03T06:30:00Z") }, NOW)).toBe(
      "просрочено на 2 ч · напомнили 11:30",
    );
  });
});

describe("«Команда сейчас»", () => {
  const person = { availability: "active" };
  const load = { active: 3, overdue: 2, nearest: at("2026-11-02T10:00:00Z") };

  it("late first, with the first late title", () => {
    const tasks = [row("a", { title: "Сдать отчёт", deadline: at("2026-11-01T10:00:00Z") }), row("b", { deadline: at("2026-11-02T10:00:00Z") })];
    expect(personNow(person, load, "red", tasks, new Map(), NOW)).toEqual({ ring: "danger", line: "2 просрочки · «Сдать отчёт»", rank: 0 });
  });

  it("the director's move, then a deadline within a day, then calm, then free", () => {
    const review = row("r", { status: "pending_review", title: "Смета" });
    expect(personNow(person, { ...load, overdue: 0 }, "green", [review], new Map([["r", "review" as const]]), NOW)).toEqual({
      ring: "warn",
      line: "на приёмке · «Смета»",
      rank: 1,
    });
    const soon = row("s", { title: "Смета", deadline: at("2026-11-03T10:00:00Z") });
    expect(personNow(person, { active: 1, overdue: 0, nearest: soon.deadline }, "yellow", [soon], new Map(), NOW).line).toBe("срок 15:00 · «Смета»");
    expect(personNow(person, { active: 2, overdue: 0, nearest: at("2026-11-06T13:00:00Z") }, "green", [], new Map(), NOW)).toEqual({
      ring: null,
      line: "2 в работе · срок пт 18:00",
      rank: 3,
    });
    expect(personNow(person, undefined, "gray", [], new Map(), NOW)).toEqual({ ring: null, line: "свободен", rank: 4 });
    expect(personNow({ availability: "vacation" }, load, "gray", [], new Map(), NOW).line).toBe("в отпуске");
  });
});

describe("the stack's buttons", () => {
  const taken = { status: "accepted" as const, created_at: at("2026-11-03T06:00:00Z") };

  it("the row's moves and the card's third; Enter presses the main one", () => {
    expect(stackMoves(taken, "overdue", {}, NOW).map((m) => m.action)).toEqual(["nudge", "extend", "reassign"]);
    expect(enterMove(stackMoves(taken, "overdue", {}, NOW))?.action).toBe("nudge");
    expect(stackMoves({ ...taken, status: "declined" }, "declined", {}, NOW).map((m) => m.action)).toEqual(["reassign", "insist", "cancel"]);
    expect(stackMoves(taken, "time", { request: { proposed: at("2026-11-04T05:00:00Z") } }, NOW)[0].label).toBe("Согласовать · до завтра 10:00");
    expect(enterMove(stackMoves({ ...taken, status: "pending_review" }, "review", {}, NOW))?.action).toBe("approve");
  });

  it("a reminder already sent: Enter gives the new date instead", () => {
    const moves = stackMoves(taken, "overdue", { nudgedAt: at("2026-11-03T06:50:00Z") }, NOW);
    expect(moves[0].held).toBe(true);
    expect(enterMove(moves)?.action).toBe("extend");
  });
});

describe("the desk's own hand (wave 3)", () => {
  it("a menu names a move a little longer, and its letter only where it works", () => {
    expect(ACT_LABEL.reassign).toBe("Передать…");
    expect(ACT_LABEL.approve).toBe("Принять");
    const review = rowKeys({ status: "pending_review" });
    expect(keyOfAction("approve", review)).toBe("A");
    expect(keyOfAction("answer", review)).toBe("O");
    expect(keyOfAction("nudge", review)).toBeUndefined();
    expect(isDangerAction("remove") && isDangerAction("cancel") && !isDangerAction("extend")).toBe(true);
  });

  it("bulk: a reminder to work in hand not reminded within half an hour, a date to what is open, a revoke to what is not closed", () => {
    const rows = [
      { id: "a", status: "accepted" as const, nudged_at: null },
      { id: "b", status: "sent" as const, nudged_at: at("2026-11-03T06:50:00Z") },
      { id: "r", status: "accepted" as const, time_request: { proposed: at("2026-11-04T05:00:00Z") } },
      { id: "c", status: "pending_review" as const },
      { id: "d", status: "scheduled" as const },
      { id: "e", status: "declined" as const },
      { id: "f", status: "done" as const },
    ];
    const plan = bulkPlan(rows, NOW);
    expect(plan.nudge.map((row) => row.id)).toEqual(["a"]);
    expect(plan.extend.map((row) => row.id)).toEqual(["a", "b", "r", "d"]);
    expect(plan.revoke.map((row) => row.id)).toEqual(["a", "b", "r", "c", "d", "e"]);
  });

  it("marks: a range either way, a toggle, the table's order", () => {
    const ids = ["a", "b", "c", "d"];
    expect(pickRange(ids, "b", "d")).toEqual(["b", "c", "d"]);
    expect(pickRange(ids, "d", "b")).toEqual(["b", "c", "d"]);
    expect(pickRange(ids, null, "c")).toEqual(["c"]);
    expect(pickRange(ids, "gone", "c")).toEqual(["c"]);
    expect(pickRange(ids, "a", "gone")).toEqual([]);
    expect([...togglePick(new Set(["a"]), "a")]).toEqual([]);
    expect([...togglePick(new Set(["a"]), "b")]).toEqual(["a", "b"]);
    expect(pickedInOrder(ids, new Set(["d", "a", "x"]))).toEqual(["a", "d"]);
  });

  it("a column as wide as its longest word, within its bounds", () => {
    expect(fitColumn(["Ерлан С.", "Айгуль"], { min: 100, max: 200, extra: 40 })).toBe("100px");
    expect(fitColumn(["сегодня 18:00", "вчера 19:41"], { min: 80, max: 160 })).toBe("120px");
    expect(fitColumn(["x".repeat(80)], { min: 80, max: 160 })).toBe("160px");
  });

  it("the cursor of a list walks and stays at the ends", () => {
    const ids = ["a", "b", "c"];
    expect(cursorStep(ids, null, 1)).toBe("a");
    expect(cursorStep(ids, null, -1)).toBe("c");
    expect(cursorStep(ids, "b", 1)).toBe("c");
    expect(cursorStep(ids, "c", 1)).toBe("c");
    expect(cursorStep(ids, "a", -1)).toBe("a");
    expect(cursorStep([], "a", 1)).toBeNull();
  });

  it("the picker's days on the Aqtobe wall clock", () => {
    expect(wallYmd(NOW)).toBe("2026-11-03");
    expect(wallYmd(new Date("2026-11-03T19:30:00Z"))).toBe("2026-11-04");
    expect(shiftYmd("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftYmd("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekdayOf("2026-11-03")).toBe(1);
    expect(wallIso("2026-11-04", "09:00")).toBe("2026-11-04T09:00:00+05:00");
  });

  it("presets: today's evening while an hour is left, the week's end, a week ahead, none", () => {
    // Tuesday noon
    expect(deadlinePresets(NOW).map((p) => p.label)).toEqual(["Сегодня 18:00", "Завтра 9:00", "Завтра 13:00", "В пятницу 18:00", "Через неделю", "Без срока"]);
    expect(deadlinePresets(NOW).find((p) => p.label === "В пятницу 18:00")?.iso).toBe("2026-11-06T18:00:00+05:00");
    // Tuesday 17:30 — no evening left; Saturday — Monday 9:00 comes instead of Friday
    expect(deadlinePresets(new Date("2026-11-03T12:30:00Z"))[0].label).toBe("Завтра 9:00");
    const saturday = deadlinePresets(new Date("2026-11-07T07:00:00Z"));
    expect(saturday.find((p) => p.label === "В понедельник 9:00")?.iso).toBe("2026-11-09T09:00:00+05:00");
    expect(deadlinePresets(NOW, { none: false }).some((p) => p.iso === null)).toBe(false);
  });

  it("the time box reads what a person types and steps by a quarter", () => {
    expect(parseTimeInput("9")).toBe("09:00");
    expect(parseTimeInput("930")).toBe("09:30");
    expect(parseTimeInput("18.30")).toBe("18:30");
    expect(parseTimeInput("18 3")).toBe("18:30");
    expect(parseTimeInput("1800")).toBe("18:00");
    expect(parseTimeInput("25:00")).toBeNull();
    expect(parseTimeInput("завтра")).toBeNull();
    expect(stepHm("18:00", 15)).toBe("18:15");
    expect(stepHm("00:00", -15)).toBe("23:45");
    expect(stepHm("23:50", 15)).toBe("00:05");
  });

  it("a thread's word opens with its name after a pause, a new person, a new day or a line of history", () => {
    const word = (sender: string, iso: string, type = "text") => ({ sender_id: sender, created_at: at(iso), type });
    expect(opensRun(undefined, word("a", "2026-11-03T06:00:00Z"))).toBe(true);
    expect(opensRun(word("a", "2026-11-03T06:00:00Z"), word("a", "2026-11-03T06:03:00Z"))).toBe(false);
    expect(opensRun(word("a", "2026-11-03T06:00:00Z"), word("a", "2026-11-03T06:06:00Z"))).toBe(true);
    expect(opensRun(word("a", "2026-11-03T06:00:00Z"), word("b", "2026-11-03T06:01:00Z"))).toBe(true);
    expect(opensRun(word("a", "2026-11-03T06:00:00Z", "status_change"), word("a", "2026-11-03T06:01:00Z"))).toBe(true);
    // 23:58 and 00:01 in Aqtobe: two days
    expect(opensRun(word("a", "2026-11-03T18:58:00Z"), word("a", "2026-11-03T19:01:00Z"))).toBe(true);
  });
});
