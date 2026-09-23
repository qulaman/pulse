import { describe, expect, it } from "vitest";

import { awaitingAnswer, calendarScreen, dayStrip, endOf, isRunning, toneAhead, whenAhead } from "./overview";
import type { CalendarEvent } from "./queries";

const NOW = new Date("2026-09-24T11:00:00+05:00"); // Thursday, 11:00 in Aqtobe
const ME = "u-me";
const DIR = "u-dir";

type Person = { user_id: string; status: string };

function event(id: string, starts: string, extra: Partial<CalendarEvent> & { people?: Person[] } = {}): CalendarEvent {
  const { people = [{ user_id: DIR, status: "going" }], ...rest } = extra;
  return {
    id,
    company_id: "c",
    author_id: DIR,
    title: `Встреча ${id}`,
    body: null,
    location: null,
    starts_at: `${starts}+05:00`,
    ends_at: null,
    remind_before_min: 30,
    everyone: false,
    reminded_at: null,
    cancelled_at: null,
    audio_path: null,
    source_transcript: null,
    inbox_item_id: null,
    created_at: "2026-09-20T08:00:00+05:00",
    updated_at: "2026-09-20T08:00:00+05:00",
    participants: people.map((p) => ({
      event_id: id,
      user_id: p.user_id,
      status: p.status,
      reason: null,
      responded_at: null,
      created_at: "2026-09-20T08:00:00+05:00",
      person: { full_name: "Марат Оспанов" },
    })),
    ...rest,
  } as CalendarEvent;
}

describe("calendar overview", () => {
  it("gives a meeting without an end an hour on the strip, and knows when it runs", () => {
    const row = event("a", "2026-09-24T10:30:00");
    expect(endOf(row) - new Date(row.starts_at).getTime()).toBe(60 * 60_000);
    expect(isRunning(row, NOW)).toBe(true); // 10:30 + 30 min grace = still on at 11:00
    expect(isRunning(event("b", "2026-09-24T11:30:00"), NOW)).toBe(false);
  });

  it("says «через N мин» within the hour, the clock further out, «идёт» while on", () => {
    expect(whenAhead(event("a", "2026-09-24T11:25:00"), NOW)).toBe("через 25 мин");
    expect(whenAhead(event("b", "2026-09-24T15:00:00"), NOW)).toBe("сегодня 15:00");
    expect(whenAhead(event("c", "2026-09-25T10:00:00"), NOW)).toBe("завтра 10:00");
    expect(
      whenAhead(event("d", "2026-09-24T10:00:00", { ends_at: "2026-09-24T12:00:00+05:00" }), NOW),
    ).toBe("идёт · до 12:00");
    expect(toneAhead(event("e", "2026-09-24T11:10:00"), NOW)).toBe("warn");
    expect(toneAhead(event("f", "2026-09-24T14:00:00"), NOW)).toBe("accent");
    expect(toneAhead(event("g", "2026-09-24T08:00:00"), NOW)).toBe("muted");
  });

  it("owes answers only for other people's meetings that are still ahead", () => {
    const rows = [
      event("mine", "2026-09-25T10:00:00", { author_id: ME, people: [{ user_id: ME, status: "invited" }] }),
      event("ask", "2026-09-25T10:00:00", { people: [{ user_id: ME, status: "invited" }] }),
      event("said", "2026-09-25T12:00:00", { people: [{ user_id: ME, status: "going" }] }),
      event("gone", "2026-09-23T10:00:00", { people: [{ user_id: ME, status: "invited" }] }),
    ];
    expect(awaitingAnswer(rows, ME, NOW).map((e) => e.id)).toEqual(["ask"]);
  });

  it("draws the working day and widens it for an early meeting", () => {
    const strip = dayStrip(
      [event("a", "2026-09-24T09:00:00"), event("b", "2026-09-24T14:00:00", { ends_at: "2026-09-24T15:30:00+05:00" })],
      NOW,
    );
    expect([strip.from, strip.to]).toEqual([8, 20]);
    expect(strip.ticks).toEqual([8, 12, 16, 20]);
    expect(strip.now).toBeCloseTo(25); // 11:00 on 08–20
    expect(strip.blocks.map((b) => b.state)).toEqual(["past", "ahead"]);
    expect(strip.blocks[1].left).toBeCloseTo(50);
    expect(strip.blocks[1].width).toBeCloseTo(12.5);
    expect(dayStrip([event("x", "2026-09-24T06:30:00")], NOW).from).toBe(6);
    expect(dayStrip([event("y", "2026-09-25T09:00:00")], NOW).blocks).toEqual([]);
  });

  it("puts a meeting that is on first", () => {
    const screen = calendarScreen(
      [event("on", "2026-09-24T10:45:00", { ends_at: "2026-09-24T11:30:00+05:00", location: "Переговорка" }), event("later", "2026-09-24T16:00:00")],
      ME,
      NOW,
    );
    expect(screen).toMatchObject({ eyebrow: "Идёт сейчас", tone: "accent", value: 2, label: "мероприятия сегодня" });
    expect(screen.detail).toBe("Встреча on · до 11:30 · Переговорка");
    expect(screen.nearest).toMatchObject({ id: "on", when: "идёт · до 11:30" });
  });

  it("raises its voice a quarter of an hour before", () => {
    const screen = calendarScreen([event("soon", "2026-09-24T11:10:00")], ME, NOW);
    expect(screen).toMatchObject({ eyebrow: "Через 10 мин", tone: "warn", value: 1, label: "мероприятие сегодня" });
  });

  it("asks for the answers before telling the day", () => {
    const screen = calendarScreen(
      [
        event("today", "2026-09-24T16:00:00"),
        event("ask", "2026-09-25T10:00:00", { people: [{ user_id: ME, status: "invited" }] }),
      ],
      ME,
      NOW,
    );
    expect(screen).toMatchObject({ eyebrow: "Ваш ответ", tone: "warn", value: 1, label: "приглашение ждёт ответа" });
    expect(screen.legend.map((l) => l.key)).toEqual(["ahead", "answer"]); // no «0 прошло»
  });

  it("tells what today still holds", () => {
    const screen = calendarScreen(
      [event("done", "2026-09-24T09:00:00"), event("next", "2026-09-24T15:00:00", { location: "Офис" })],
      ME,
      NOW,
    );
    expect(screen).toMatchObject({ eyebrow: "Сегодня", value: 1, detail: "Ближайшее в 15:00 — Встреча next · Офис" });
    expect(screen.legend).toEqual([
      { key: "ahead", label: "впереди", count: 1, tone: "accent" },
      { key: "past", label: "прошло", count: 1, tone: "muted" },
    ]);
  });

  it("calls a free day free and says what comes next", () => {
    const screen = calendarScreen([event("tmrw", "2026-09-25T10:00:00")], ME, NOW);
    expect(screen).toMatchObject({ eyebrow: "Сегодня свободно", tone: "muted", value: null, week: 1 });
    expect(screen.detail).toBe("Дальше — завтра в 10:00: Встреча tmrw");
    expect(screen.legend).toEqual([{ key: "month", label: "впереди за месяц", count: 1, tone: "accent" }]);
    expect(calendarScreen([], ME, NOW).detail).toBe("На неделе тоже пусто");
    expect(calendarScreen([event("am", "2026-09-24T08:00:00")], ME, NOW)).toMatchObject({
      eyebrow: "На сегодня всё",
      label: "встреча позади",
    });
  });
});
