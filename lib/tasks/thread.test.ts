import { describe, expect, it } from "vitest";

import type { TaskMessage } from "./queries";
import { applyMessageUpdate } from "./thread";

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
