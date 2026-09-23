import { describe, expect, it } from "vitest";

import type { BoardTask } from "@/lib/pulse/board";

import {
  deskSummary,
  keysFor,
  nextSelection,
  personDots,
  personSummary,
  queueOf,
  reasonOf,
  receiptText,
  type DeskAction,
} from "./desk";
import { TEXT, type TaskStatus } from "./status-text";

// 2026-09-17 12:00 Aqtobe (UTC+5)
const NOW = new Date("2026-09-17T07:00:00Z");

/** Aqtobe wall clock: 18:00 local is 13:00 UTC. */
const at = (day: string, hour = 18) => `2026-09-${day}T${String(hour - 5).padStart(2, "0")}:00:00Z`;

let seq = 0;

function task(extra: Partial<BoardTask> & { status?: TaskStatus } = {}): BoardTask {
  seq += 1;
  return {
    id: `t-${seq}`,
    status: "sent",
    deadline: null,
    priority: "normal",
    created_at: `2026-09-1${seq % 9}T06:00:00Z`,
    title: `Задача ${seq}`,
    assignee: { full_name: "Марат Оспанов" },
    author: { full_name: "Директор" },
    question: null,
    question_id: null,
    question_at: null,
    decline_reason: null,
    last_message: null,
    seen_seq: 0,
    ...extra,
  } as BoardTask;
}

describe("reasonOf / queueOf", () => {
  it("names the director's move, or none", () => {
    expect(reasonOf(task({ status: "pending_review" }), NOW)).toBe("review");
    expect(reasonOf(task({ question: "Какой адрес?" }), NOW)).toBe("question");
    expect(reasonOf(task({ status: "declined" }), NOW)).toBe("declined");
    expect(reasonOf(task({ deadline: at("16") }), NOW)).toBe("overdue");
    expect(reasonOf(task({ deadline: at("18") }), NOW)).toBeNull();
    expect(reasonOf(task({ status: "accepted" }), NOW)).toBeNull();
  });

  it("приёмка beats a question, a question beats a missed deadline", () => {
    expect(reasonOf(task({ status: "pending_review", question: "Так?" }), NOW)).toBe("review");
    expect(reasonOf(task({ question: "Какой адрес?", deadline: at("16") }), NOW)).toBe("question");
    // a question on a declined task: the decline is the move
    expect(reasonOf(task({ status: "declined", question: "Кому?" }), NOW)).toBe("declined");
  });

  it("orders приёмка → вопросы → отказы → просрочка, nearest deadline first inside", () => {
    const late = task({ deadline: at("15") });
    const later = task({ deadline: at("16") });
    const declined = task({ status: "declined" });
    const question = task({ question: "Где ключи?" });
    const reviewSoon = task({ status: "pending_review", deadline: at("18") });
    const reviewNow = task({ status: "pending_review", deadline: at("17") });
    const calm = task({ deadline: at("20") });
    const queue = queueOf([later, calm, declined, question, reviewSoon, late, reviewNow], NOW);
    expect(queue.map((item) => item.task.id)).toEqual([reviewNow.id, reviewSoon.id, question.id, declined.id, late.id, later.id]);
    expect(queue.map((item) => item.reason)).toEqual(["review", "review", "question", "declined", "overdue", "overdue"]);
  });

  it("holds a task once", () => {
    const twice = task({ status: "pending_review" });
    expect(queueOf([twice, twice], NOW)).toHaveLength(1);
  });
});

describe("keysFor", () => {
  const cases: [string, Parameters<typeof keysFor>, DeskAction[]][] = [
    ["pending_review", [{ status: "pending_review" }], ["approve", "rework", "open"]],
    ["open with a question", [{ status: "accepted" }, { question: true }], ["answer", "extend", "open"]],
    ["declined", [{ status: "declined" }], ["insist", "reassign", "cancel"]],
    ["open and overdue", [{ status: "sent" }, { overdue: true }], ["extend", "reassign", "open"]],
    ["sent", [{ status: "sent" }], ["extend", "reassign", "revoke"]],
    ["accepted", [{ status: "accepted" }], ["extend", "reassign", "revoke"]],
    ["in_progress", [{ status: "in_progress" }], ["extend", "reassign", "revoke"]],
    ["rework", [{ status: "rework" }], ["extend", "reassign", "revoke"]],
    ["scheduled", [{ status: "scheduled" }], ["extend", "revoke", "open"]],
    ["done", [{ status: "done" }], ["open", "remove"]],
    ["revoked", [{ status: "revoked" }], ["open", "remove"]],
  ];

  it.each(cases)("%s", (_name, args, keys) => {
    expect(keysFor(...args)).toEqual(keys);
  });

  it("the upper row wins", () => {
    // приёмка beats a question and a deadline
    expect(keysFor({ status: "pending_review" }, { question: true, overdue: true })).toEqual(["approve", "rework", "open"]);
    // a question beats a deadline
    expect(keysFor({ status: "rework" }, { question: true, overdue: true })).toEqual(["answer", "extend", "open"]);
    // flags do not make a closed or declined task open
    expect(keysFor({ status: "declined" }, { question: true, overdue: true })).toEqual(["insist", "reassign", "cancel"]);
    expect(keysFor({ status: "done" }, { question: true, overdue: true })).toEqual(["open", "remove"]);
  });

  it("never more than three keys", () => {
    const statuses: TaskStatus[] = ["scheduled", "sent", "accepted", "in_progress", "pending_review", "done", "rework", "declined", "revoked"];
    for (const status of statuses) {
      for (const question of [false, true]) {
        for (const overdue of [false, true]) expect(keysFor({ status }, { question, overdue }).length).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe("deskSummary", () => {
  it("calm: nothing waits, no deadlines", () => {
    expect(deskSummary([task({ status: "accepted" })], [], NOW)).toEqual({ headline: TEXT.emptyInbox, line: "сроков нет", tone: "ok" });
  });

  it("the director's move: the count and the nearest deadline", () => {
    const review = task({ status: "pending_review" });
    const soon = task({ deadline: at("18", 13) });
    const queue = queueOf([review, soon], NOW);
    expect(deskSummary([review, soon], queue, NOW)).toEqual({
      headline: "Ваш ход: 1",
      line: "ближайший срок завтра 13:00",
      tone: "warn",
    });
  });

  it("something burns: overdue count first, red", () => {
    const tasks = [task({ deadline: at("15") }), task({ deadline: at("16") }), task({ deadline: at("18", 13) })];
    expect(deskSummary(tasks, queueOf(tasks, NOW), NOW)).toEqual({
      headline: "Ваш ход: 2",
      line: "2 просрочены · ближайший срок завтра 13:00",
      tone: "danger",
    });
  });
});

describe("personSummary", () => {
  it("names the person and only the numbers that are not zero", () => {
    const tasks = [
      task({ status: "accepted" }),
      task({ status: "sent", deadline: at("16") }),
      task({ status: "rework" }),
      task({ status: "pending_review" }),
      task({ status: "done" }),
    ];
    expect(personSummary("Асхат", tasks, NOW)).toEqual({ headline: "Асхат", line: "3 в работе · 1 просрочена · 1 на приёмке", tone: "danger" });
    expect(personSummary("Асхат", [task({ status: "pending_review" })], NOW)).toEqual({ headline: "Асхат", line: "1 на приёмке", tone: "warn" });
  });

  it("nothing open says so", () => {
    expect(personSummary("Асхат", [task({ status: "done" })], NOW)).toEqual({ headline: "Асхат", line: "открытых дел нет", tone: "ok" });
    expect(personSummary("Асхат", [], NOW).line).toBe("открытых дел нет");
  });
});

describe("personDots", () => {
  it("lights whoever holds a queued task, red for overdue work", () => {
    const review = task({ status: "pending_review", assignee_id: "marat" });
    const late = task({ status: "accepted", deadline: at("16"), assignee_id: "erlan" });
    const calm = task({ status: "accepted", deadline: at("20"), assignee_id: "aigul" });
    const dots = personDots(queueOf([review, late, calm], NOW), [review, late, calm], NOW);
    expect(dots.get("marat")).toBe("accent");
    expect(dots.get("erlan")).toBe("danger");
    expect(dots.has("aigul")).toBe(false);
  });
});

describe("receiptText", () => {
  const row = {
    acted_at: null as string | null,
    seen_at: null as string | null,
    status: "queued" as "queued" | "sent" | "failed",
    sent_at: null as string | null,
    created_at: "2026-09-17T04:14:00Z",
    last_error: null as string | null,
  };

  it("says the same words as the card", () => {
    expect(receiptText({ ...row, acted_at: "2026-09-17T04:41:00Z" }, "accepted", NOW)).toEqual({ text: "принял сегодня 09:41", tone: "ok" });
    expect(receiptText(row, "accepted", NOW)).toEqual({ text: "принял", tone: "ok" });
    expect(receiptText({ ...row, seen_at: "2026-09-17T04:20:00Z" }, "sent", NOW)).toEqual({ text: "увидел сегодня 09:20", tone: "muted" });
    expect(receiptText({ ...row, status: "sent", sent_at: "2026-09-17T04:14:00Z" }, "sent", NOW)).toEqual({
      text: "отправлено сегодня 09:14 · не открывал",
      tone: "warn",
    });
    expect(receiptText({ ...row, status: "failed", last_error: "no_subscription" }, "sent", NOW)).toEqual({
      text: "уведомления не включены у сотрудника",
      tone: "warn",
    });
    expect(receiptText({ ...row, status: "failed", last_error: "410" }, "sent", NOW)).toEqual({ text: "уведомление не ушло", tone: "warn" });
    expect(receiptText(row, "sent", NOW)).toEqual({ text: "отправляю уведомление…", tone: "muted" });
  });
});

describe("nextSelection", () => {
  const exists = (ids: string[]) => (id: string) => ids.includes(id);

  it("stays while the picked task is in the queue", () => {
    expect(nextSelection("b", ["a", "b"], ["b", "a"], exists([]))).toBe("b");
  });

  it("the next one takes the place of a task that left the queue", () => {
    expect(nextSelection("b", ["a", "b", "c"], ["a", "c"], exists(["b"]))).toBe("c");
    expect(nextSelection("c", ["a", "b", "c"], ["a", "b"], exists(["c"]))).toBe("b");
    expect(nextSelection("a", ["a"], [], exists(["a"]))).toBeNull();
  });

  it("a task picked from the list stays while it exists", () => {
    expect(nextSelection("x", ["a"], ["a"], exists(["x"]))).toBe("x");
    expect(nextSelection("x", ["a"], ["a"], exists([]))).toBe("a");
    expect(nextSelection(null, ["a"], ["a"], exists([]))).toBeNull();
  });
});
