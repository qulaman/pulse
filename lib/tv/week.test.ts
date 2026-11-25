import { describe, expect, it } from "vitest";

import { weekBars } from "./week";

const week = (counts: number[], last = "2026-11-25") =>
  counts.map((done, i) => ({ day: new Date(Date.parse(`${last}T12:00:00+05:00`) - (counts.length - 1 - i) * 86_400_000).toISOString().slice(0, 10), done }));

describe("weekBars — неделя столбиками на «Сегодня»", () => {
  it("семь дней, сегодня последним и обведён, подписи — дни недели по Актобе", () => {
    const bars = weekBars(week([0, 0, 1, 0, 0, 1, 0]));
    expect(bars).toHaveLength(7);
    expect(bars.map((bar) => bar.label)).toEqual(["чт", "пт", "сб", "вс", "пн", "вт", "ср"]);
    expect(bars.map((bar) => bar.today)).toEqual([false, false, false, false, false, false, true]);
  });

  it("высота — доля самого высокого столбика; пустой день — без столбика", () => {
    const bars = weekBars(week([2, 4, 0, 1, 0, 0, 3]));
    expect(bars.map((bar) => bar.share)).toEqual([0.5, 1, 0, 0.25, 0, 0, 0.75]);
    expect(bars.map((bar) => bar.done)).toEqual([2, 4, 0, 1, 0, 0, 3]);
  });

  it("пустая неделя — семь оснований без столбиков; без данных — ничего", () => {
    const bars = weekBars(week([0, 0, 0, 0, 0, 0, 0]));
    expect(bars).toHaveLength(7);
    expect(bars.every((bar) => bar.share === 0)).toBe(true);
    expect(weekBars([])).toEqual([]);
    expect(weekBars(undefined)).toEqual([]);
  });

  it("база с неполной неделей — недостающие дни пустыми перед первым известным", () => {
    const bars = weekBars([{ day: "2026-11-25", done: 2 }]);
    expect(bars).toHaveLength(7);
    expect(bars[6]).toMatchObject({ key: "2026-11-25", done: 2, share: 1, today: true });
    expect(bars.slice(0, 6).every((bar) => bar.done === 0)).toBe(true);
  });
});
