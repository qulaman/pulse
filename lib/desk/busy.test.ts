import { describe, expect, it } from "vitest";

import { busyByDay, busyLine, busyMinutes, type BusySpan } from "./busy";

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
