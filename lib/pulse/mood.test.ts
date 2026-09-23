import { describe, expect, it } from "vitest";

import type { TaskWithPeople } from "@/lib/tasks/queries";
import type { TaskStatus } from "@/lib/tasks/status-text";
import type { BoardTask } from "./board";
import { alarmOf } from "./mood";

/** 2026-09-11 09:30 Aqtobe (UTC+5) — тот же час, что и в board.test.ts */
const NOW = new Date("2026-09-11T04:30:00Z");
const ME = "d";

function row(status: TaskStatus, extra: Partial<BoardTask> = {}): BoardTask {
  const base: TaskWithPeople = {
    id: Math.random().toString(36).slice(2),
    company_id: "c",
    author_id: ME,
    assignee_id: "u-1",
    body: null,
    closed_at: null,
    completed_at: null,
    accepted_at: null,
    created_at: "2026-09-11T04:25:00Z", // пять минут назад
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

const unread = (seq = 3) => ({ last_message: { id: "m1", content: "Готово?", type: "text", sender_id: "u-1", seq, created_at: NOW.toISOString() }, seen_seq: seq - 1 });

describe("alarmOf", () => {
  it("спокойная доска — тревоги нет", () => {
    expect(alarmOf([row("accepted"), row("pending_review")], NOW, ME)).toBeNull();
  });

  it("срок в пределах часа — тревога о сроке", () => {
    expect(alarmOf([row("accepted", { deadline: "2026-09-11T05:10:00Z" })], NOW, ME)).toBe("deadline");
  });

  it("срок уже прошёл — тоже тревога о сроке", () => {
    expect(alarmOf([row("accepted", { deadline: "2026-09-11T02:00:00Z" })], NOW, ME)).toBe("deadline");
  });

  it("срок дальше часа — тихо", () => {
    expect(alarmOf([row("accepted", { deadline: "2026-09-11T07:00:00Z" })], NOW, ME)).toBeNull();
  });

  it("срок у закрытой задачи не считается", () => {
    expect(alarmOf([row("done", { deadline: "2026-09-11T02:00:00Z" })], NOW, ME)).toBeNull();
  });

  it("полчаса без «Принял» — тревога о непринятой", () => {
    expect(alarmOf([row("sent", { created_at: "2026-09-11T03:50:00Z" })], NOW, ME)).toBe("unaccepted");
  });

  it("двадцать минут — ещё терпит", () => {
    expect(alarmOf([row("sent", { created_at: "2026-09-11T04:10:00Z" })], NOW, ME)).toBeNull();
  });

  it("отложенная задача считает время от отправки, а не от создания", () => {
    const fresh = row("sent", { created_at: "2026-09-10T20:00:00Z", scheduled_send_at: "2026-09-11T04:20:00Z" });
    expect(alarmOf([fresh], NOW, ME)).toBeNull();
    const stale = row("sent", { created_at: "2026-09-10T20:00:00Z", scheduled_send_at: "2026-09-11T03:30:00Z" });
    expect(alarmOf([stale], NOW, ME)).toBe("unaccepted");
  });

  it("непрочитанное сообщение — тревога о непрочитанном", () => {
    expect(alarmOf([row("accepted", unread())], NOW, ME)).toBe("unread");
  });

  it("открытый вопрос — тоже непрочитанное", () => {
    expect(alarmOf([row("accepted", { question: "Когда?", question_id: "m1" })], NOW, ME)).toBe("unread");
  });

  it("своё же сообщение не считается", () => {
    const mine = row("accepted", { last_message: { id: "m2", content: "Сделай", type: "text", sender_id: ME, seq: 4, created_at: NOW.toISOString() }, seen_seq: 3 });
    expect(alarmOf([mine], NOW, ME)).toBeNull();
  });

  it("порядок веса: срок важнее непринятой, непринятая важнее непрочитанного", () => {
    const soon = row("accepted", { deadline: "2026-09-11T05:00:00Z" });
    const stale = row("sent", { created_at: "2026-09-11T03:00:00Z" });
    const talking = row("accepted", unread());
    expect(alarmOf([talking, stale, soon], NOW, ME)).toBe("deadline");
    expect(alarmOf([talking, stale], NOW, ME)).toBe("unaccepted");
    expect(alarmOf([talking], NOW, ME)).toBe("unread");
  });
});
