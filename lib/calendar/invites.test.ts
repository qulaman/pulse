import { describe, expect, it } from "vitest";

import { awaitsMyAnswer, pendingInvites } from "./invites";
import { awaitingAnswer } from "./overview";
import type { CalendarEvent } from "./queries";

const NOW = new Date("2026-11-12T11:00:00+05:00");
const ME = "u-me";
const BOSS = "u-dir";

type Person = { user_id: string; status: string; reason?: string | null };

function event(overrides: Partial<CalendarEvent> & { people?: Person[] } = {}): CalendarEvent {
  const { people = [{ user_id: BOSS, status: "going" }, { user_id: ME, status: "invited" }], ...rest } = overrides;
  const id = rest.id ?? "e-1";
  return {
    id,
    company_id: "c-1",
    author_id: BOSS,
    title: "Планёрка",
    body: null,
    location: null,
    starts_at: "2026-11-12T15:00:00+05:00",
    ends_at: null,
    remind_before_min: 30,
    everyone: false,
    reminded_at: null,
    cancelled_at: null,
    audio_path: null,
    source_transcript: null,
    inbox_item_id: null,
    recurrence_rule_id: null,
    recurrence_on: null,
    created_at: "2026-11-12T08:00:00+05:00",
    updated_at: "2026-11-12T08:00:00+05:00",
    participants: people.map((p) => ({
      event_id: id,
      user_id: p.user_id,
      status: p.status,
      reason: p.reason ?? null,
      responded_at: null,
      created_at: "2026-11-12T08:00:00+05:00",
      person: { full_name: p.user_id === BOSS ? "Тимур Сапаров" : "Ерлан Бекенов" },
    })),
    ...rest,
  } as CalendarEvent;
}

const ids = (events: CalendarEvent[]) => events.map((e) => e.id);

describe("pendingInvites", () => {
  it("keeps the meetings I am invited to and have not answered, the nearest first", () => {
    const list = [
      event({ id: "later", starts_at: "2026-11-14T10:00:00+05:00" }),
      event({ id: "soon", starts_at: "2026-11-12T12:00:00+05:00" }),
      event({ id: "tomorrow", starts_at: "2026-11-13T09:00:00+05:00" }),
    ];
    expect(ids(pendingInvites(list, ME, NOW))).toEqual(["soon", "tomorrow", "later"]);
  });

  it("orders by the moment, not by how the time is written", () => {
    const list = [
      event({ id: "b", starts_at: "2026-11-12T07:30:00+00:00" }), // 12:30 in Aqtobe
      event({ id: "a", starts_at: "2026-11-12T12:00:00+05:00" }),
    ];
    expect(ids(pendingInvites(list, ME, NOW))).toEqual(["a", "b"]);
  });

  it("drops what I have already answered, either way", () => {
    const list = [
      event({ id: "going", people: [{ user_id: BOSS, status: "going" }, { user_id: ME, status: "going" }] }),
      event({ id: "declined", people: [{ user_id: BOSS, status: "going" }, { user_id: ME, status: "declined", reason: "Болею" }] }),
      event({ id: "open" }),
    ];
    expect(ids(pendingInvites(list, ME, NOW))).toEqual(["open"]);
  });

  it("drops meetings I am not in", () => {
    const other = event({ id: "other", people: [{ user_id: BOSS, status: "going" }, { user_id: "u-x", status: "invited" }] });
    expect(pendingInvites([other], ME, NOW)).toEqual([]);
  });

  it("never asks the author — even a row that says invited", () => {
    const mine = event({ id: "mine", author_id: ME, people: [{ user_id: ME, status: "invited" }] });
    expect(pendingInvites([mine], ME, NOW)).toEqual([]);
  });

  it("drops a cancelled meeting", () => {
    const gone = event({ id: "gone", cancelled_at: "2026-11-12T10:00:00+05:00" });
    expect(pendingInvites([gone], ME, NOW)).toEqual([]);
  });

  it("keeps a meeting that is running, drops one that is over", () => {
    const running = event({ id: "running", starts_at: "2026-11-12T10:30:00+05:00", ends_at: "2026-11-12T11:30:00+05:00" });
    const ended = event({ id: "ended", starts_at: "2026-11-12T09:00:00+05:00", ends_at: "2026-11-12T10:59:00+05:00" });
    expect(ids(pendingInvites([running, ended], ME, NOW))).toEqual(["running"]);
  });

  it("gives a meeting without an end half an hour after its start", () => {
    const justBegun = event({ id: "begun", starts_at: "2026-11-12T10:35:00+05:00" });
    const longAgo = event({ id: "past", starts_at: "2026-11-12T10:25:00+05:00" });
    expect(ids(pendingInvites([justBegun, longAgo], ME, NOW))).toEqual(["begun"]);
  });

  it("counts a meeting of a series (D-148): its people are invited without a notice", () => {
    const weekly = event({ id: "weekly", recurrence_rule_id: "r-1", recurrence_on: "2026-11-13", starts_at: "2026-11-13T09:00:00+05:00" });
    expect(ids(pendingInvites([weekly], ME, NOW))).toEqual(["weekly"]);
  });

  it("asks nobody before the profile is known", () => {
    expect(pendingInvites([event()], "", NOW)).toEqual([]);
  });

  it("does not reorder the list it was given", () => {
    const list = [event({ id: "b", starts_at: "2026-11-13T09:00:00+05:00" }), event({ id: "a" })];
    pendingInvites(list, ME, NOW);
    expect(ids(list)).toEqual(["b", "a"]);
  });
});

describe("awaitsMyAnswer", () => {
  it("is the rule of one row", () => {
    expect(awaitsMyAnswer(event(), ME, NOW)).toBe(true);
    expect(awaitsMyAnswer(event(), BOSS, NOW)).toBe(false);
  });

  it("asks the same as «Ваш ответ» of /calendar", () => {
    const list = [
      event({ id: "open" }),
      event({ id: "going", people: [{ user_id: BOSS, status: "going" }, { user_id: ME, status: "going" }] }),
      event({ id: "ended", starts_at: "2026-11-12T09:00:00+05:00" }),
      event({ id: "mine", author_id: ME, people: [{ user_id: ME, status: "invited" }] }),
      event({ id: "running", starts_at: "2026-11-12T10:50:00+05:00" }),
    ];
    const sorted = (rows: CalendarEvent[]) => ids(rows).sort();
    expect(sorted(pendingInvites(list, ME, NOW))).toEqual(sorted(awaitingAnswer(list, ME, NOW)));
  });
});
