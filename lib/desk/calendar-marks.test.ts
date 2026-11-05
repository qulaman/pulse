import { describe, expect, it } from "vitest";

import { fitMarks } from "@/components/desk/calendar/week";

// the week's sizes: a mark 34 px tall with a gap of 2, «+N» 20 px, twelve hours of 48 px
const STEP = 36;
const MARK = 34;
const MORE = 20;
const HEIGHT = 576;

const fit = (wanted: number[], height = HEIGHT) => fitMarks(wanted, STEP, MARK, MORE, height);

describe("fitMarks", () => {
  it("leaves marks that fit where the hours put them, with no «+N»", () => {
    expect(fit([100, 200, 300])).toEqual({ tops: [100, 200, 300], shown: 3, moreTop: null });
  });

  it("stacks marks of one hour", () => {
    expect(fit([100, 100, 100])).toEqual({ tops: [100, 136, 172], shown: 3, moreTop: null });
  });

  it("an empty day has nothing to show", () => {
    expect(fit([])).toEqual({ tops: [], shown: 0, moreTop: null });
  });

  it("sends what does not fit behind «+N», under the last mark shown", () => {
    // eight marks at 18:00: 477, 513, 549 fit whole, but «+N» needs its place — the third gives way
    const result = fit([477, 477, 477, 477, 477, 477, 477, 477]);
    expect(result.shown).toBe(2);
    expect(result.moreTop).toBe(549);
    expect(result.moreTop! + MORE).toBeLessThanOrEqual(HEIGHT);
  });

  it("keeps a third mark when «+N» still fits under it", () => {
    const result = fit([440, 440, 440, 440, 440]);
    expect(result.shown).toBe(3);
    expect(result.moreTop).toBe(548);
  });

  it("every mark is either shown or behind «+N»", () => {
    for (const count of [1, 2, 3, 5, 8, 16, 33]) {
      for (const start of [0, 200, 450, 540, 560]) {
        const result = fit(Array.from({ length: count }, () => start));
        if (result.shown < count) expect(result.moreTop).not.toBeNull();
        else expect(result.moreTop).toBeNull();
        for (let index = 0; index < result.shown; index += 1) expect(result.tops[index] + MARK).toBeLessThanOrEqual(HEIGHT);
        if (result.moreTop !== null) expect(result.moreTop + MORE).toBeLessThanOrEqual(HEIGHT);
      }
    }
  });

  it("a single mark at the column's foot stands up rather than turn into «+1»", () => {
    expect(fit([555])).toEqual({ tops: [542], shown: 1, moreTop: null });
  });

  it("the last of several stands up too when there is room above it", () => {
    expect(fit([300, 555])).toEqual({ tops: [300, 542], shown: 2, moreTop: null });
  });

  it("two marks that cannot both stand go behind «+2»", () => {
    const result = fit([555, 555]);
    expect(result.shown).toBe(0);
    expect(result.moreTop).toBe(555);
  });
});
