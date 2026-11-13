import { describe, expect, it } from "vitest";

import { busyByDay, busyLine, busyMinutes, dayLineOf, doorHoldOf, doorOf, type BusySpan, type DoorHold } from "./busy";

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
