import { describe, expect, it } from "vitest";

import { cellTitle, isBirthday, LATER_DAYS, laterDays, monthGrid, monthGridFrom, PER_CELL, PER_LATER_DAY, TODAY_ROWS, todayPlan } from "./calendar";
import type { TvCalendarEvent } from "./queries";

// пятница, 25 сентября 2026, 14:00 по Актобе
const NOW = new Date("2026-09-25T09:00:00Z");

function event(patch: Partial<TvCalendarEvent> & Pick<TvCalendarEvent, "id" | "starts_at">): TvCalendarEvent {
  return { title: "Планёрка", ends_at: null, location: null, everyone: false, people: 0, going: 0, ...patch };
}

const cal = (events: TvCalendarEvent[]) => ({ from: NOW.toISOString(), days: 7, events });

describe("todayPlan — табло дня", () => {
  const morning = event({ id: "morning", starts_at: "2026-09-25T04:00:00Z", ends_at: "2026-09-25T04:30:00Z" }); // 09:00–09:30
  const running = event({ id: "running", starts_at: "2026-09-25T08:30:00Z", ends_at: "2026-09-25T09:30:00Z", people: 3 }); // 13:30–14:30
  const later = event({ id: "later", title: "Приёмка", starts_at: "2026-09-25T12:30:00Z", location: "Объект", everyone: true }); // 17:30

  it("идущее — «идёт · до …», прошедшее и дальнее — без подписи", () => {
    const plan = todayPlan(cal([morning, running, later]), NOW);
    expect(plan.rows.map((r) => [r.id, r.state, r.note])).toEqual([
      ["morning", "past", ""],
      ["running", "now", "идёт · до 14:30"],
      ["later", "later", ""],
    ]);
    expect(plan.rows[2]).toMatchObject({ place: "Объект", people: "все", time: "17:30" });
    expect(plan.rows[1].people).toBe("3 чел.");
    expect(plan.date).toBe("Пятница, 25 сентября");
    expect(plan.total).toBe(3);
  });

  it("когда ничего не идёт, ближайшее говорит, через сколько", () => {
    const plan = todayPlan(cal([morning, later]), NOW);
    expect(plan.rows.find((r) => r.id === "later")?.note).toBe("через 3 ч 30 мин");
  });

  it(`не больше ${TODAY_ROWS} строк; из прошедших — одно последнее, пока впереди что-то есть`, () => {
    const pasts = Array.from({ length: 3 }, (_, i) => event({ id: `p${i}`, starts_at: `2026-09-25T0${i + 1}:00:00Z` }));
    const futures = Array.from({ length: 3 }, (_, i) => event({ id: `f${i}`, starts_at: `2026-09-25T1${i}:00:00Z` }));
    expect(todayPlan(cal([...pasts, ...futures]), NOW).rows.map((r) => r.id)).toEqual(["p2", "f0", "f1", "f2"]);
    const many = Array.from({ length: 6 }, (_, i) => event({ id: `m${i}`, starts_at: `2026-09-25T1${i}:00:00Z` }));
    expect(todayPlan(cal([...pasts, ...many]), NOW).rows.map((r) => r.id)).toEqual(["m0", "m1", "m2", "m3", "m4"]);
  });

  it("день кончился — последние прошедшие, тускло", () => {
    const pasts = Array.from({ length: 7 }, (_, i) => event({ id: `p${i}`, starts_at: `2026-09-25T0${i + 1}:00:00Z`, ends_at: `2026-09-25T0${i + 1}:30:00Z` }));
    const plan = todayPlan(cal(pasts), new Date("2026-09-25T15:00:00Z"));
    expect(plan.rows.map((r) => r.id)).toEqual(["p2", "p3", "p4", "p5", "p6"]);
    expect(plan.rows.every((r) => r.state === "past")).toBe(true);
  });

  it("шкала — рабочие часы с подписью через два, «сейчас» на своём месте, отрезки мероприятий", () => {
    const plan = todayPlan(cal([running]), NOW);
    expect(plan.track.from).toBe(8);
    expect(plan.track.to).toBe(20);
    expect(plan.track.labels).toEqual([8, 10, 12, 14, 16, 18, 20]);
    expect(plan.track.now).toBeCloseTo((14 - 8) / 12, 5);
    expect(plan.track.segments[0].start).toBeCloseTo((13.5 - 8) / 12, 5);
    expect(plan.track.segments[0].state).toBe("now");
  });

  it("шкала раздвигается под вечернее мероприятие", () => {
    const plan = todayPlan(cal([event({ id: "night", starts_at: "2026-09-25T16:00:00Z" })]), NOW); // 21:00
    expect(plan.track.to).toBe(22);
  });

  it("мероприятие ложится в свой день по Актобе, а не по UTC", () => {
    // 20:30 UTC Friday = 01:30 Saturday in Aqtobe
    const late = event({ id: "late", starts_at: "2026-09-25T20:30:00Z" });
    expect(todayPlan(cal([late]), NOW).total).toBe(0);
    expect(laterDays(cal([late]), NOW)[0]).toMatchObject({ label: "Завтра", date: "26 сентября" });
    expect(laterDays(cal([late]), NOW)[0].rows[0].time).toBe("01:30");
  });
});

describe("laterDays — «Дальше»", () => {
  it("только дни, где что-то есть, не больше трёх, по два мероприятия", () => {
    const events = [
      event({ id: "today", starts_at: "2026-09-25T10:00:00Z" }),
      // Saturday is empty, Sunday has three
      ...Array.from({ length: 3 }, (_, i) => event({ id: `sun${i}`, starts_at: `2026-09-27T0${i + 4}:00:00Z` })),
      event({ id: "tue", starts_at: "2026-09-29T05:00:00Z" }),
      event({ id: "wed", starts_at: "2026-09-30T05:00:00Z" }),
      event({ id: "thu", starts_at: "2026-10-01T05:00:00Z" }),
    ];
    const days = laterDays(cal(events), NOW);
    expect(days).toHaveLength(LATER_DAYS);
    expect(days.map((d) => d.label)).toEqual(["Воскресенье", "Вторник", "Среда"]);
    expect(days[0].rows).toHaveLength(PER_LATER_DAY);
    expect(days[0].more).toBe(1);
    expect(days[0].date).toBe("27 сентября");
  });

  it("пусто впереди — пусто", () => {
    expect(laterDays(cal([event({ id: "today", starts_at: "2026-09-25T10:00:00Z" })]), NOW)).toEqual([]);
    expect(laterDays(null, NOW)).toEqual([]);
  });
});

describe("isBirthday", () => {
  it("день рождения — праздник, планёрка — нет", () => {
    expect(isBirthday("День рождения Асель")).toBe(true);
    expect(isBirthday("Поздравляем с днём рождения Марата")).toBe(true);
    expect(isBirthday("ДР Марата")).toBe(true);
    expect(isBirthday("Планёрка")).toBe(false);
    expect(isBirthday("Дренаж на объекте")).toBe(false);
    expect(isBirthday(null)).toBe(false);
  });

  it("в клетке месяца — «ДР» и имя, остальное как есть", () => {
    expect(cellTitle({ title: "День рождения Асель", birthday: true, named: true })).toBe("ДР Асель");
    expect(cellTitle({ title: "ДР Марата", birthday: true, named: true })).toBe("ДР Марата");
    expect(cellTitle({ title: "День рождения", birthday: true, named: true })).toBe("День рождения");
    expect(cellTitle({ title: "Планёрка", birthday: false, named: true })).toBe("Планёрка");
    expect(cellTitle({ title: "Мероприятие", birthday: false, named: false })).toBe("");
  });
});

describe("monthGrid — месяц сеткой", () => {
  it("сентябрь 2026 — пять недель с понедельника 31 августа", () => {
    const grid = monthGrid(cal([]), NOW);
    expect([grid.month, grid.year]).toEqual(["Сентябрь", 2026]);
    expect(grid.weekdays[0]).toBe("Пн");
    expect(grid.weeks).toHaveLength(5);
    expect(grid.weeks[0].days[0]).toMatchObject({ day: 31, inMonth: false });
    expect(grid.weeks[0].days[1]).toMatchObject({ day: 1, inMonth: true });
    expect(grid.weeks[4].days[6]).toMatchObject({ day: 4, inMonth: false });
    expect(monthGridFrom(NOW)).toBe("2026-08-31");
  });

  it("сегодня отмечено, прошедшие дни — прошлым, выходные — выходными; прошедшие недели складываются", () => {
    const grid = monthGrid(cal([]), NOW);
    const cells = grid.weeks.flatMap((w) => w.days);
    expect(cells.find((c) => c.today)?.day).toBe(25);
    expect(cells.find((c) => c.day === 24 && c.inMonth)?.past).toBe(true);
    expect(cells.find((c) => c.day === 26 && c.inMonth)?.weekend).toBe(true);
    // 31 Aug – 6, 7–13, 14–20 are past; the week from the 21st is the current one
    expect(grid.weeks.map((w) => w.past)).toEqual([true, true, true, false, false]);
  });

  it(`в клетке ${PER_CELL} мероприятия, дальше «+N»; в соседнем месяце — пусто`, () => {
    const grid = monthGrid(
      cal([
        ...Array.from({ length: PER_CELL + 1 }, (_, i) => event({ id: `d${i}`, starts_at: `2026-09-28T0${i + 4}:00:00Z` })),
        event({ id: "tail", starts_at: "2026-10-02T05:00:00Z" }),
        event({ id: "bd", title: "День рождения Асель", starts_at: "2026-09-29T12:00:00Z" }),
      ]),
      NOW,
    );
    const cells = grid.weeks.flatMap((w) => w.days);
    const monday = cells.find((c) => c.day === 28 && c.inMonth);
    expect(monday?.rows).toHaveLength(PER_CELL);
    expect(monday?.more).toBe(1);
    expect(cells.find((c) => c.day === 2 && !c.inMonth)?.rows).toHaveLength(0);
    expect(cells.find((c) => c.day === 29 && c.inMonth)?.rows[0]).toMatchObject({ birthday: true, time: "17:00" });
  });

  it("в сегодняшней клетке сначала то, что впереди", () => {
    const grid = monthGrid(
      cal([
        event({ id: "morning", starts_at: "2026-09-25T04:00:00Z" }), // 09:00, past
        event({ id: "evening", starts_at: "2026-09-25T12:30:00Z" }), // 17:30
      ]),
      NOW,
    );
    const today = grid.weeks.flatMap((w) => w.days).find((c) => c.today);
    expect(today?.rows.map((r) => r.id)).toEqual(["evening", "morning"]);
  });

  it("месяц, начатый в воскресенье, растягивается на шесть недель", () => {
    // 1 ноября 2026 — воскресенье
    const grid = monthGrid(cal([]), new Date("2026-11-10T06:00:00Z"));
    expect(grid.month).toBe("Ноябрь");
    expect(grid.weeks).toHaveLength(6);
    expect(grid.weeks[0].days[6]).toMatchObject({ day: 1, inMonth: true });
    // 10 November is a Tuesday: the weeks up to the 8th are past
    expect(grid.weeks.map((w) => w.past)).toEqual([true, true, false, false, false, false]);
  });
});
