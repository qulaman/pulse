import { describe, expect, it } from "vitest";

import { deadlineShifts, isAhead, sameInstant, sheetPresets } from "./deadline-choices";

// Tuesday 2026-11-24, 10:00 in Aqtobe (05:00 UTC)
const MORNING = new Date("2026-11-24T05:00:00Z");
// the same Tuesday, 19:30 in Aqtobe — the working day is over
const EVENING = new Date("2026-11-24T14:30:00Z");

describe("the phone's «Когда сдать?» (D-187)", () => {
  it("offers four instants ahead of now, today's evening only while an hour is left", () => {
    expect(sheetPresets(MORNING).map((p) => p.label)).toEqual(["Сегодня 18:00", "Завтра 9:00", "Завтра 13:00", "В пятницу 18:00"]);
    const evening = sheetPresets(EVENING);
    expect(evening.map((p) => p.label)).toEqual(["Завтра 9:00", "Завтра 13:00", "В пятницу 18:00", "Через неделю"]);
    // nothing in the past, ever: «Сегодня 18:00» at 19:30 set a deadline that was already late
    for (const preset of evening) expect(isAhead(preset.iso, EVENING)).toBe(true);
    expect(evening.some((p) => p.iso === null)).toBe(false);
  });

  it("moves a deadline by an hour, a day, a week — the minute kept", () => {
    const shifts = deadlineShifts("2026-11-25T02:35:00+00:00", MORNING); // tomorrow 07:35 Aqtobe
    expect(shifts.map((s) => s.label)).toEqual(["+1 час", "+1 день", "+неделя"]);
    expect(shifts[1]).toEqual({ label: "+1 день", iso: "2026-11-26T07:35:00+05:00", result: "чт 07:35" });
    expect(shifts[0]!.iso).toBe("2026-11-25T08:35:00+05:00");
  });

  it("leaves out a step that still lands in the past, and has none without a deadline", () => {
    // three days behind: a day later is still behind, a week later is ahead
    const late = deadlineShifts("2026-11-21T13:00:00+00:00", MORNING);
    expect(late.map((s) => s.label)).toEqual(["+неделя"]);
    expect(deadlineShifts(null, MORNING)).toEqual([]);
  });

  it("knows one instant written with two offsets", () => {
    expect(sameInstant("2026-11-25T02:35:00+00:00", "2026-11-25T07:35:00+05:00")).toBe(true);
    expect(sameInstant(null, null)).toBe(true);
    expect(sameInstant(null, "2026-11-25T07:35:00+05:00")).toBe(false);
  });
});
