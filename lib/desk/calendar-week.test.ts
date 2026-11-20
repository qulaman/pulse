import { describe, expect, it } from "vitest";

import { earliest, minutesAt, movedTo, ahead, slotOf } from "@/components/desk/calendar/slots";
import { isoWeekday } from "@/lib/desk/busy";
import {
  bandOf,
  bandsOf,
  clockOf,
  columnsOf,
  dayShares,
  hourPxFor,
  layoutDay,
  SHARE,
  spanOf,
  yOf,
  type Placed,
} from "@/components/desk/calendar/week";
import type { CalendarEvent } from "@/lib/calendar/queries";

// a Tuesday on the Aqtobe wall clock (+05:00)
const DAY = "2026-11-17";
const NEXT = "2026-11-18";

let serial = 0;
function ev(start: string, end: string | null, title = `m${++serial}`, endDay = DAY): CalendarEvent {
  return {
    id: `e-${title}`,
    title,
    starts_at: `${DAY}T${start}:00+05:00`,
    ends_at: end ? `${endDay}T${end}:00+05:00` : null,
    author_id: "me",
    audio_path: null,
    body: null,
    cancelled_at: null,
    company_id: "c",
    created_at: "2026-11-01T00:00:00Z",
    everyone: false,
    inbox_item_id: null,
    location: null,
    recurrence_on: null,
    recurrence_rule_id: null,
    remind_before_min: 15,
    reminded_at: null,
    source_transcript: null,
    updated_at: "2026-11-01T00:00:00Z",
    participants: [],
  };
}

const byTitle = (placed: Placed[]) => new Map(placed.map((item) => [item.event.title, item]));

describe("spanOf / clockOf", () => {
  it("a meeting without an end lasts an hour", () => {
    expect(spanOf(ev("10:00", null))).toEqual({ start: 600, end: 660, overnight: false });
    expect(clockOf(ev("10:00", null))).toBe("10:00");
  });

  it("a night meeting closes at midnight on its own day and reads «22:00→01:00»", () => {
    const night = ev("22:00", "01:00", "night", NEXT);
    expect(spanOf(night)).toEqual({ start: 1320, end: 1440, overnight: true });
    expect(clockOf(night)).toBe("22:00→01:00");
    expect(clockOf(ev("10:00", "11:30"))).toBe("10:00–11:30");
  });
});

describe("bands: hours outside 08–20 never stretch the grid", () => {
  it("before 08:00 entirely — the early row; from 20:00 — the late row; else the grid", () => {
    expect(bandOf({ start: 420, end: 465 })).toBe("early");
    expect(bandOf({ start: 420, end: 480 })).toBe("early");
    expect(bandOf({ start: 450, end: 540 })).toBe("day");
    expect(bandOf({ start: 1140, end: 1320 })).toBe("day");
    expect(bandOf({ start: 1200, end: 1260 })).toBe("late");
    expect(bandOf({ start: 1320, end: 1440 })).toBe("late");
  });

  it("splits a day's meetings, in order", () => {
    const early = ev("07:00", "07:45", "early");
    const grid = ev("09:00", "10:00", "grid");
    const night = ev("22:00", "01:00", "night", NEXT);
    const bands = bandsOf([early, grid, night]);
    expect(bands.early.map((e) => e.title)).toEqual(["early"]);
    expect(bands.day.map((e) => e.title)).toEqual(["grid"]);
    expect(bands.late.map((e) => e.title)).toEqual(["night"]);
  });

  it("a meeting across 08:00 or 20:00 is cut to the grid and says so", () => {
    const placed = byTitle(layoutDay([ev("07:30", "09:00", "dawn"), ev("19:00", "21:30", "dusk")]));
    expect(placed.get("dawn")).toMatchObject({ start: 480, end: 540, clipTop: true, clipBottom: false });
    expect(placed.get("dusk")).toMatchObject({ start: 1140, end: 1200, clipTop: false, clipBottom: true });
  });
});

describe("layoutDay: overlaps by real ends", () => {
  it("back-to-back meetings never share the width, however short", () => {
    const placed = byTitle(layoutDay([ev("10:00", "10:15", "call"), ev("10:15", "11:30", "talk")], { minMinutes: 30 }));
    expect(placed.get("call")).toMatchObject({ lane: 0, lanes: 1, depth: 0 });
    expect(placed.get("talk")).toMatchObject({ lane: 0, lanes: 1, depth: 0 });
    // the short one is drawn up to the next one, not over it
    expect(placed.get("call")!.drawEnd).toBe(615);
  });

  it("a short meeting with room after it is drawn tall enough for its words", () => {
    const placed = byTitle(layoutDay([ev("16:30", "16:45", "call"), ev("17:00", "18:00", "board")], { minMinutes: 26 }));
    expect(placed.get("call")!.drawEnd).toBe(1016);
    expect(placed.get("call")!.end).toBe(1005);
  });

  it("two at once stand side by side", () => {
    const placed = byTitle(layoutDay([ev("11:30", "12:30", "a"), ev("12:00", "13:00", "b")]));
    expect(placed.get("a")).toMatchObject({ lane: 0, lanes: 2, depth: 0, depths: 0 });
    expect(placed.get("b")).toMatchObject({ lane: 1, lanes: 2, depth: 0, depths: 0 });
  });

  it("a long day with short meetings over it, never three at once, stays two lanes", () => {
    const placed = byTitle(layoutDay([ev("09:00", "18:00", "long"), ev("12:00", "13:00", "x"), ev("15:00", "16:00", "y")]));
    expect(placed.get("long")).toMatchObject({ lane: 0, lanes: 2 });
    expect(placed.get("x")).toMatchObject({ lane: 1, lanes: 2 });
    expect(placed.get("y")).toMatchObject({ lane: 1, lanes: 2 });
  });

  it("three or more at once cascade: each later one a step in; starting together — side by side", () => {
    const placed = byTitle(layoutDay([ev("09:30", "10:30", "smeta"), ev("10:00", "11:00", "lawyer"), ev("10:15", "10:45", "hire")]));
    expect(placed.get("smeta")).toMatchObject({ depth: 0, lane: 0, lanes: 1, depths: 1 });
    // 10:00 and 10:15 start within half an hour: one step, side by side
    expect(placed.get("lawyer")).toMatchObject({ depth: 1, lane: 0, lanes: 2, depths: 1 });
    expect(placed.get("hire")).toMatchObject({ depth: 1, lane: 1, lanes: 2, depths: 1 });
  });

  it("a cascade steps in once per meeting still on, and steps back out when they end", () => {
    const placed = byTitle(
      layoutDay([ev("09:00", "13:00", "a"), ev("10:00", "12:00", "b"), ev("11:00", "11:45", "c"), ev("12:30", "13:30", "d")]),
    );
    expect(placed.get("a")!.depth).toBe(0);
    expect(placed.get("b")!.depth).toBe(1);
    expect(placed.get("c")!.depth).toBe(2);
    // at 12:30 only «a» is still on
    expect(placed.get("d")!.depth).toBe(1);
    for (const item of placed.values()) expect(item.depths).toBe(2);
  });

  it("meetings with the same start stay side by side even in a cascade", () => {
    const placed = byTitle(layoutDay([ev("14:00", "17:00", "base"), ev("15:00", "16:00", "p"), ev("15:00", "16:00", "q"), ev("15:00", "15:30", "r")]));
    expect(placed.get("base")).toMatchObject({ depth: 0, lanes: 1 });
    for (const title of ["p", "q", "r"]) expect(placed.get(title)).toMatchObject({ depth: 1, lanes: 3 });
    expect(new Set(["p", "q", "r"].map((title) => placed.get(title)!.lane))).toEqual(new Set([0, 1, 2]));
  });

  it("an empty day lays out nothing", () => {
    expect(layoutDay([])).toEqual([]);
  });
});

describe("the hour's height follows the screen", () => {
  // the room under the grid's top at 1280×800, 1440×900, 1920×1080 (after the head and the rows)
  it("fits twelve hours into the room, within 40–72 px", () => {
    expect(hourPxFor(526)).toBe(43);
    expect(hourPxFor(626)).toBe(52);
    expect(hourPxFor(806)).toBe(67);
    expect(hourPxFor(200)).toBe(40);
    expect(hourPxFor(2000)).toBe(72);
    expect(hourPxFor(Number.NaN)).toBe(48);
  });

  it("the grid and the mouse agree on the same hour", () => {
    for (const hourPx of [40, 43, 52, 67, 72]) {
      for (const minutes of [480, 555, 600, 915, 1185]) {
        expect(minutesAt(yOf(minutes, 8, hourPx) + 0.5, 8, hourPx)).toBe(Math.floor(minutes / 15) * 15);
      }
    }
  });
});

describe("widths by focus and workdays, never by data", () => {
  const week = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"];

  it("counts the weekday as settings do: 1 = Monday … 7 = Sunday", () => {
    expect(week.map(isoWeekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("the focused day is wide, a working day one share, a day off narrow", () => {
    expect(dayShares(week, "2026-11-17", [1, 2, 3, 4, 5])).toEqual([1, SHARE.focus, 1, 1, 1, SHARE.off, SHARE.off]);
    expect(dayShares(week, null, [1, 2, 3, 4, 5, 6])).toEqual([1, 1, 1, 1, 1, 1, SHARE.off]);
    // a day off in focus is as wide as any focused day
    expect(dayShares(week, "2026-11-22", [1, 2, 3, 4, 5])[6]).toBe(SHARE.focus);
  });

  it("writes the grid's columns", () => {
    expect(columnsOf(52, [1, 2.2, 0.55])).toBe("52px minmax(0, 1fr) minmax(0, 2.2fr) minmax(0, 0.55fr)");
  });
});

describe("slots and moves", () => {
  const now = new Date(`${DAY}T15:47:00+05:00`);

  it("a new meeting starts no earlier than the next quarter today, never on a past day", () => {
    expect(earliest(DAY, now)).toBe(16 * 60);
    expect(earliest("2026-11-16", now)).toBeNull();
    expect(earliest(NEXT, now)).toBe(0);
    expect(ahead(slotOf(DAY, 900, 900, false), earliest(DAY, now))).toEqual({ ymd: DAY, start: 960, end: 1020 });
  });

  it("a moved meeting keeps its length; an hour when it has none", () => {
    const moved = movedTo(ev("16:00", "17:30"), NEXT, 15 * 60, now);
    expect(moved?.start.toISOString()).toBe("2026-11-18T10:00:00.000Z");
    expect(moved?.end.toISOString()).toBe("2026-11-18T11:30:00.000Z");
    const open = movedTo(ev("16:00", null), NEXT, 9 * 60, now);
    expect(open!.end.getTime() - open!.start.getTime()).toBe(60 * 60_000);
  });

  it("never into the past, and a drop where it was is no move", () => {
    expect(movedTo(ev("16:00", "17:00"), DAY, 15 * 60, now)).toBeNull();
    expect(movedTo(ev("16:00", "17:00"), DAY, 16 * 60, now)).toBeNull();
    expect(movedTo(ev("16:00", "17:00"), DAY, 16 * 60 + 15, now)).not.toBeNull();
  });
});
