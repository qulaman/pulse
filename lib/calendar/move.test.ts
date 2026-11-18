import { describe, expect, it } from "vitest";

import { canMove, moveDraft } from "./move";
import type { CalendarEvent } from "./queries";

const event = {
  id: "e1",
  title: "Планёрка",
  starts_at: "2026-11-19T05:00:00Z",
  ends_at: "2026-11-19T06:00:00Z",
  location: "Переговорная",
  body: "Сроки",
  remind_before_min: 10,
  everyone: false,
  author_id: "me",
  participants: [{ user_id: "me" }, { user_id: "p1" }, { user_id: "p2" }],
} as unknown as CalendarEvent;

describe("moveDraft keeps what the meeting was", () => {
  it("«все сотрудники» stays «все» — no list of names written in its place", () => {
    const draft = moveDraft({ ...event, everyone: true }, new Date("2026-11-20T10:00:00Z"), new Date("2026-11-20T11:00:00Z"));
    expect(draft.everyone).toBe(true);
    expect(draft.participant_ids).toEqual([]);
  });
});

describe("moveDraft (D-180)", () => {
  it("keeps everything but the time, and the author out of the people", () => {
    const draft = moveDraft(event, new Date("2026-11-20T10:00:00Z"), new Date("2026-11-20T11:00:00Z"));
    expect(draft).toEqual({
      title: "Планёрка",
      starts_at: "2026-11-20T10:00:00.000Z",
      ends_at: "2026-11-20T11:00:00.000Z",
      location: "Переговорная",
      body: "Сроки",
      remind_before_min: 10,
      everyone: false,
      participant_ids: ["p1", "p2"],
    });
  });
});

describe("moveDraft without an end", () => {
  it("stays without an end — the hour is the calendar's rule, not a time somebody said", () => {
    const draft = moveDraft({ ...event, ends_at: null }, new Date("2026-11-20T10:00:00Z"), new Date("2026-11-20T11:00:00Z"));
    expect(draft.ends_at).toBeNull();
  });
});

describe("canMove", () => {
  const now = new Date("2026-11-19T05:30:00Z");
  it("the author's meeting that is not over", () => {
    expect(canMove(event, "me", now)).toBe(true);
  });
  it("not another's, not one that is over (no end — an hour)", () => {
    expect(canMove(event, "p1", now)).toBe(false);
    expect(canMove({ ...event, ends_at: null }, "me", new Date("2026-11-19T06:01:00Z"))).toBe(false);
  });
});
