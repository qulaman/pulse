import { describe, expect, it } from "vitest";

import { dueMeetings, isMine, ringHref, ringKey, ringWords } from "./ring";

// 2026-11-17 14:00 in Aqtobe (UTC+5)
const NOW = new Date("2026-11-17T09:00:00Z");
const ME = "me";

type Person = { user_id: string; status: string };
const meeting = (id: string, startsAt: string, people: Person[], extra: Partial<{ author_id: string; location: string | null; cancelled_at: string | null; title: string }> = {}) =>
  ({
    id,
    starts_at: startsAt,
    title: extra.title ?? `Встреча ${id}`,
    location: extra.location ?? null,
    author_id: extra.author_id ?? "boss",
    cancelled_at: extra.cancelled_at ?? null,
    participants: people.map((person) => ({ ...person, event_id: id, reason: null, responded_at: null, created_at: "", person: null })),
  }) as Parameters<typeof isMine>[0];

describe("whose meeting rings", () => {
  it("the author's, and a participant's who has not refused", () => {
    expect(isMine(meeting("a", "2026-11-17T09:10:00Z", [], { author_id: ME }), ME)).toBe(true);
    expect(isMine(meeting("b", "2026-11-17T09:10:00Z", [{ user_id: ME, status: "invited" }]), ME)).toBe(true);
    expect(isMine(meeting("c", "2026-11-17T09:10:00Z", [{ user_id: ME, status: "declined" }]), ME)).toBe(false);
    expect(isMine(meeting("d", "2026-11-17T09:10:00Z", [{ user_id: "other", status: "going" }]), ME)).toBe(false);
    expect(isMine(meeting("e", "2026-11-17T09:10:00Z", [], { author_id: ME, cancelled_at: "2026-11-17T08:00:00Z" }), ME)).toBe(false);
  });
});

describe("dueMeetings", () => {
  const going = [{ user_id: ME, status: "going" }];
  const list = [
    meeting("later", "2026-11-17T09:30:00Z", going),
    meeting("soon", "2026-11-17T09:12:00Z", going),
    meeting("edge", "2026-11-17T09:15:00Z", going),
    meeting("begun", "2026-11-17T08:55:00Z", going),
    meeting("other", "2026-11-17T09:05:00Z", [{ user_id: "x", status: "going" }]),
  ];

  it("rings what starts within a quarter of an hour, the soonest first — not one already begun", () => {
    expect(dueMeetings(list, ME, NOW, new Set()).map((event) => event.id)).toEqual(["soon", "edge"]);
  });

  it("rings once per browser; a moved meeting rings again", () => {
    const rang = new Set([ringKey(list[1])]);
    expect(dueMeetings(list, ME, NOW, rang).map((event) => event.id)).toEqual(["edge"]);
    const moved = { ...list[1], starts_at: "2026-11-17T09:13:00Z" };
    expect(dueMeetings([moved], ME, NOW, rang).map((event) => event.id)).toEqual(["soon"]);
  });
});

describe("the toast", () => {
  it("says the minutes left, the title and the place", () => {
    expect(ringWords(meeting("p", "2026-11-17T09:15:00Z", [], { title: "Планёрка", location: "Переговорная" }), NOW)).toBe("Через 15 мин: Планёрка · Переговорная");
    expect(ringWords(meeting("q", "2026-11-17T09:04:30Z", [], { title: "Звонок" }), NOW)).toBe("Через 5 мин: Звонок");
  });

  it("opens the meeting on the desk's calendar", () => {
    expect(ringHref({ id: "abc" })).toBe("/desk/calendar?e=abc");
  });
});
