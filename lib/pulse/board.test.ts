import { describe, expect, it } from "vitest";

import type { TaskWithPeople } from "@/lib/tasks/queries";
import type { TaskStatus } from "@/lib/tasks/status-text";
import {
  applyMessage,
  applyRead,
  applyTaskChange,
  hasUnread,
  messageOf,
  countsOf,
  describeChange,
  describeChanges,
  laneOf,
  lanesOf,
  openingLine,
  toBoardTask,
  withoutTask,
  workRowLabel,
  type BoardTask,
} from "./board";

// 2026-09-11 09:30 Aqtobe (UTC+5)
const NOW = new Date("2026-09-11T04:30:00Z");

let seq = 0;

function row(
  id: string,
  title: string,
  who: string | null,
  status: TaskStatus,
  extra: Partial<BoardTask> = {},
): BoardTask {
  seq += 1;
  const base: TaskWithPeople = {
    id,
    company_id: "c",
    author_id: "d",
    assignee_id: who ? `u-${who}` : "u-none",
    body: null,
    closed_at: null,
    completed_at: null,
    accepted_at: null,
    created_at: `2026-09-10T0${seq % 10}:00:00Z`,
    deadline: null,
    group_id: null,
    parent_task_id: null,
    priority: "normal",
    recurrence_rule_id: null,
    scheduled_send_at: null,
    source: null,
    source_audio_path: null,
    source_transcript: null,
    status,
    title,
    updated_at: "2026-09-10T00:00:00Z",
    assignee: who ? { full_name: `${who} Тестов` } : null,
    author: { full_name: "Директор" },
  };
  return { ...base, question: null, question_id: null, question_at: null, decline_reason: null, last_message: null, seen_seq: 0, ...extra };
}

describe("laneOf", () => {
  it("sorts by what the task needs, in D-05 order", () => {
    expect(laneOf(row("a", "Отчёт", "Марат", "accepted", { deadline: "2026-09-10T13:00:00Z" }), NOW)).toBe("overdue");
    expect(laneOf(row("b", "Смета", "Ерлан", "declined"), NOW)).toBe("declined");
    expect(laneOf(row("c", "КП", "Динара", "accepted", { question: "Когда?", question_id: "m1" }), NOW)).toBe("question");
    expect(laneOf(row("d", "КП", "Марат", "pending_review"), NOW)).toBe("review");
    expect(laneOf(row("e", "КП", "Марат", "sent"), NOW)).toBe("work");
    expect(laneOf(row("f", "КП", "Марат", "done"), NOW)).toBeNull();
  });

  it("an overdue task with a question is overdue first", () => {
    const task = row("a", "Отчёт", "Марат", "accepted", { deadline: "2026-09-10T13:00:00Z", question: "Что?", question_id: "m" });
    expect(laneOf(task, NOW)).toBe("overdue");
  });

  it("a task on review is never overdue", () => {
    expect(laneOf(row("a", "Отчёт", "Марат", "pending_review", { deadline: "2026-09-10T13:00:00Z" }), NOW)).toBe("review");
  });
});

describe("lanesOf / countsOf", () => {
  it("orders a lane by urgency: nearest deadline first, undated last", () => {
    const lanes = lanesOf(
      [
        row("late", "Позже", "Марат", "accepted", { deadline: "2026-09-12T13:00:00Z" }),
        row("none", "Без срока", "Марат", "accepted"),
        row("soon", "Скоро", "Марат", "accepted", { deadline: "2026-09-11T13:00:00Z" }),
      ],
      NOW,
    );
    expect(lanes.work.map((t) => t.id)).toEqual(["soon", "late", "none"]);
    expect(countsOf(lanes)).toEqual({ overdue: 0, declined: 0, question: 0, review: 0, work: 3, attention: 0 });
  });
});

describe("toBoardTask", () => {
  it("takes the newest open question and the newest reason from the notes", () => {
    const base = row("a", "КП", "Марат", "declined");
    const task = toBoardTask(base, [
      { id: "old", content: "Старый вопрос?", meta: { is_question: true }, created_at: "2026-09-10T01:00:00Z" },
      { id: "answered", content: "Отвечено?", meta: { is_question: true, answered_at: "x" }, created_at: "2026-09-10T03:00:00Z" },
      { id: "new", content: "Новый вопрос?", meta: { is_question: true }, created_at: "2026-09-10T02:00:00Z" },
      { id: "r1", content: "Занят срочным", meta: { decline_reason: true }, created_at: "2026-09-10T02:30:00Z" },
    ]);
    expect(task.question).toBe("Новый вопрос?");
    expect(task.question_id).toBe("new");
    expect(task.decline_reason).toBe("Занят срочным");
  });
});

describe("applyTaskChange", () => {
  const board = [row("a", "КП", "Марат", "sent"), row("b", "Смета", "Ерлан", "accepted")];

  it("patches a known row in place and keeps the rest by reference", () => {
    const next = applyTaskChange(board, { id: "a", status: "accepted", accepted_at: "2026-09-11T04:00:00Z" });
    expect(next).not.toBe("refetch");
    const rows = next as BoardTask[];
    expect(rows[0]!.status).toBe("accepted");
    expect(rows[0]!.accepted_at).toBe("2026-09-11T04:00:00Z");
    expect(rows[1]).toBe(board[1]);
  });

  it("a closed status stays on the row (the tile says goodbye), then the row is pruned", () => {
    const rows = applyTaskChange(board, { id: "a", status: "done" }) as BoardTask[];
    expect(rows[0]!.status).toBe("done");
    expect(withoutTask(rows, "a").map((t) => t.id)).toEqual(["b"]);
  });

  it("asks for a refetch when the row or its assignee's name is unknown", () => {
    expect(applyTaskChange(board, { id: "new", status: "sent" })).toBe("refetch");
    expect(applyTaskChange(board, { id: "a", assignee_id: "u-Другой" })).toBe("refetch");
  });

  it("ignores an unknown row that is already closed, and a payload with nothing new", () => {
    expect(applyTaskChange(board, { id: "gone", status: "done" })).toBeNull();
    expect(applyTaskChange(board, { id: "a", status: "sent" })).toBeNull();
  });

  it("a declined task sent again («Настоять») drops its old reason", () => {
    const declined = [row("a", "КП", "Марат", "declined", { decline_reason: "Занят срочным" })];
    const rows = applyTaskChange(declined, { id: "a", status: "sent" }) as BoardTask[];
    expect(rows[0]!.decline_reason).toBeNull();
  });
});

describe("applyMessage", () => {
  const board = [row("a", "КП", "Марат", "accepted")];

  it("opens a question, then closes it on its answered update", () => {
    const opened = applyMessage(board, { id: "m1", task_id: "a", content: "Какой формат?", meta: { is_question: true }, created_at: "2026-09-11T04:00:00Z" }) as BoardTask[];
    expect(opened[0]!.question).toBe("Какой формат?");
    expect(opened[0]!.question_id).toBe("m1");
    // the same insert echoed by the settle snapshot is not a change
    expect(applyMessage(opened, { id: "m1", task_id: "a", content: "Какой формат?", meta: { is_question: true }, created_at: "2026-09-11T04:00:00Z" })).toBeNull();
    const closed = applyMessage(opened, { id: "m1", task_id: "a", content: "Какой формат?", meta: { is_question: true, answered_at: "2026-09-11T04:05:00Z" }, created_at: "2026-09-11T04:00:00Z" }) as BoardTask[];
    expect(closed[0]!.question).toBeNull();
  });

  it("an older question never replaces a newer one", () => {
    const withNew = [row("a", "КП", "Марат", "accepted", { question: "Новый?", question_id: "m2", question_at: "2026-09-11T04:10:00Z" })];
    expect(applyMessage(withNew, { id: "m1", task_id: "a", content: "Старый?", meta: { is_question: true }, created_at: "2026-09-11T04:00:00Z" })).toBeNull();
  });

  it("lands a decline reason and ignores messages of tasks off the board", () => {
    const rows = applyMessage(board, { id: "r1", task_id: "a", content: "Занят срочным", meta: { decline_reason: true }, created_at: "2026-09-11T04:00:00Z" }) as BoardTask[];
    expect(rows[0]!.decline_reason).toBe("Занят срочным");
    expect(applyMessage(board, { id: "x", task_id: "zzz", content: "?", meta: { is_question: true }, created_at: "2026-09-11T04:00:00Z" })).toBeNull();
    // plain chat is not a board fact
    expect(applyMessage(board, { id: "c", task_id: "a", content: "Ок", meta: {}, created_at: "2026-09-11T04:00:00Z" })).toBeNull();
  });
});

describe("describeChange", () => {
  const sent = row("a", "КП по Казхрому", "Марат", "sent");

  it("agrees the verb with «задача», never with the person", () => {
    expect(describeChange(sent, { ...sent, status: "accepted" }, NOW)?.text).toBe("Марат: задача «КП по Казхрому» принята в работу");
    expect(describeChange(sent, { ...sent, status: "pending_review" }, NOW)?.text).toBe("Марат: задача «КП по Казхрому» сдана, ждёт приёмки");
    expect(describeChange(sent, { ...sent, status: "rework" }, NOW)?.text).toBe("Марат: задача «КП по Казхрому» на доработке");
  });

  it("a refusal carries its reason in running text, also when the reason lands later", () => {
    const declined = { ...sent, status: "declined" as const };
    expect(describeChange(sent, declined, NOW)).toEqual({ text: "Марат не может «КП по Казхрому»", tone: "warn" });
    const reasoned = { ...declined, decline_reason: "Занят срочным" };
    expect(describeChange(declined, reasoned, NOW)?.text).toBe("Марат не может «КП по Казхрому»: занят срочным");
    expect(describeChange(sent, reasoned, NOW)?.text).toBe("Марат не может «КП по Казхрому»: занят срочным");
  });

  it("a question quotes the words, its answer closes it", () => {
    const asked = { ...sent, question: "Какой формат?", question_id: "m1", question_at: "x" };
    expect(describeChange(sent, asked, NOW)?.text).toBe("Марат спрашивает по «КП по Казхрому»: «Какой формат?»");
    expect(describeChange(asked, sent, NOW)?.text).toBe("Марат: вопрос по «КП по Казхрому» закрыт");
  });

  it("the director's own steps read as done deeds", () => {
    const review = { ...sent, status: "pending_review" as const };
    expect(describeChange(review, { ...review, status: "done" }, NOW)).toEqual({ text: "Принято: «КП по Казхрому»", tone: "ok" });
    expect(describeChange(sent, { ...sent, status: "revoked" }, NOW)?.text).toBe("Задача «КП по Казхрому» отозвана");
    expect(describeChange({ ...sent, status: "declined" }, sent, NOW)?.text).toBe("Марат: задача «КП по Казхрому» отправлена снова");
    expect(describeChange(sent, { ...sent, deadline: "2026-09-12T08:00:00Z" }, NOW)?.text).toBe("Марат: задача «КП по Казхрому» до завтра 13:00");
  });

  it("a new task on the board, nothing for a pruned row or an untouched one", () => {
    expect(describeChange(undefined, sent, NOW)?.text).toBe("Марат: новая задача «КП по Казхрому»");
    expect(describeChange(undefined, { ...sent, status: "done" }, NOW)).toBeNull();
    expect(describeChange(sent, undefined, NOW)).toBeNull();
    expect(describeChange(sent, { ...sent }, NOW)).toBeNull();
  });

  it("describeChanges walks the whole board in order", () => {
    const before = [sent, row("b", "Смета", "Ерлан", "accepted")];
    const after = [{ ...before[0]!, status: "accepted" as const }, { ...before[1]!, status: "pending_review" as const }];
    expect(describeChanges(before, after, NOW).map((p) => p.text)).toEqual([
      "Марат: задача «КП по Казхрому» принята в работу",
      "Ерлан: задача «Смета» сдана, ждёт приёмки",
    ]);
  });
});

describe("openingLine", () => {
  it("greets and gives the verdict when something needs the director", () => {
    const lanes = lanesOf(
      [
        row("o", "Отчёт", "Тимур", "accepted", { deadline: "2026-09-10T13:00:00Z" }),
        row("r1", "КП", "Марат", "pending_review"),
        row("r2", "Смета", "Марат", "pending_review"),
      ],
      NOW,
    );
    expect(openingLine(lanes, NOW, "Асхат")).toEqual({ text: "Доброе утро, Асхат. 1 просрочка, 2 на приёмке.", tone: "danger" });
  });

  it("greets and says it is quiet otherwise, with the nearest deadline", () => {
    const lanes = lanesOf([row("a", "Отчёт", "Марат", "accepted", { deadline: "2026-09-11T13:00:00Z" })], NOW);
    expect(openingLine(lanes, NOW, "Асхат")).toEqual({
      text: "Доброе утро, Асхат. Пока тихо. 1 задача в работе, ближайший срок сегодня 18:00 (Марат, «Отчёт»).",
      tone: "ok",
    });
  });

  it("labels the collapsed work row", () => {
    expect(workRowLabel(1)).toBe("В работе · 1 задача");
    expect(workRowLabel(6)).toBe("В работе · 6 задач");
  });
});

describe("messages of the thread (D-61)", () => {
  const marat = "u-Марат";
  const director = "d";
  const said = (id: string, sender: string, seq: number, content = "Готово, отчёт в папке"): NonNullable<BoardTask["last_message"]> => ({
    id,
    content,
    type: "text",
    sender_id: sender,
    seq,
    created_at: `2026-09-11T04:0${seq}:00Z`,
  });

  it("an employee's last word above the cursor is unread; the director's last word is not", () => {
    const task = row("a", "Отчёт", "Марат", "accepted", { last_message: said("m1", marat, 3), seen_seq: 2 });
    expect(hasUnread(task)).toBe(true);
    expect(laneOf(task, NOW)).toBe("question");
    expect(messageOf(task)).toBe("Готово, отчёт в папке");
    expect(hasUnread({ ...task, seen_seq: 3 })).toBe(false);
    expect(hasUnread({ ...task, last_message: said("m2", director, 4) })).toBe(false);
  });

  it("a plain message over the socket becomes the last word; the director's reply moves the cursor", () => {
    const board = [row("a", "Отчёт", "Марат", "accepted", { seen_seq: 1 })];
    const heard = applyMessage(board, { id: "m1", task_id: "a", content: "Сделал", meta: {}, created_at: "2026-09-11T04:02:00Z", type: "text", sender_id: marat, seq: 2 }) as BoardTask[];
    expect(heard[0]!.last_message?.id).toBe("m1");
    expect(hasUnread(heard[0]!)).toBe(true);
    const replied = applyMessage(heard, { id: "m2", task_id: "a", content: "Ок", meta: {}, created_at: "2026-09-11T04:03:00Z", type: "text", sender_id: director, seq: 3 }) as BoardTask[];
    expect(replied[0]!.last_message?.id).toBe("m2");
    expect(replied[0]!.seen_seq).toBe(3);
    expect(hasUnread(replied[0]!)).toBe(false);
    // a status line is not a word of the thread
    expect(applyMessage(replied, { id: "s", task_id: "a", content: null, meta: { new_status: "done" }, created_at: "2026-09-11T04:04:00Z", type: "status_change", sender_id: marat, seq: 4 })).toBeNull();
  });

  it("«Прочитал» moves the cursor and nothing else", () => {
    const board = [row("a", "Отчёт", "Марат", "accepted", { last_message: said("m1", marat, 3), seen_seq: 0 })];
    const read = applyRead(board, "a", 3) as BoardTask[];
    expect(read[0]!.seen_seq).toBe(3);
    expect(hasUnread(read[0]!)).toBe(false);
    expect(applyRead(read, "a", 2)).toBeNull();
  });

  it("the assistant quotes an unread message, but not the question twice", () => {
    const before = row("a", "Отчёт", "Марат", "accepted");
    const after = { ...before, last_message: said("m1", marat, 3, "Готово, отчёт в папке на диске") };
    expect(describeChange(before, after, NOW)?.text).toBe("Марат пишет по «Отчёт»: «Готово, отчёт в папке на диске»");
    const asked = { ...before, question: "Какой формат?", question_id: "m9", question_at: "x", last_message: said("m9", marat, 4, "Какой формат?") };
    expect(describeChange(before, asked, NOW)?.text).toBe("Марат спрашивает по «Отчёт»: «Какой формат?»");
  });
});
