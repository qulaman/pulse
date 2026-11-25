import { describe, expect, it } from "vitest";

import { taskDetailModel } from "./detail-model";
import type { TaskMessage, TaskWithPeople } from "./query-core";

const NOW = new Date("2026-11-20T06:00:00Z");
const DIRECTOR = { role: "director", userId: "u-dir" };
const EMPLOYEE = { role: "employee", userId: "u-emp" };

function task(change: Partial<TaskWithPeople> = {}): TaskWithPeople {
  return {
    id: "t1",
    company_id: "c1",
    author_id: "u-dir",
    assignee_id: "u-emp",
    title: "Забрать арматуру",
    body: null,
    status: "accepted",
    priority: "normal",
    deadline: "2026-11-20T12:00:00Z",
    created_at: "2026-11-19T06:00:00Z",
    updated_at: "2026-11-19T07:00:00Z",
    accepted_at: "2026-11-19T07:00:00Z",
    completed_at: null,
    closed_at: null,
    scheduled_send_at: null,
    source: "typed",
    source_audio_path: null,
    source_transcript: null,
    passed_to: null,
    recurrence_rule_id: null,
    assignee: { full_name: "Ерлан Сапаров" },
    author: { full_name: "Тимур Директоров" },
    ...change,
  } as TaskWithPeople;
}

let seq = 0;
function message(change: Partial<TaskMessage>): TaskMessage {
  seq += 1;
  return {
    id: `m${seq}`,
    task_id: "t1",
    company_id: "c1",
    sender_id: "u-emp",
    seq,
    type: "text",
    content: null,
    file_path: null,
    meta: {},
    created_at: `2026-11-20T0${Math.min(seq, 5)}:00:00Z`,
    sender: { full_name: "Ерлан Сапаров" },
    ...change,
  } as TaskMessage;
}

describe("the task's own screen, derived (D-87)", () => {
  it("the director sees the employee's open question as his move", () => {
    const messages = [message({ content: "Брать 12-ю или 14-ю?", meta: { is_question: true } })];
    const model = taskDetailModel(task(), messages, DIRECTOR, NOW, undefined);
    expect(model.isDirector).toBe(true);
    expect(model.mine).toBe(false);
    expect(model.question).toBe("Брать 12-ю или 14-ю?");
    expect(model.reason).toBe("question");
    // a question keeps the stage: the word is the state, not the queue's
    expect(model.word).not.toBe("");
    // his own order: only who does it, no «Поручил» to himself (D-187)
    expect(model.from).toBeNull();
    expect(model.to).toBe("Ерлан Сапаров");
    expect(model.talk).toBe(1);
  });

  it("the assignee reads their own order: who gave it, their own question waits", () => {
    const messages = [message({ content: "Брать 12-ю?", meta: { is_question: true } })];
    const model = taskDetailModel(task(), messages, EMPLOYEE, NOW, 0);
    expect(model.mine).toBe(true);
    expect(model.from).toBe("Тимур Директоров");
    expect(model.to).toBeNull();
    expect(model.reason).toBeNull();
    expect(model.myQuestion).toBe("Брать 12-ю?");
  });

  it("an order given by a manager shows both people to the director (D-187)", () => {
    const model = taskDetailModel(task({ author_id: "u-man", author: { full_name: "Асхат Менеджеров" } } as Partial<TaskWithPeople>), [], DIRECTOR, NOW, undefined);
    expect(model.from).toBe("Асхат Менеджеров");
    expect(model.to).toBe("Ерлан Сапаров");
  });

  it("the deadline capsule: the director moves it while the work is not handed in (D-187)", () => {
    expect(taskDetailModel(task(), [], DIRECTOR, NOW, undefined).deadlineMove).toBe("extend");
    expect(taskDetailModel(task({ deadline: null }), [], DIRECTOR, NOW, undefined).deadlineMove).toBe("extend");
    expect(taskDetailModel(task({ status: "scheduled" }), [], DIRECTOR, NOW, undefined).deadlineMove).toBe("extend");
    // a request for time is answered by the same sheet
    const asked = [message({ type: "system", content: "Просит срок", meta: { time_request: true, proposed_deadline: "2026-11-21T05:00:00Z" } })];
    expect(taskDetailModel(task(), asked, DIRECTOR, NOW, undefined).deadlineMove).toBe("retime");
    for (const status of ["pending_review", "done", "revoked", "declined"] as const) {
      expect(taskDetailModel(task({ status, closed_at: "2026-11-20T05:00:00Z" }), [], DIRECTOR, NOW, undefined).deadlineMove).toBeNull();
    }
  });

  it("the deadline capsule: the assignee asks for time, only on work in hand with a deadline (D-187)", () => {
    expect(taskDetailModel(task(), [], EMPLOYEE, NOW, 0).deadlineMove).toBe("ask");
    expect(taskDetailModel(task({ deadline: null }), [], EMPLOYEE, NOW, 0).deadlineMove).toBeNull();
    expect(taskDetailModel(task({ status: "pending_review" }), [], EMPLOYEE, NOW, 0).deadlineMove).toBeNull();
    // a manager reading a subordinate's task only reads
    expect(taskDetailModel(task(), [], { role: "manager", userId: "u-man" }, NOW, undefined).deadlineMove).toBeNull();
  });

  it("a deadline moved since the assignee last read the task is news (D-187)", () => {
    const moved = message({
      type: "system",
      sender_id: "u-dir",
      content: "Срок перенесён раньше: до 20.11 17:00",
      meta: { deadline_changed: true, old_deadline: "2026-11-21T12:00:00+00:00", new_deadline: "2026-11-20T12:00:00+00:00" },
    });
    const messages = [message({ content: "ok" }), moved];
    expect(taskDetailModel(task(), messages, EMPLOYEE, NOW, moved.seq - 1).deadlineNews).toEqual({ from: "2026-11-21T12:00:00+00:00" });
    expect(taskDetailModel(task(), messages, EMPLOYEE, NOW, moved.seq).deadlineNews).toBeNull();
    // the cursor not known yet — no news yet; the director never gets it
    expect(taskDetailModel(task(), messages, EMPLOYEE, NOW, undefined).deadlineNews).toBeNull();
    expect(taskDetailModel(task(), messages, DIRECTOR, NOW, 0).deadlineNews).toBeNull();
  });

  it("the other side's word waits for the reader until the cursor is known", () => {
    const messages = [message({ sender_id: "u-dir", content: "Фото в тред", sender: { full_name: "Тимур Директоров" } })];
    expect(taskDetailModel(task(), messages, EMPLOYEE, NOW, undefined).waiting).toBeNull();
    const seen = taskDetailModel(task(), messages, EMPLOYEE, NOW, 0).waiting;
    expect(seen?.message.content).toBe("Фото в тред");
    expect(seen?.unread).toBe(true);
    // a closed task is not in hand: nothing waits
    expect(taskDetailModel(task({ status: "done", closed_at: "2026-11-20T05:00:00Z" }), messages, EMPLOYEE, NOW, 0).waiting).toBeNull();
  });

  it("a late task in work is the director's «overdue», in red", () => {
    const model = taskDetailModel(task({ deadline: "2026-11-19T12:00:00Z" }), [], DIRECTOR, NOW, undefined);
    expect(model.overdue).toBe(true);
    expect(model.reason).toBe("overdue");
    expect(model.tone).toBe("danger");
  });

  it("a refusal is history for the employee, still the director's move", () => {
    const declined = task({ status: "declined", closed_at: "2026-11-20T04:00:00Z" });
    const messages = [message({ content: "Занят срочным", meta: { decline_reason: true } })];
    expect(taskDetailModel(declined, messages, EMPLOYEE, NOW, 0).closed).toBe(true);
    const forDirector = taskDetailModel(declined, messages, DIRECTOR, NOW, undefined);
    expect(forDirector.closed).toBe(false);
    expect(forDirector.declineReason).toBe("Занят срочным");
    expect(forDirector.reason).toBe("declined");
  });

  it("a recall after a refusal keeps when it was refused (D-142)", () => {
    const messages = [message({ content: "Не ко мне", meta: { decline_reason: true }, created_at: "2026-11-20T03:00:00Z" })];
    const model = taskDetailModel(task({ status: "revoked", closed_at: "2026-11-20T05:00:00Z" }), messages, DIRECTOR, NOW, undefined);
    expect(model.declinedAt).toBe("2026-11-20T03:00:00Z");
  });

  it("urgent without a time; spoken only when the words differ from the title", () => {
    const urgent = task({ deadline: null, priority: "high", source_transcript: "Забрать арматуру" });
    const model = taskDetailModel(urgent, [], DIRECTOR, NOW, undefined);
    expect(model.urgentNow).toBe(true);
    expect(model.spoken).toBe(false);
    expect(taskDetailModel(task({ source_transcript: "Ерлан, забери арматуру со склада" }), [], DIRECTOR, NOW, undefined).spoken).toBe(true);
  });

  it("status lines and system notes are not the conversation", () => {
    const messages = [message({ type: "status_change", meta: { new_status: "accepted" } }), message({ type: "system" }), message({ content: "ok" })];
    expect(taskDetailModel(task(), messages, DIRECTOR, NOW, undefined).talk).toBe(1);
  });
});

describe("the tone of a new task on its screen", () => {
  it("the director: grey while fresh, amber after half an hour or at once when pushes do not reach", () => {
    const fresh = task({ status: "sent", created_at: "2026-11-20T05:50:00Z" });
    expect(taskDetailModel(fresh, [], DIRECTOR, NOW, undefined).tone).toBe("muted");
    expect(taskDetailModel(fresh, [], DIRECTOR, NOW, undefined, { noPush: new Set(["u-emp"]) }).tone).toBe("warn");
    expect(taskDetailModel(task({ status: "sent" }), [], DIRECTOR, NOW, undefined).tone).toBe("warn");
    // the holder: a new task is their move
    expect(taskDetailModel(fresh, [], EMPLOYEE, NOW, 0).tone).toBe("warn");
  });
});
