import { describe, expect, it } from "vitest";

import {
  dayGroups,
  myStatus,
  nextEvent,
  peopleCount,
  rsvpSummary,
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
});
