import { describe, expect, it } from "vitest";

import { describeCalendar, nextEventLine } from "./say";
import type { CalendarEvent } from "./queries";

const NOW = new Date("2026-09-18T09:00:00+05:00");
const ME = "u-me";

type Person = { user_id: string; status: string; reason?: string | null; full_name?: string };

function event(overrides: Partial<CalendarEvent> & { people?: Person[] } = {}): CalendarEvent {
  const { people = [], ...rest } = overrides;
  return {
    id: "e-1",
    company_id: "c-1",
    author_id: ME,
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

describe("describeCalendar", () => {
  it("says nothing about the very first feed", () => {
    expect(describeCalendar([], [event()], NOW, ME)).toHaveLength(0);
  });

  it("reports the reminder the tick just wrote, with the number of people", () => {
    const before = event({ people: [{ user_id: ME, status: "going" }, { user_id: "u-1", status: "going" }] });
    const after = { ...before, reminded_at: "2026-09-18T14:30:00+05:00" } as CalendarEvent;
    const [phrase] = describeCalendar([before], [after], new Date("2026-09-18T14:30:00+05:00"), ME);
    expect(phrase.text).toBe("Через 30 минут — «Планёрка», 2 человека");
    expect(phrase.source).toBe("calendar");
  });

  it("says the meeting has started when the reminder is late", () => {
    const before = event();
    const after = { ...before, reminded_at: "2026-09-18T15:01:00+05:00" } as CalendarEvent;
    const [phrase] = describeCalendar([before], [after], new Date("2026-09-18T15:01:00+05:00"), ME);
    expect(phrase.text).toBe("Началось: «Планёрка»");
  });

  it("passes on somebody else's answer, mine it keeps quiet about", () => {
    const before = event({
      people: [
        { user_id: ME, status: "invited" },
        { user_id: "u-1", status: "invited", full_name: "Марат Оспанов" },
      ],
    });
    const after = event({
      people: [
        { user_id: ME, status: "going" },
        { user_id: "u-1", status: "declined", reason: "Занят срочным", full_name: "Марат Оспанов" },
      ],
    });
    const phrases = describeCalendar([before], [after], NOW, ME);
    expect(phrases).toHaveLength(1);
    expect(phrases[0].text).toBe("Марат не сможет на «Планёрка»: занят срочным");
  });

  it("announces an invitation to a meeting somebody else called", () => {
    const invite = event({ id: "e-2", author_id: "u-dir", people: [{ user_id: ME, status: "invited" }] });
    const [phrase] = describeCalendar([], [invite], NOW, ME);
    expect(phrase.text).toBe("Приглашение: «Планёрка», сегодня 15:00");
  });

  it("reports a move", () => {
    const before = event();
    const after = { ...before, starts_at: "2026-09-18T16:00:00+05:00" } as CalendarEvent;
    const [phrase] = describeCalendar([before], [after], NOW, ME);
    expect(phrase.text).toBe("Перенос: «Планёрка» теперь сегодня 16:00");
  });
});

describe("nextEventLine", () => {
  it("names the next meeting of today", () => {
    expect(nextEventLine([event({ people: [{ user_id: ME, status: "going" }] })], NOW)).toBe(
      "Сегодня в 15:00 — «Планёрка», 1 человек",
    );
  });

  it("stays silent when today has nothing ahead", () => {
    expect(nextEventLine([event({ starts_at: "2026-09-19T10:00:00+05:00" })], NOW)).toBeNull();
    expect(nextEventLine([], NOW)).toBeNull();
    expect(nextEventLine(undefined, NOW)).toBeNull();
  });
});
