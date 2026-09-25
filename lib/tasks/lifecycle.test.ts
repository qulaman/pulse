import { describe, expect, it } from "vitest";

import type { Json } from "@/lib/supabase/types";

import {
  canNudgeAgain,
  handedInPartly,
  lastNudgeAt,
  latestSuggestion,
  latestTimeRequest,
  passedWord,
  reassignNeedsDeadline,
  requestButtonLabel,
  requestToast,
  timeAnswerOf,
  timeChoices,
  untilWords,
} from "./lifecycle";

// 2026-09-26 10:00 Aqtobe (UTC+5)
const NOW = new Date("2026-09-26T05:00:00Z");

let seq = 0;
const message = (meta: Record<string, unknown>, at: string, extra: { sender_id?: string } = {}) => {
  seq += 1;
  return { id: `m-${seq}`, meta: meta as Json, created_at: at, sender_id: extra.sender_id ?? "emp", content: null };
};

describe("timeChoices — the deadlines asked for in one tap", () => {
  it("steps past a deadline still ahead: an hour later, the next morning, the next evening", () => {
    const choices = timeChoices(NOW, "2026-09-26T13:00:00Z"); // сегодня 18:00
    expect(choices.map((choice) => choice.label)).toEqual(["сегодня 19:00", "завтра 10:00", "завтра 18:00"]);
    expect(choices[0]!.iso).toBe("2026-09-26T19:00:00+05:00");
  });

  it("without a deadline starts from now, rounded to a quarter hour", () => {
    const at = new Date("2026-09-26T05:07:00Z"); // 10:07
    expect(timeChoices(at, null).map((choice) => choice.label)).toEqual(["сегодня 11:15", "сегодня 18:00", "завтра 10:00"]);
  });

  it("a deadline already behind counts from now, not from the past", () => {
    const evening = new Date("2026-09-26T15:00:00Z"); // 20:00
    const choices = timeChoices(evening, "2026-09-25T13:00:00Z");
    expect(choices.map((choice) => choice.label)).toEqual(["сегодня 21:00", "завтра 10:00", "завтра 18:00"]);
  });

  it("every choice is later than the one before it, three at most", () => {
    const choices = timeChoices(NOW, "2026-09-26T12:45:00Z"); // 17:45
    const times = choices.map((choice) => new Date(choice.iso).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(times).size).toBe(times.length);
    expect(choices.length).toBeLessThanOrEqual(3);
  });
});

describe("words of a request", () => {
  it("drops «сегодня», keeps the day otherwise", () => {
    expect(untilWords("2026-09-26T19:00:00+05:00", NOW)).toBe("до 19:00");
    expect(untilWords("2026-09-27T10:00:00+05:00", NOW)).toBe("до завтра 10:00");
  });

  it("a new task is «возьму», work in hand asks", () => {
    expect(requestButtonLabel("sent", "2026-09-27T10:00:00+05:00", NOW)).toBe("Возьму · срок до завтра 10:00");
    expect(requestButtonLabel("accepted", "2026-09-27T10:00:00+05:00", NOW)).toBe("Попросить срок до завтра 10:00");
    expect(requestToast("sent", "2026-09-26T19:00:00+05:00", NOW)).toBe("Принято · попросил срок до 19:00");
  });
});

describe("reading proposals from messages", () => {
  it("the newest request still waiting wins; answered ones are history", () => {
    const messages = [
      message({ time_request: true, proposed_deadline: "2026-09-27T05:00:00Z", answered_at: "x", answer: "replaced" }, "2026-09-26T04:00:00Z"),
      message({ time_request: true, proposed_deadline: "2026-09-28T05:00:00Z", words: "жду поставку" }, "2026-09-26T04:30:00Z"),
      message({ is_question: true }, "2026-09-26T04:40:00Z"),
    ];
    expect(latestTimeRequest(messages)).toMatchObject({ proposed: "2026-09-28T05:00:00Z", words: "жду поставку" });
    expect(latestTimeRequest([messages[0]!])).toBeNull();
    expect(timeAnswerOf(messages[0]!.meta)).toBe("replaced");
  });

  it("the suggestion of the newest refusal, not of an older one", () => {
    const older = message({ decline_reason: true, suggest_assignee_id: "p-1", suggest_name: "Ерлан Б." }, "2026-09-25T04:00:00Z");
    const newer = message({ decline_reason: true }, "2026-09-26T04:00:00Z");
    expect(latestSuggestion([older])).toEqual({ id: "p-1", name: "Ерлан Б." });
    expect(latestSuggestion([older, newer])).toBeNull();
  });

  it("a reminder a quarter hour ago holds the next one back", () => {
    const nudge = message({ nudge: true }, "2026-09-26T04:45:00Z");
    expect(lastNudgeAt([nudge])).toBe("2026-09-26T04:45:00Z");
    expect(canNudgeAgain("2026-09-26T04:45:00Z", NOW)).toBe(false);
    expect(canNudgeAgain("2026-09-26T04:15:00Z", NOW)).toBe(true);
    expect(canNudgeAgain(null, NOW)).toBe(true);
  });

  it("«сделано не всё» counts for the current handover only", () => {
    const partial = message({ report: true, partial: true }, "2026-09-26T04:00:00Z");
    expect(handedInPartly({ status: "pending_review", completed_at: "2026-09-26T04:00:00Z" }, [partial])).toBe(true);
    expect(handedInPartly({ status: "pending_review", completed_at: "2026-09-26T04:30:00Z" }, [partial])).toBe(false);
    expect(handedInPartly({ status: "accepted", completed_at: null }, [partial])).toBe(false);
  });
});

describe("reassign", () => {
  it("asks for a deadline only when the old one is behind or within the hour", () => {
    expect(reassignNeedsDeadline(null, NOW)).toBe(false);
    expect(reassignNeedsDeadline("2026-09-26T08:00:00Z", NOW)).toBe(false);
    expect(reassignNeedsDeadline("2026-09-26T05:30:00Z", NOW)).toBe(true);
    expect(reassignNeedsDeadline("2026-09-25T05:00:00Z", NOW)).toBe(true);
  });

  it("names who took over by first name", () => {
    expect(passedWord("Ерлан Бекмуханов")).toBe("Передана · Ерлан");
    expect(passedWord(null)).toBe("Передана");
  });
});
