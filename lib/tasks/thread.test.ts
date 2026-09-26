import { describe, expect, it } from "vitest";

import type { TaskMessage } from "./queries";
import { applyMessageUpdate, dayLabel, markFailed, messageState, startsNewDay, withoutPassedRevoke } from "./thread";

function said(id: string, content: string, meta: TaskMessage["meta"] = {}): TaskMessage {
  return {
    id,
    task_id: "t",
    company_id: "c",
    sender_id: "u",
    seq: 1,
    type: "text",
    content,
    file_path: null,
    meta,
    created_at: "2026-09-17T04:00:00Z",
    sender: { full_name: "Марат Оспанов" },
  };
}

describe("applyMessageUpdate (Д-2)", () => {
  it("stamps answered_at on the question already in the thread", () => {
    const thread = [said("m1", "Какой формат?", { is_question: true })];
    const next = applyMessageUpdate(thread, { id: "m1", meta: { is_question: true, answered_at: "2026-09-17T04:05:00Z" } })!;
    expect(next).not.toBe(thread);
    expect((next[0]!.meta as Record<string, unknown>).answered_at).toBe("2026-09-17T04:05:00Z");
    expect(next[0]!.content).toBe("Какой формат?");
  });

  it("a row the thread does not hold is not a change", () => {
    const thread = [said("m1", "Какой формат?")];
    expect(applyMessageUpdate(thread, { id: "other", content: "x" })).toBe(thread);
    expect(applyMessageUpdate(undefined, { id: "m1" })).toBeUndefined();
  });

  it("keeps the joined sender the payload does not carry, and takes the new words", () => {
    const thread = [said("m1", "Голосовое")];
    const next = applyMessageUpdate(thread, { id: "m1", content: "Сделал, отчёт в папке", type: "voice", file_path: "c/u/a.m4a" })!;
    expect(next[0]!.sender).toEqual({ full_name: "Марат Оспанов" });
    expect(next[0]!.content).toBe("Сделал, отчёт в папке");
    expect(next[0]!.type).toBe("voice");
    expect(next[0]!.file_path).toBe("c/u/a.m4a");
  });
});

describe("what a row shows (011C)", () => {
  it("in flight, refused, in the thread", () => {
    expect(messageState(said("m1", "Сделал"))).toBe("sent");
    expect(messageState(said("m1", "Сделал", { pending: true }))).toBe("pending");
    expect(messageState(said("m1", "Сделал", { pending: true, failed: true }))).toBe("failed");
  });

  it("a refused row stays where it is, marked", () => {
    const thread = [said("m1", "Сделал", { pending: true })];
    const next = markFailed(thread, "m1")!;
    expect(messageState(next[0]!)).toBe("failed");
    expect(next[0]!.content).toBe("Сделал");
    expect(markFailed(thread, "other")).toBe(thread);
  });
});

describe("days of a thread", () => {
  // 2026-09-17 14:00 Aqtobe
  const now = new Date("2026-09-17T09:00:00Z");
  it("names today, yesterday and the date", () => {
    expect(dayLabel("2026-09-17T04:00:00Z", now)).toBe("Сегодня");
    // 15:00 Aqtobe on the 16th — 20:00 UTC would already be the 17th on the wall clock
    expect(dayLabel("2026-09-16T10:00:00Z", now)).toBe("Вчера");
    expect(dayLabel("2026-09-14T04:00:00Z", now)).toBe("14.09");
    expect(dayLabel("2025-12-31T04:00:00Z", now)).toBe("31.12.2025");
  });

  it("a separator goes above the first row and above a new day", () => {
    const a = { ...said("a", "вчера"), created_at: "2026-09-16T10:00:00Z" };
    const b = { ...said("b", "сегодня"), created_at: "2026-09-17T04:00:00Z" };
    const c = { ...said("c", "тоже сегодня"), created_at: "2026-09-17T05:00:00Z" };
    expect(startsNewDay(undefined, a)).toBe(true);
    expect(startsNewDay(a, b)).toBe(true);
    expect(startsNewDay(b, c)).toBe(false);
  });
});

describe("a handed-over task (D-128)", () => {
  const at = "2026-09-17T04:00:00.500Z";
  const revoked: TaskMessage = { ...said("s1", ""), type: "status_change", meta: { new_status: "revoked" }, created_at: at };
  const passed: TaskMessage = { ...said("s2", "Передана: Ерлан"), type: "system", meta: { reassigned_to: "t2" }, created_at: at };

  it("says «передана» once, without «отозвано» beside it", () => {
    expect(withoutPassedRevoke([revoked, passed]).map((m) => m.id)).toEqual(["s2"]);
  });

  it("a plain revoke stays", () => {
    const thread = [revoked];
    expect(withoutPassedRevoke(thread)).toBe(thread);
  });
});
