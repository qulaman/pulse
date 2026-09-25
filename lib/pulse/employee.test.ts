import { describe, expect, it } from "vitest";

import type { TaskWithPeople } from "@/lib/tasks/queries";
import type { TaskStatus } from "@/lib/tasks/status-text";
import type { BoardTask } from "./board";
import type { EtherPost } from "./ether";
import {
  describeForEmployee,
  employeeEvents,
  employeeFace,
  employeeLoad,
  etherEvents,
  onTimeStreak,
  reasonOf,
  weightiest,
} from "./employee";

/** 2026-09-11 09:30 Aqtobe (UTC+5) — тот же час, что и в board.test.ts */
const NOW = new Date("2026-09-11T04:30:00Z");
const ME = "u-1";
const BOSS = "d";

let serial = 0;
function row(status: TaskStatus, extra: Partial<BoardTask> = {}): BoardTask {
  serial += 1;
  const base: TaskWithPeople = {
    id: `t-${serial}`,
    company_id: "c",
    author_id: BOSS,
    assignee_id: ME,
    body: null,
    closed_at: null,
    completed_at: null,
    accepted_at: null,
    created_at: "2026-09-11T04:25:00Z",
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
    title: "Задача",
    updated_at: "2026-09-11T04:25:00Z",
    assignee: { full_name: "Марат Оспанов" },
    author: { full_name: "Директор" },
  };
  return { ...base, question: null, question_id: null, question_at: null, decline_reason: null, last_message: null, seen_seq: 0, ...extra };
}

const word = (id: string, seq: number, sender = BOSS) => ({ id, content: "Как дела?", type: "text", sender_id: sender, seq, created_at: NOW.toISOString() });
const SOON = "2026-09-11T05:10:00Z"; // через 40 минут
const LATER = "2026-09-11T09:00:00Z";

describe("employeeLoad — что лицо держит в покое (D-110)", () => {
  it("пусто — свободен, спит", () => {
    expect(employeeLoad([], NOW, ME)).toEqual({ rest: "free", carry: 0, hot: false });
    expect(employeeFace("free", false)).toBe("sleeping");
    expect(employeeFace("free", true)).toBe("happy");
  });

  it("задачи в работе — не спит, держит стопку", () => {
    const load = employeeLoad([row("accepted"), row("accepted"), row("pending_review")], NOW, ME);
    expect(load).toEqual({ rest: "working", carry: 2, hot: false });
    expect(employeeFace(load.rest, false)).toBe("working");
  });

  it("всё сдано — ждёт приёмки с песочными часами", () => {
    expect(employeeLoad([row("pending_review")], NOW, ME).rest).toBe("review");
    expect(employeeFace("review", false)).toBe("awaiting");
  });

  it("новое или доработка важнее всего — зовёт", () => {
    expect(employeeLoad([row("accepted", { deadline: SOON }), row("sent")], NOW, ME).rest).toBe("todo");
    expect(employeeLoad([row("rework")], NOW, ME).rest).toBe("todo");
  });

  it("срок в пределах часа — паника, верхняя карточка стопки горит", () => {
    const load = employeeLoad([row("accepted", { deadline: SOON }), row("accepted")], NOW, ME);
    expect(load).toEqual({ rest: "deadline", carry: 2, hot: true });
  });

  it("непрочитанное слово директора — нервничает; свой открытый вопрос — нет", () => {
    expect(employeeLoad([row("accepted", { last_message: word("m1", 3), seen_seq: 2 })], NOW, ME).rest).toBe("unread");
    expect(employeeLoad([row("accepted", { question: "А когда?" })], NOW, ME).rest).toBe("working");
  });

  it("закрытые строки в кэше не считаются", () => {
    expect(employeeLoad([row("done"), row("revoked"), row("declined")], NOW, ME).rest).toBe("free");
  });

  it("тап по встревоженному лицу ведёт к причине", () => {
    expect(reasonOf("todo")).toBe("tasks");
    expect(reasonOf("deadline")).toBe("tasks");
    expect(reasonOf("unread")).toBe("messages");
    expect(reasonOf("working")).toBeNull();
    expect(reasonOf("free")).toBeNull();
  });
});

describe("employeeEvents — что только что случилось (D-110)", () => {
  const events = (before: BoardTask[], after: BoardTask[]) => employeeEvents(before, after, ME);

  it("новая задача прилетела", () => {
    const task = row("sent");
    expect(events([], [task])).toEqual(["arrived"]);
  });

  it("свои кнопки: Принял, Не могу, Сдать", () => {
    const task = row("sent");
    expect(events([task], [{ ...task, status: "accepted" }])).toEqual(["accepted"]);
    expect(events([task], [{ ...task, status: "declined" }])).toEqual(["declined"]);
    expect(events([{ ...task, status: "accepted" }], [{ ...task, status: "pending_review" }])).toEqual(["handed"]);
  });

  it("«Сдать» после доработки — только бросок, без второго «Принял»", () => {
    const task = row("rework");
    expect(events([task], [{ ...task, status: "accepted" }])).toEqual([]);
    expect(events([{ ...task, status: "accepted" }], [{ ...task, status: "pending_review" }])).toEqual(["handed"]);
  });

  it("решения директора: принял, вернул, отозвал, настоял", () => {
    const task = row("pending_review");
    expect(events([task], [{ ...task, status: "done" }])).toEqual(["approved"]);
    expect(events([task], [{ ...task, status: "rework" }])).toEqual(["rework"]);
    expect(events([task], [{ ...task, status: "revoked" }])).toEqual(["revoked"]);
    const declined = row("declined");
    expect(events([declined], [{ ...declined, status: "sent" }])).toEqual(["insisted"]);
  });

  it("дело удалили — рассыпалась, как при отзыве (tasks/020)", () => {
    const task = row("accepted");
    const other = row("sent");
    expect(events([task, other], [other])).toEqual(["gone"]);
    expect(events([row("rework")], [])).toEqual(["gone"]);
    expect(weightiest(["gone", "arrived"])).toBe("gone");
    expect(weightiest(["revoked", "gone"])).toBe("revoked");
  });

  it("закрытая строка пропала из кэша — не событие", () => {
    for (const status of ["done", "revoked", "declined", "pending_review"] as const) {
      expect(events([row(status)], [])).toEqual([]);
    }
  });

  it("откат оптимистичного тапа — не событие", () => {
    const task = row("accepted");
    expect(events([task], [{ ...task, status: "sent" }])).toEqual([]);
  });

  it("Уточнить — поднимает руку", () => {
    const task = row("sent");
    expect(events([task], [{ ...task, question: "А адрес?" }])).toEqual(["asked"]);
  });

  it("срок отодвинули или сняли — облегчение; приблизили — без сценки", () => {
    const task = row("accepted", { deadline: SOON });
    expect(events([task], [{ ...task, deadline: LATER }])).toEqual(["moved"]);
    expect(events([task], [{ ...task, deadline: null }])).toEqual(["moved"]);
    expect(events([{ ...task, deadline: LATER }], [{ ...task, deadline: SOON }])).toEqual([]);
  });

  it("слово директора пришло, «Прочитал» — прочитано", () => {
    const task = row("accepted", { last_message: word("m1", 3), seen_seq: 3 });
    const fresh = { ...task, last_message: word("m2", 4) };
    expect(events([task], [fresh])).toEqual(["message"]);
    expect(events([fresh], [{ ...fresh, seen_seq: 4 }])).toEqual(["read"]);
  });

  it("свой ответ в переписке закрывает непрочитанное — тоже «прочитано»", () => {
    const task = row("accepted", { last_message: word("m1", 3), seen_seq: 2 });
    expect(events([task], [{ ...task, last_message: word("m2", 4, ME) }])).toEqual(["read"]);
  });

  it("перезапрос той же доски — ни одного события", () => {
    const task = row("accepted", { last_message: word("m1", 3), seen_seq: 3 });
    expect(events([task], [{ ...task }])).toEqual([]);
  });

  it("из пачки играет самое весомое", () => {
    expect(weightiest(["read", "arrived", "accepted"])).toBe("arrived");
    expect(weightiest(["message", "approved"])).toBe("approved");
    expect(weightiest([])).toBeNull();
  });
});

describe("etherEvents", () => {
  const post = (id: string, author: string, acks: string[] = []): EtherPost => ({
    id,
    transcript: "Завтра субботник",
    author_id: author,
    author: { full_name: "Директор" },
    acks: acks.map((user_id) => ({ user_id, user: null })),
  });

  it("новое объявление директора — слушает; своё — нет", () => {
    expect(etherEvents([], [post("a", BOSS)], ME)).toEqual(["announced"]);
    expect(etherEvents([], [post("a", ME)], ME)).toEqual([]);
  });

  it("«Ознакомился» — своя отметка; чужая — не событие", () => {
    expect(etherEvents([post("a", BOSS)], [post("a", BOSS, [ME])], ME)).toEqual(["acked"]);
    expect(etherEvents([post("a", BOSS)], [post("a", BOSS, ["x"])], ME)).toEqual([]);
  });
});

describe("onTimeStreak — N подряд в срок", () => {
  const closed = (completed: string, deadline: string | null, closedAt: string) =>
    row("done", { completed_at: completed, deadline, closed_at: closedAt });

  it("считает с последней закрытой до первой сданной с опозданием", () => {
    const tasks = [
      closed("2026-09-10T05:00:00Z", "2026-09-10T06:00:00Z", "2026-09-10T07:00:00Z"),
      closed("2026-09-09T05:00:00Z", "2026-09-09T06:00:00Z", "2026-09-09T07:00:00Z"),
      closed("2026-09-08T08:00:00Z", "2026-09-08T06:00:00Z", "2026-09-08T09:00:00Z"), // late
      closed("2026-09-07T05:00:00Z", "2026-09-07T06:00:00Z", "2026-09-07T07:00:00Z"),
    ];
    expect(onTimeStreak(tasks)).toBe(2);
  });

  it("без срока — не считается и не рвёт серию; открытые не считаются", () => {
    const tasks = [
      closed("2026-09-10T05:00:00Z", null, "2026-09-10T08:00:00Z"),
      closed("2026-09-10T05:00:00Z", "2026-09-10T06:00:00Z", "2026-09-10T07:00:00Z"),
      row("pending_review", { completed_at: "2026-09-11T01:00:00Z", deadline: "2026-09-11T00:00:00Z" }),
    ];
    expect(onTimeStreak(tasks)).toBe(1);
  });

  it("сдал вовремя, а директор принял позже срока — всё равно в срок", () => {
    expect(onTimeStreak([closed("2026-09-10T05:00:00Z", "2026-09-10T06:00:00Z", "2026-09-10T12:00:00Z")])).toBe(1);
  });
});

describe("describeForEmployee", () => {
  it("слово директора помечено как сообщение — мысль открывает «Сообщения»", () => {
    const task = row("accepted", { last_message: word("m1", 3), seen_seq: 3 });
    const phrase = describeForEmployee(task, { ...task, last_message: word("m2", 4) }, ME);
    expect(phrase?.message).toBe(true);
  });
});
