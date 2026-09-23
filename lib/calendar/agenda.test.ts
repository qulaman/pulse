import { describe, expect, it } from "vitest";

import {
  agendaFrom,
  countByDay,
  dayGroups,
  defaultStartHm,
  endIsBeforeStart,
  isOver,
  monthWindow,
  myStatus,
  nextEvent,
  peopleCount,
  rsvpSummary,
  shiftDay,
  shiftEnd,
  startsSoon,
  timeRange,
  todayCount,
} from "./agenda";
import type { CalendarEvent } from "./queries";

const NOW = new Date("2026-09-18T09:00:00+05:00");

type Person = { user_id: string; status: string; reason?: string | null; full_name?: string };

function event(overrides: Partial<CalendarEvent> & { people?: Person[] } = {}): CalendarEvent {
  const { people = [], ...rest } = overrides;
  return {
    id: "e-1",
    company_id: "c-1",
    author_id: "u-dir",
    title: "Планёрка",
    body: null,
    location: "в офисе",
    starts_at: "2026-09-18T15:00:00+05:00",
    ends_at: null,
    remind_before_min: 30,
    everyone: false,
    reminded_at: null,
    cancelled_at: null,
    audio_path: null,
    source_transcript: null,
    inbox_item_id: null,
    created_at: "2026-09-18T08:00:00+05:00",
    updated_at: "2026-09-18T08:00:00+05:00",
    participants: people.map((p) => ({
      event_id: "e-1",
      user_id: p.user_id,
      status: p.status,
      reason: p.reason ?? null,
      responded_at: null,
      created_at: "2026-09-18T08:00:00+05:00",
      person: { full_name: p.full_name ?? "Марат Оспанов" },
    })),
    ...rest,
  } as CalendarEvent;
}

describe("agenda", () => {
  it("groups by the company day and names today and tomorrow", () => {
    const groups = dayGroups(
      [
        event({ id: "b", starts_at: "2026-09-19T10:00:00+05:00" }),
        event({ id: "a", starts_at: "2026-09-18T15:00:00+05:00" }),
      ],
      NOW,
    );
    expect(groups.map((g) => g.label)).toEqual(["сегодня", "завтра"]);
    expect(groups[0].events[0].id).toBe("a");
  });

  it("returns no groups for an empty calendar", () => {
    expect(dayGroups([], NOW)).toEqual([]);
  });

  it("shows the end of a meeting only when there is one", () => {
    expect(timeRange({ starts_at: "2026-09-18T15:00:00+05:00" })).toBe("15:00");
    expect(
      timeRange({ starts_at: "2026-09-18T15:00:00+05:00", ends_at: "2026-09-18T16:30:00+05:00" }),
    ).toBe("15:00–16:30");
  });

  it("calls the meeting that has just started the next one, and skips yesterday's", () => {
    const past = event({ id: "past", starts_at: "2026-09-17T15:00:00+05:00" });
    const running = event({ id: "running", starts_at: "2026-09-18T08:45:00+05:00" });
    const later = event({ id: "later", starts_at: "2026-09-18T15:00:00+05:00" });
    expect(nextEvent([past, later, running], NOW)?.id).toBe("running");
    expect(nextEvent([], NOW)).toBeNull();
  });

  it("calls a meeting soon a quarter of an hour before it", () => {
    expect(startsSoon(event({ starts_at: "2026-09-18T09:10:00+05:00" }), NOW)).toBe(true);
    expect(startsSoon(event({ starts_at: "2026-09-18T09:40:00+05:00" }), NOW)).toBe(false);
    expect(startsSoon(null, NOW)).toBe(false);
  });

  it("counts only what is still ahead today", () => {
    expect(
      todayCount(
        [
          event({ id: "done", starts_at: "2026-09-18T06:00:00+05:00" }),
          event({ id: "ahead", starts_at: "2026-09-18T15:00:00+05:00" }),
          event({ id: "tomorrow", starts_at: "2026-09-19T10:00:00+05:00" }),
        ],
        NOW,
      ),
    ).toBe(1);
  });

  it("reads my own answer off the guest list", () => {
    const row = event({ people: [{ user_id: "u-1", status: "going" }] });
    expect(myStatus(row, "u-1")).toBe("going");
    expect(myStatus(row, "u-2")).toBeNull();
  });

  it("counts everybody who has not refused, and says how it stands", () => {
    const row = event({
      people: [
        { user_id: "u-dir", status: "going" },
        { user_id: "u-1", status: "going" },
        { user_id: "u-2", status: "invited" },
        { user_id: "u-3", status: "declined", reason: "Занят срочным" },
      ],
    });
    expect(peopleCount(row)).toBe(3);
    expect(rsvpSummary(row)).toBe("2 из 4 будут, 1 не сможет");
    expect(rsvpSummary(event({ people: [{ user_id: "u-dir", status: "going" }] }))).toBe("1 из 1 будут");
  });

  it("calls a meeting over after its end, or half an hour after a start without one", () => {
    const withEnd = { starts_at: "2026-09-18T08:00:00+05:00", ends_at: "2026-09-18T09:30:00+05:00" };
    expect(isOver(withEnd, NOW)).toBe(false);
    expect(isOver({ ...withEnd, ends_at: "2026-09-18T08:50:00+05:00" }, NOW)).toBe(true);
    expect(isOver({ starts_at: "2026-09-18T08:45:00+05:00" }, NOW)).toBe(false);
    expect(isOver({ starts_at: "2026-09-18T08:15:00+05:00" }, NOW)).toBe(true);
  });

  it("reads a month and the one after it, on the Aqtobe clock, across the new year", () => {
    expect(monthWindow({ year: 2026, month: 9 })).toEqual({
      from: "2026-09-01T00:00:00+05:00",
      to: "2026-11-01T00:00:00+05:00",
    });
    expect(monthWindow({ year: 2026, month: 12 }).to).toBe("2027-02-01T00:00:00+05:00");
  });

  it("counts meetings per company day — a late evening in UTC is still the same day here", () => {
    const counts = countByDay([
      { starts_at: "2026-09-18T10:00:00+05:00" },
      { starts_at: "2026-09-18T18:30:00Z" }, // 23:30 in Aqtobe
      { starts_at: "2026-09-18T19:30:00Z" }, // 00:30 the next day
    ]);
    expect(counts.get("2026-09-18")).toBe(2);
    expect(counts.get("2026-09-19")).toBe(1);
  });

  it("starts the ribbon at the chosen day, empty or not, and runs a month on", () => {
    const rows = [
      event({ id: "before", starts_at: "2026-09-17T10:00:00+05:00" }),
      event({ id: "next", starts_at: "2026-09-21T10:00:00+05:00" }),
      event({ id: "far", starts_at: "2026-10-30T10:00:00+05:00" }),
    ];
    const groups = agendaFrom(rows, "2026-09-18", NOW);
    expect(groups.map((g) => g.ymd)).toEqual(["2026-09-18", "2026-09-21"]);
    expect(groups[0]).toMatchObject({ label: "сегодня", events: [] });
    expect(agendaFrom(rows, "2026-09-21", NOW)[0].events.map((e) => e.id)).toEqual(["next"]);
  });

  it("offers the next whole hour today and ten o'clock any other day", () => {
    expect(defaultStartHm("2026-09-18", NOW)).toBe("10:00");
    expect(defaultStartHm("2026-09-18", new Date("2026-09-18T16:20:00+05:00"))).toBe("17:00");
    expect(defaultStartHm("2026-09-18", new Date("2026-09-18T23:40:00+05:00"))).toBe("23:00");
    expect(defaultStartHm("2026-09-19", new Date("2026-09-18T16:20:00+05:00"))).toBe("10:00");
  });

  it("moves the end with the start and drops one pushed past midnight", () => {
    expect(shiftEnd("10:00", "11:30", "14:00")).toBe("15:30");
    expect(shiftEnd("10:00", null, "14:00")).toBeNull();
    expect(shiftEnd("10:00", "12:00", "23:00")).toBeNull();
    expect(endIsBeforeStart("10:00", "09:30")).toBe(true);
    expect(endIsBeforeStart("10:00", "10:00")).toBe(true);
    expect(endIsBeforeStart("10:00", "10:15")).toBe(false);
    expect(endIsBeforeStart("10:00", null)).toBe(false);
  });

  it("steps whole days across months and years", () => {
    expect(shiftDay("2026-09-28", 7)).toBe("2026-10-05");
    expect(shiftDay("2026-01-03", -7)).toBe("2025-12-27");
    expect(shiftDay("2028-02-28", 1)).toBe("2028-02-29");
  });
});
