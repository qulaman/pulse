import { describe, expect, it } from "vitest";

import { DEFAULT_CONVENTIONS, TIME_PARTS, type Convention } from "./conventions";
import { resolveTimeRef, type TimeRef } from "./timeref";

// Thursday 13.08.2026 on the Aqtobe clock — the corpus' own mornings and afternoons.
const THU_MORNING = new Date("2026-08-13T10:00:00+05:00");
const THU_AFTERNOON = new Date("2026-08-13T16:32:00+05:00");

function ref(said: Partial<TimeRef>): TimeRef {
  return { text: "слова", day: null, weekday: null, date: null, time: null, part: null, confidence: 0.95, ...said };
}

const at = (said: Partial<TimeRef>, now = THU_MORNING, owner: "task" | "event" | "reminder" = "task", conventions: Convention[] = DEFAULT_CONVENTIONS) =>
  resolveTimeRef(ref(said), now, conventions, owner);

describe("resolveTimeRef: the four date failures of the base run", () => {
  it("a-003 «к пятнице» on Thursday — Friday 09:00, the weekday row", () => {
    expect(at({ day: "weekday", weekday: 5 })).toEqual({ iso: "2026-08-14T09:00:00+05:00", confidence: 0.6, source_text: "слова" });
  });

  it("a-007 «сегодня до шести» — an hour 1–7 with no part is the afternoon", () => {
    expect(at({ day: "today", time: "06:00" })?.iso).toBe("2026-08-13T18:00:00+05:00");
    expect(at({ day: "today", time: "6" })?.iso).toBe("2026-08-13T18:00:00+05:00");
  });

  it("a-015 «до девяти утра» said at 10:00 — the next nine, tomorrow", () => {
    expect(at({ time: "09:00", part: "morning" })?.iso).toBe("2026-08-14T09:00:00+05:00");
    expect(at({ time: "09:00" })?.iso).toBe("2026-08-14T09:00:00+05:00");
  });

  it("fs-05 «на неделе» on Thursday afternoon — Friday 18:00 at 0.5", () => {
    expect(at({ part: "this_week" }, THU_AFTERNOON)).toMatchObject({ iso: "2026-08-14T18:00:00+05:00", confidence: 0.5 });
  });
});

describe("resolveTimeRef: every convention", () => {
  it.each(TIME_PARTS.map((part) => [part]))("%s takes its row's time, day and confidence", (part) => {
    const row = DEFAULT_CONVENTIONS.find((r) => r.key === part)!;
    // tomorrow is Friday, so the week's rows and the day's rows meet on the 14th
    expect(at({ day: "tomorrow", part })).toEqual({
      iso: `2026-08-14T${row.time}:00+05:00`,
      confidence: Math.min(0.95, row.confidence),
      source_text: "слова",
    });
  });

  it("the week's rows land on Friday whatever day was named", () => {
    expect(at({ day: "after_tomorrow", part: "end_of_week" })?.iso).toBe("2026-08-14T18:00:00+05:00");
    // on Saturday the nearest Friday is the next one
    expect(at({ part: "end_of_week" }, new Date("2026-08-15T11:00:00+05:00"))?.iso).toBe("2026-08-21T18:00:00+05:00");
  });

  it("a day without a time — day_default; a weekday without a time — weekday_default", () => {
    expect(at({ day: "tomorrow" })).toMatchObject({ iso: "2026-08-14T18:00:00+05:00", confidence: 0.5 });
    expect(at({ day: "weekday", weekday: 1 })).toMatchObject({ iso: "2026-08-17T09:00:00+05:00", confidence: 0.6 });
    expect(at({ day: "date", date: "2026-08-25" })).toMatchObject({ iso: "2026-08-25T18:00:00+05:00", confidence: 0.5 });
  });

  it("a company's own row wins over the default", () => {
    const own = DEFAULT_CONVENTIONS.map((row) => (row.key === "evening" ? { ...row, time: "19:30", confidence: 0.9 } : row));
    expect(at({ day: "today", part: "evening" }, THU_MORNING, "task", own)).toMatchObject({ iso: "2026-08-13T19:30:00+05:00", confidence: 0.9 });
  });

  it("an afternoon part moves a morning hour: «в шесть вечера» said as 06:00", () => {
    expect(at({ day: "today", time: "06:00", part: "evening" })?.iso).toBe("2026-08-13T18:00:00+05:00");
    expect(at({ day: "tomorrow", time: "07:30", part: "morning" })?.iso).toBe("2026-08-14T07:30:00+05:00");
  });
});

describe("resolveTimeRef: the «time has passed» boundary", () => {
  it("today's weekday counts while its moment is ahead", () => {
    expect(at({ day: "weekday", weekday: 4, time: "15:00" })?.iso).toBe("2026-08-13T15:00:00+05:00");
    // «к четвергу» on Thursday at 10:00: 09:00 has passed — next Thursday (eval a-008)
    expect(at({ day: "weekday", weekday: 4 })?.iso).toBe("2026-08-20T09:00:00+05:00");
  });

  it("a time with no day: still ahead — today; exactly now or behind — tomorrow", () => {
    expect(at({ time: "10:30" })?.iso).toBe("2026-08-13T10:30:00+05:00");
    expect(at({ time: "10:00" })?.iso).toBe("2026-08-14T10:00:00+05:00");
    expect(at({ part: "morning" }, new Date("2026-08-13T11:32:00+05:00"))?.iso).toBe("2026-08-14T09:00:00+05:00");
  });
});

describe("resolveTimeRef: a meeting named without a time (D-78)", () => {
  it("09:00 of that day at 0.5", () => {
    expect(at({ day: "weekday", weekday: 5 }, THU_MORNING, "event")).toMatchObject({ iso: "2026-08-14T09:00:00+05:00", confidence: 0.5 });
    expect(at({ day: "tomorrow" }, THU_MORNING, "event")).toMatchObject({ iso: "2026-08-14T09:00:00+05:00", confidence: 0.5 });
  });

  it("with a time or a part it is resolved like any other", () => {
    expect(at({ day: "tomorrow", time: "10:00" }, THU_MORNING, "event")).toMatchObject({ iso: "2026-08-14T10:00:00+05:00", confidence: 0.95 });
    expect(at({ day: "tomorrow", part: "morning" }, THU_MORNING, "event")).toMatchObject({ confidence: 0.7 });
  });
});

describe("resolveTimeRef: a moment in the past", () => {
  it("is kept, but never above 0.7 — the director sees a yellow chip", () => {
    expect(at({ day: "today", time: "15:00" }, THU_AFTERNOON)).toMatchObject({ iso: "2026-08-13T15:00:00+05:00", confidence: 0.7 });
    expect(at({ day: "date", date: "2026-08-01", time: "12:00" })).toMatchObject({ confidence: 0.7 });
  });
});

describe("resolveTimeRef: what it refuses", () => {
  it("nothing named, no reference, an impossible date", () => {
    expect(resolveTimeRef(null, THU_MORNING, DEFAULT_CONVENTIONS, "task")).toBeNull();
    expect(at({})).toBeNull();
    expect(at({ day: "date", date: "2026-02-31" })).toBeNull();
    expect(at({ day: "date", date: "завтра" })).toBeNull();
  });

  it("keeps a phonetic reconstruction's own low confidence and the words heard", () => {
    expect(at({ day: "weekday", weekday: 5, time: "10:00", confidence: 0.4, text: " в песне сводчатся " })).toEqual({
      iso: "2026-08-14T10:00:00+05:00",
      confidence: 0.4,
      source_text: "в песне сводчатся",
    });
    expect(at({ day: "tomorrow", text: "  " })?.source_text).toBeNull();
  });
});
