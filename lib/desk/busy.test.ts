import { describe, expect, it } from "vitest";

import {
  busyByDay,
  busyChunks,
  busyLine,
  busyMinutes,
  dayLineOf,
  dayWindows,
  daysFromTo,
  doorHoldOf,
  doorOf,
  freeWindows,
  holdBlock,
  isoWeekday,
  lengthWords,
  mergeSpans,
  minuteHm,
  nearestWindows,
  wallMinutes,
  windowCopy,
  windowDayOf,
  type BusySpan,
  type DoorHold,
} from "./busy";

const span = (from: string, to: string): BusySpan => ({ starts_at: `${from}+05:00`, ends_at: `${to}+05:00` });
const at = (wall: string) => new Date(`${wall}+05:00`);

describe("busyByDay", () => {
  it("puts a span on its day in the wall clock's minutes", () => {
    const map = busyByDay([span("2026-11-04T10:00:00", "2026-11-04T11:30:00")], ["2026-11-03", "2026-11-04"]);
    expect(map.get("2026-11-04")).toEqual([{ start: 600, end: 690 }]);
    expect(map.has("2026-11-03")).toBe(false);
  });

  it("reads the Aqtobe day whatever the instant's own offset says", () => {
    // 20:00 UTC on the 3rd is 01:00 on the 4th in Aqtobe
    const map = busyByDay([{ starts_at: "2026-11-03T20:00:00+00:00", ends_at: "2026-11-03T21:00:00+00:00" }], ["2026-11-03", "2026-11-04"]);
    expect(map.get("2026-11-04")).toEqual([{ start: 60, end: 120 }]);
    expect(map.has("2026-11-03")).toBe(false);
  });

  it("cuts a span across midnight in two", () => {
    const map = busyByDay([span("2026-11-04T23:00:00", "2026-11-05T01:00:00")], ["2026-11-04", "2026-11-05"]);
    expect(map.get("2026-11-04")).toEqual([{ start: 1380, end: 1440 }]);
    expect(map.get("2026-11-05")).toEqual([{ start: 0, end: 60 }]);
  });

  it("does not leave an empty block at a midnight it only touches", () => {
    const map = busyByDay([span("2026-11-04T22:00:00", "2026-11-05T00:00:00")], ["2026-11-04", "2026-11-05"]);
    expect(map.get("2026-11-04")).toEqual([{ start: 1320, end: 1440 }]);
    expect(map.has("2026-11-05")).toBe(false);
  });

  it("keeps the blocks of a day in order", () => {
    const map = busyByDay([span("2026-11-04T15:00:00", "2026-11-04T16:00:00"), span("2026-11-04T09:00:00", "2026-11-04T10:00:00")], ["2026-11-04"]);
    expect(map.get("2026-11-04")?.map((block) => block.start)).toEqual([540, 900]);
  });

  it("gives the grid the minutes to hold: a block ending on the hour asks for no hour under it", () => {
    const map = busyByDay([span("2026-11-04T07:30:00", "2026-11-04T21:00:00")], ["2026-11-04"]);
    expect(busyMinutes(map)).toEqual([450, 1259]);
  });
});

describe("busyLine", () => {
  const day = [span("2026-11-04T10:00:00", "2026-11-04T11:30:00"), span("2026-11-04T16:30:00", "2026-11-04T17:00:00")];

  it("says until when a meeting lasts", () => {
    expect(busyLine(day, at("2026-11-04T10:15:00"))).toEqual({ busy: true, text: "Директор на встрече до 11:30" });
  });

  it("the first minute of a meeting is busy, the minute it ends is free", () => {
    expect(busyLine(day, at("2026-11-04T10:00:00")).busy).toBe(true);
    expect(busyLine(day, at("2026-11-04T11:30:00"))).toEqual({ busy: false, text: "Директор свободен до 16:30" });
  });

  it("says until when he is free", () => {
    expect(busyLine(day, at("2026-11-04T09:00:00")).text).toBe("Директор свободен до 10:00");
  });

  it("with nothing more today he is simply free, whatever tomorrow holds", () => {
    expect(busyLine(day, at("2026-11-04T18:00:00")).text).toBe("Директор свободен");
    expect(busyLine([span("2026-11-05T09:00:00", "2026-11-05T10:00:00")], at("2026-11-04T18:00:00")).text).toBe("Директор свободен");
    expect(busyLine([], at("2026-11-04T18:00:00"))).toEqual({ busy: false, text: "Директор свободен" });
  });

  it("names the day of an end that is not today", () => {
    expect(busyLine([span("2026-11-04T23:00:00", "2026-11-05T01:00:00")], at("2026-11-04T23:30:00")).text).toBe("Директор на встрече до завтра 01:00");
    expect(busyLine([span("2026-11-04T09:00:00", "2026-11-07T18:00:00")], at("2026-11-04T23:30:00")).text).toMatch(/^Директор на встрече до сб, 7 /);
  });
});

describe("doorOf", () => {
  const day = [span("2026-11-04T10:00:00", "2026-11-04T11:30:00"), span("2026-11-04T15:00:00", "2026-11-04T16:10:00")];
  const hold = (until: string | null, name = "Айгуль Сапарова"): DoorHold => ({ errandId: "e1", until: until ? `${until}+05:00` : null, holder: { id: "s2", name } });

  it("is free until the next busy span today, and names it", () => {
    const door = doorOf(day, null, at("2026-11-04T13:00:00"));
    expect(door?.state).toBe("free");
    expect(door?.text).toBe("Директор свободен до 15:00");
    expect(door?.until).toBe(day[1].starts_at);
    expect(door?.next).toEqual(day[1]);
  });

  it("is busy during a span, with the next span after it", () => {
    const door = doorOf(day, null, at("2026-11-04T10:30:00"));
    expect(door).toMatchObject({ state: "busy", text: "Директор на встрече до 11:30", until: day[0].ends_at, next: day[1], holder: null });
  });

  it("a closed door wins over a meeting and never says «свободен»", () => {
    const during = doorOf(day, hold("2026-11-04T11:00:00"), at("2026-11-04T10:30:00"));
    expect(during).toMatchObject({ state: "dnd", text: "Не беспокоить до 11:00", holder: { id: "s2" } });
    // the meeting going on at the door's end is what comes next
    expect(during?.next).toEqual(day[0]);
    const free = doorOf(day, hold("2026-11-04T13:45:00"), at("2026-11-04T13:24:00"));
    expect(free?.text).toBe("Не беспокоить до 13:45");
    expect(free?.text).not.toMatch(/свободен/);
    expect(free?.next).toEqual(day[1]);
  });

  it("a closed door with no end says so without a time", () => {
    expect(doorOf(day, hold(null), at("2026-11-04T13:00:00"))).toMatchObject({ state: "dnd", text: "Не беспокоить", until: null });
  });

  it("an expired hold is no closed door", () => {
    expect(doorOf(day, hold("2026-11-04T12:00:00"), at("2026-11-04T13:00:00"))?.state).toBe("free");
  });

  it("says nothing without the calendar, except a closed door", () => {
    expect(doorOf(null, null, at("2026-11-04T13:00:00"))).toBeNull();
    expect(doorOf(null, hold("2026-11-04T13:45:00"), at("2026-11-04T13:00:00"))).toMatchObject({ state: "dnd", next: null });
  });

  it("with nothing more today the free door has no end", () => {
    expect(doorOf([span("2026-11-05T09:00:00", "2026-11-05T10:00:00")], null, at("2026-11-04T18:00:00"))).toMatchObject({ state: "free", text: "Директор свободен", until: null, next: null });
  });
});

describe("doorHoldOf", () => {
  const row = (over: Partial<Parameters<typeof doorHoldOf>[0][number]>) => ({
    id: "e1",
    status: "accepted",
    kind: "dnd",
    label: "Не беспокоить",
    until_at: "2026-11-04T13:45:00+05:00",
    claimed_by: "s2",
    claimed: { full_name: "Айгуль Сапарова" },
    created_at: "2026-11-04T13:00:00+05:00",
    ...over,
  });

  it("is the newest taken «не беспокоить», with who holds it", () => {
    const hold = doorHoldOf([row({ id: "old", created_at: "2026-11-04T09:00:00+05:00" }), row({ id: "new" })]);
    expect(hold).toEqual({ errandId: "new", until: "2026-11-04T13:45:00+05:00", holder: { id: "s2", name: "Айгуль Сапарова" } });
  });

  it("passes by a hold whose time is over: an older open-ended one still closes the door", () => {
    const rows = [row({ id: "open", until_at: null, created_at: "2026-11-04T10:00:00+05:00" }), row({ id: "short", until_at: "2026-11-04T11:15:00+05:00", created_at: "2026-11-04T11:00:00+05:00" })];
    expect(doorHoldOf(rows, [], new Date("2026-11-04T11:20:00+05:00"))?.errandId).toBe("open");
    expect(doorHoldOf(rows, [], new Date("2026-11-04T11:10:00+05:00"))?.errandId).toBe("short");
    expect(doorHoldOf([rows[1]], [], new Date("2026-11-04T11:20:00+05:00"))).toBeNull();
  });

  it("a «не беспокоить» nobody took yet, or another request, closes nothing", () => {
    expect(doorHoldOf([row({ status: "sent", claimed_by: null })])).toBeNull();
    expect(doorHoldOf([row({ kind: "coffee", label: "Кофе" })])).toBeNull();
  });
});

describe("dayLineOf", () => {
  it("draws 08–19 with today's spans in the wall clock's minutes", () => {
    const line = dayLineOf([span("2026-11-04T09:00:00", "2026-11-04T09:45:00")], at("2026-11-04T13:24:00"));
    expect(line).toEqual({ from: 480, to: 1140, blocks: [{ start: 540, end: 585 }], now: 804 });
  });

  it("widens to whole hours for a span or the time outside it", () => {
    const line = dayLineOf([span("2026-11-04T07:30:00", "2026-11-04T08:30:00")], at("2026-11-04T19:40:00"));
    expect(line.from).toBe(420);
    expect(line.to).toBe(1200);
  });
});

describe("busyChunks", () => {
  it("asks a week in one call", () => {
    expect(busyChunks("2026-11-16", "2026-11-23")).toEqual([["2026-11-16", "2026-11-23"]]);
  });

  it("splits a month on screen (42 days) at 31 days", () => {
    expect(busyChunks("2026-10-26", "2026-12-07")).toEqual([
      ["2026-10-26", "2026-11-26"],
      ["2026-11-26", "2026-12-07"],
    ]);
  });

  it("asks nothing for an empty range", () => {
    expect(busyChunks("2026-11-16", "2026-11-16")).toEqual([]);
  });

  it("lists the days of a range, its end not included", () => {
    expect(daysFromTo("2026-11-29", "2026-12-02")).toEqual(["2026-11-29", "2026-11-30", "2026-12-01"]);
  });
});

describe("mergeSpans", () => {
  it("joins what two reads both returned, and what touches", () => {
    const merged = mergeSpans([
      span("2026-11-26T10:00:00", "2026-11-26T11:00:00"),
      span("2026-11-25T22:00:00", "2026-11-26T01:00:00"),
      span("2026-11-25T22:00:00", "2026-11-26T01:00:00"),
      span("2026-11-26T11:00:00", "2026-11-26T12:00:00"),
    ]);
    expect(merged).toEqual([span("2026-11-25T22:00:00", "2026-11-26T01:00:00"), span("2026-11-26T10:00:00", "2026-11-26T12:00:00")]);
  });
});

describe("freeWindows", () => {
  const H = 60;

  it("is the gaps between busy blocks inside the hours", () => {
    expect(freeWindows([{ start: 10 * H, end: 11 * H }, { start: 14 * H, end: 15 * H }], 8 * H, 20 * H)).toEqual([
      { start: 8 * H, end: 10 * H },
      { start: 11 * H, end: 14 * H },
      { start: 15 * H, end: 20 * H },
    ]);
  });

  it("takes overlapping blocks in any order and drops a gap under 15 minutes", () => {
    const blocks = [{ start: 12 * H, end: 13 * H }, { start: 9 * H, end: 11 * H }, { start: 10 * H, end: 11 * H + 50 }];
    expect(freeWindows(blocks, 8 * H, 13 * H)).toEqual([{ start: 8 * H, end: 9 * H }]);
  });

  it("a day without blocks is one window; a day busy through is none", () => {
    expect(freeWindows([], 8 * H, 20 * H)).toEqual([{ start: 8 * H, end: 20 * H }]);
    expect(freeWindows([{ start: 7 * H, end: 21 * H }], 8 * H, 20 * H)).toEqual([]);
  });
});

describe("dayWindows", () => {
  const H = 60;
  const from = 8 * H;
  const to = 20 * H;

  it("today starts at now, and the closed door is no window", () => {
    const day = dayWindows({ blocks: [{ start: 15 * H, end: 16 * H }], kind: "today", from, to, nowMinute: 13 * H, hold: { start: 13 * H, end: 14 * H } });
    expect(day.windows).toEqual([
      { start: 14 * H, end: 15 * H },
      { start: 16 * H, end: 20 * H },
    ]);
    expect(day.free).toBe(5 * H);
  });

  it("a day gone by or a day off offers no window", () => {
    expect(dayWindows({ blocks: [], kind: "past", from, to }).windows).toEqual([]);
    expect(dayWindows({ blocks: [{ start: 11 * H, end: 13 * H }], kind: "off", from, to })).toMatchObject({ windows: [], busy: true });
  });

  it("a day with no busy time says so — no meetings, not «free all day»", () => {
    expect(dayWindows({ blocks: [], kind: "work", from, to })).toMatchObject({ busy: false, free: 12 * H });
  });

  it("says the busy time outside the hours at the row's ends, a night span with its end", () => {
    const day = dayWindows({
      blocks: [{ start: 7 * H + 30, end: 9 * H }, { start: 22 * H, end: 24 * H }],
      kind: "work",
      from,
      to,
      night: [{ start: 0, end: H }],
    });
    expect(day.early).toBe("занят с 07:30");
    expect(day.late).toBe("занят 22:00→01:00");
    expect(dayWindows({ blocks: [{ start: 0, end: H }, { start: 19 * H, end: 21 * H }], kind: "work", from, to })).toMatchObject({ early: "занят до 01:00", late: "занят до 21:00" });
    expect(dayWindows({ blocks: [{ start: 6 * H, end: 7 * H }], kind: "work", from, to }).early).toBe("занят 06:00–07:00");
  });
});

describe("nearestWindows", () => {
  it("lists the windows from now on, working days only, the door taken out of today", () => {
    const now = at("2026-11-20T16:00:00"); // a Friday
    const blocks = new Map([["2026-11-20", [{ start: 17 * 60, end: 19 * 60 }]]]);
    const list = nearestWindows({
      blocks,
      days: ["2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"],
      now,
      workdays: [1, 2, 3, 4, 5],
      from: 8 * 60,
      to: 20 * 60,
      hold: holdBlock({ errandId: "e", until: "2026-11-20T16:30:00+05:00", holder: null }, now),
    });
    expect(list).toEqual([
      { ymd: "2026-11-20", start: 16 * 60 + 30, end: 17 * 60 },
      { ymd: "2026-11-20", start: 19 * 60, end: 20 * 60 },
      { ymd: "2026-11-23", start: 8 * 60, end: 20 * 60 },
    ]);
    expect(windowCopy(list[2], now)).toBe("Свободен пн, 23 ноября, 08:00–20:00");
    expect(windowCopy(list[0], now)).toBe("Свободен сегодня, 16:30–17:00");
  });

  it("a closed door without an end takes the rest of today", () => {
    const now = at("2026-11-20T16:00:00");
    expect(holdBlock({ errandId: "e", until: null, holder: null }, now)).toEqual({ start: 960, end: 1440 });
    expect(holdBlock({ errandId: "e", until: "2026-11-20T15:00:00+05:00", holder: null }, now)).toBeNull();
  });
});

describe("words", () => {
  it("says lengths and hours", () => {
    expect(lengthWords(45)).toBe("45 мин");
    expect(lengthWords(60)).toBe("1 ч");
    expect(lengthWords(90)).toBe("1 ч 30 мин");
    expect(minuteHm(495)).toBe("08:15");
    expect(wallMinutes(at("2026-11-20T09:05:00"))).toBe(545);
  });

  it("counts the weekday as the settings do", () => {
    expect(isoWeekday("2026-11-16")).toBe(1);
    expect(isoWeekday("2026-11-22")).toBe(7);
    expect(windowDayOf("2026-11-22", "2026-11-20", [1, 2, 3, 4, 5])).toBe("off");
    expect(windowDayOf("2026-11-19", "2026-11-20", [1, 2, 3, 4, 5])).toBe("past");
  });
});
