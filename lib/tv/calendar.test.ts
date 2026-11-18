import { describe, expect, it } from "vitest";

import {
  monthGrid,
  monthGridFrom,
  MONTH_DAYS,
  MONTH_WEEKS,
  monthSummary,
  PER_CELL,
  PER_DAY,
  TODAY_CARDS,
  todayPlan,
  todaySummary,
  weekColumns,
  weekStrip,
  weekSummary,
} from "./calendar";
import type { TvCalendarEvent } from "./queries";

// пятница, 25 сентября 2026, 14:00 по Актобе
const NOW = new Date("2026-09-25T09:00:00Z");

function event(patch: Partial<TvCalendarEvent> & Pick<TvCalendarEvent, "id" | "starts_at">): TvCalendarEvent {
  return { title: "Планёрка", ends_at: null, location: null, everyone: false, people: 0, going: 0, ...patch };
}

const cal = (events: TvCalendarEvent[]) => ({ from: NOW.toISOString(), days: 7, events });

describe("weekColumns", () => {
  it("семь колонок с сегодня: «Сегодня», «Завтра», дальше дни недели", () => {
    const columns = weekColumns(cal([]), NOW);
    expect(columns.map((c) => c.label)).toEqual(["Сегодня", "Завтра", "Вс", "Пн", "Вт", "Ср", "Чт"]);
    expect(columns[0].date).toBe("25 сен");
    expect(columns[1].weekend).toBe(true);
    expect(columns[3].weekend).toBe(false);
  });

  it("под «Сегодня» — шесть дней с завтрашнего", () => {
    const columns = weekColumns(cal([]), NOW, 6, 1);
    expect(columns.map((c) => c.label)).toEqual(["Завтра", "Вс", "Пн", "Вт", "Ср", "Чт"]);
    expect(columns.some((c) => c.today)).toBe(false);
  });

  it("мероприятие ложится в свой день по Актобе, а не по UTC", () => {
    // 20:30 UTC пятницы = 01:30 субботы по Актобе
    const columns = weekColumns(cal([event({ id: "late", starts_at: "2026-09-25T20:30:00Z" })]), NOW);
    expect(columns[0].rows).toHaveLength(0);
    expect(columns[1].rows[0]?.time).toBe("01:30");
  });

  it("лишнее в дне — «+N»", () => {
    const events = Array.from({ length: PER_DAY + 2 }, (_, i) => event({ id: `e${i}`, starts_at: `2026-09-26T0${i + 1}:00:00Z` }));
    const saturday = weekColumns(cal(events), NOW)[1];
    expect(saturday.rows).toHaveLength(PER_DAY);
    expect(saturday.more).toBe(2);
    expect(weekSummary(weekColumns(cal(events), NOW))).toBe("3 мероприятия");
    expect(weekSummary(weekColumns(cal([]), NOW))).toBe("Свободно");
  });
});

describe("weekStrip — пустые дни одной строкой (D-182)", () => {
  const days = (events: TvCalendarEvent[]) => weekStrip(weekColumns(cal(events), NOW, 6, 1));

  it("плитки — только у дней со встречами, пустые подряд складываются в «Пн–Ср»", () => {
    // завтра (сб) и чт заняты; вс … ср свободны
    const strip = days([
      event({ id: "sat", starts_at: "2026-09-26T05:00:00Z" }),
      event({ id: "thu", starts_at: "2026-10-01T05:00:00Z" }),
    ]);
    expect(strip.busy.map((c) => c.label)).toEqual(["Завтра", "Чт"]);
    expect(strip.free).toBe("Вс–Ср свободно");
  });

  it("несколько пустых отрезков — через запятую; одиночный день — сам по себе", () => {
    const strip = days([event({ id: "mon", starts_at: "2026-09-28T05:00:00Z" }), event({ id: "wed", starts_at: "2026-09-30T05:00:00Z" })]);
    expect(strip.free).toBe("Завтра–Вс, Вт, Чт свободно");
  });

  it("вся неделя свободна — одна фраза; занято всё — без строки", () => {
    expect(days([])).toEqual({ busy: [], free: "Дальше на неделе свободно" });
    const full = Array.from({ length: 6 }, (_, i) => event({ id: `f${i}`, starts_at: new Date(Date.parse("2026-09-26T05:00:00Z") + i * 86_400_000).toISOString() }));
    expect(days(full).free).toBeNull();
  });
});

describe("todayPlan — «Сегодня» крупно", () => {
  const morning = event({ id: "morning", starts_at: "2026-09-25T04:00:00Z", ends_at: "2026-09-25T04:30:00Z" }); // 09:00–09:30
  const running = event({ id: "running", starts_at: "2026-09-25T08:30:00Z", ends_at: "2026-09-25T09:30:00Z", people: 3 }); // 13:30–14:30
  const later = event({ id: "later", title: "Приёмка", starts_at: "2026-09-25T12:30:00Z", location: "Объект", everyone: true }); // 17:30

  it("идущее — с прогрессом и концом, прошедшее — «прошло», дальнее — без подписи", () => {
    const plan = todayPlan(cal([morning, running, later]), NOW);
    expect(plan.cards.map((c) => [c.id, c.state, c.note])).toEqual([
      ["morning", "past", "прошло"],
      ["running", "now", "идёт · до 14:30"],
      ["later", "later", ""],
    ]);
    expect(plan.cards[1].progress).toBeCloseTo(0.5, 5);
    expect(plan.cards[2].place).toBe("Объект");
    expect(plan.cards[2].people).toBe("все");
    expect(plan.date).toBe("Пятница, 25 сентября");
    expect(todaySummary(plan)).toBe("3 мероприятия");
  });

  it("когда ничего не идёт, ближайшее говорит, через сколько", () => {
    const plan = todayPlan(cal([morning, later]), NOW);
    expect(plan.cards.find((c) => c.id === "later")?.note).toBe("через 3 ч 30 мин");
  });

  it("в ряд — четыре; прошедшие уступают место будущим", () => {
    const pasts = Array.from({ length: 3 }, (_, i) => event({ id: `p${i}`, starts_at: `2026-09-25T0${i + 1}:00:00Z` }));
    const futures = Array.from({ length: 3 }, (_, i) => event({ id: `f${i}`, starts_at: `2026-09-25T1${i}:00:00Z` }));
    const plan = todayPlan(cal([...pasts, ...futures]), NOW);
    expect(plan.cards).toHaveLength(TODAY_CARDS);
    expect(plan.cards.map((c) => c.id)).toEqual(["p2", "f0", "f1", "f2"]);
    expect(plan.earlier).toBe(2);
  });

  it("лента дня — рабочие часы, «сейчас» на своём месте, отрезки мероприятий", () => {
    const plan = todayPlan(cal([running]), NOW);
    expect(plan.track.from).toBe(8);
    expect(plan.track.to).toBe(20);
    expect(plan.track.now).toBeCloseTo((14 - 8) / 12, 5);
    expect(plan.track.segments[0].start).toBeCloseTo((13.5 - 8) / 12, 5);
    expect(plan.track.segments[0].state).toBe("now");
  });

  it("лента раздвигается под вечернее мероприятие", () => {
    const plan = todayPlan(cal([event({ id: "night", starts_at: "2026-09-25T16:00:00Z" })]), NOW); // 21:00
    expect(plan.track.to).toBe(22);
  });

  it("сегодня пусто — говорит, что ближайшее впереди", () => {
    const plan = todayPlan(cal([event({ id: "fri", title: "Выезд", starts_at: "2026-09-27T05:00:00Z" })]), NOW);
    expect(plan.total).toBe(0);
    expect(plan.ahead).toBe("Вс, 10:00 · Выезд");
    expect(todaySummary(plan)).toBe("Сегодня свободно");
  });
});

describe("monthGrid — месяц сеткой", () => {
  it("четыре недели от текущей: первый ряд — эта неделя, а не прошлый месяц (D-182)", () => {
    const grid = monthGrid(cal([]), NOW);
    expect(grid.title).toBe("Сентябрь — октябрь 2026");
    expect(grid.weekdays[0]).toBe("Пн");
    expect(grid.weeks).toHaveLength(MONTH_WEEKS);
    expect(grid.weeks[0][0]).toMatchObject({ day: 21, inMonth: true, past: true });
    expect(grid.weeks[0][4]).toMatchObject({ day: 25, today: true });
    expect(grid.weeks[1][3]).toMatchObject({ day: 1, dayLabel: "1 окт", inMonth: false });
    expect(grid.weeks[3][6]).toMatchObject({ day: 18 });
    expect(monthGridFrom(NOW)).toBe("2026-09-21");
    expect(MONTH_DAYS).toBe(28);
  });

  it("сегодня отмечено, прошедшие дни — прошлым, выходные — выходными", () => {
    const cells = monthGrid(cal([]), NOW).weeks.flat();
    const today = cells.find((c) => c.today);
    expect(today?.day).toBe(25);
    expect(cells.find((c) => c.day === 24 && c.inMonth)?.past).toBe(true);
    expect(cells.find((c) => c.day === 26 && c.inMonth)?.weekend).toBe(true);
  });

  it("в клетке одна встреча крупно, дальше «+N»; в подпись — от сегодня", () => {
    const grid = monthGrid(
      cal([
        ...Array.from({ length: PER_CELL + 1 }, (_, i) => event({ id: `d${i}`, starts_at: `2026-09-28T0${i + 4}:00:00Z` })),
        event({ id: "tail", starts_at: "2026-10-02T05:00:00Z" }),
        event({ id: "past", starts_at: "2026-09-22T05:00:00Z" }),
      ]),
      NOW,
    );
    const monday = grid.weeks.flat().find((c) => c.day === 28 && c.inMonth);
    expect(monday?.rows).toHaveLength(PER_CELL);
    expect(monday?.more).toBe(1);
    expect(grid.weeks.flat().find((c) => c.day === 2 && !c.inMonth)?.rows).toHaveLength(1);
    expect(monthSummary(grid)).toBe("3 мероприятия");
    expect(PER_CELL).toBe(1);
  });

  it("через год — оба года в заголовке; внутри месяца — один месяц", () => {
    expect(monthGrid(cal([]), new Date("2026-12-21T06:00:00Z")).title).toBe("Декабрь 2026 — январь 2027");
    // 1 февраля 2027 — понедельник: четыре недели целиком в феврале
    expect(monthGrid(cal([]), new Date("2027-02-01T06:00:00Z")).title).toBe("Февраль 2027");
  });
});
