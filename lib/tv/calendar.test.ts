import { describe, expect, it } from "vitest";

import { PER_DAY, weekColumns, weekSummary } from "./calendar";
import type { TvCalendarEvent } from "./queries";

// пятница, 25 сентября 2026, 14:00 по Актобе
const NOW = new Date("2026-09-25T09:00:00Z");

function event(patch: Partial<TvCalendarEvent> & Pick<TvCalendarEvent, "id" | "starts_at">): TvCalendarEvent {
  return { title: "Планёрка", ends_at: null, location: null, everyone: false, people: 0, going: 0, ...patch };
}

describe("weekColumns", () => {
  it("семь колонок с сегодня: «Сегодня», «Завтра», дальше дни недели", () => {
    const columns = weekColumns({ from: NOW.toISOString(), days: 7, events: [] }, NOW);
    expect(columns).toHaveLength(7);
    expect(columns.map((c) => c.label)).toEqual(["Сегодня", "Завтра", "Вс", "Пн", "Вт", "Ср", "Чт"]);
    expect(columns[0].today).toBe(true);
    expect(columns[0].date).toBe("25 сен");
    // суббота и воскресенье
    expect(columns[1].weekend).toBe(true);
    expect(columns[2].weekend).toBe(true);
    expect(columns[3].weekend).toBe(false);
  });

  it("мероприятие ложится в свой день по Актобе, а не по UTC", () => {
    // 20:30 UTC пятницы = 01:30 субботы по Актобе
    const columns = weekColumns(
      { from: NOW.toISOString(), days: 7, events: [event({ id: "late", starts_at: "2026-09-25T20:30:00Z" })] },
      NOW,
    );
    expect(columns[0].rows).toHaveLength(0);
    expect(columns[1].rows[0]?.time).toBe("01:30");
  });

  it("горит идущее сейчас, прошедшее гаснет, ближайшее — только когда ничего не идёт", () => {
    const events = [
      event({ id: "morning", starts_at: "2026-09-25T04:00:00Z" }), // 09:00, давно прошло
      event({ id: "running", starts_at: "2026-09-25T08:30:00Z", ends_at: "2026-09-25T09:30:00Z" }),
      event({ id: "later", starts_at: "2026-09-25T11:00:00Z" }),
    ];
    const rows = weekColumns({ from: NOW.toISOString(), days: 7, events }, NOW)[0].rows;
    expect(rows.map((r) => r.state)).toEqual(["past", "now", "later"]);
    expect(rows[1].span).toBe("13:30–14:30");

    const quiet = weekColumns({ from: NOW.toISOString(), days: 7, events: [events[0], events[2]] }, NOW)[0].rows;
    expect(quiet.map((r) => r.state)).toEqual(["past", "next"]);
  });

  it("гостю названий нет — «Мероприятие»; люди и место одной строкой", () => {
    const rows = weekColumns(
      {
        from: NOW.toISOString(),
        days: 7,
        events: [
          event({ id: "g", starts_at: "2026-09-25T11:00:00Z", title: null, people: 6 }),
          event({ id: "all", starts_at: "2026-09-25T12:00:00Z", location: "Переговорная", everyone: true, people: 30 }),
        ],
      },
      NOW,
    )[0].rows;
    expect(rows[0].title).toBe("Мероприятие");
    expect(rows[0].detail).toBe("6 чел.");
    expect(rows[1].detail).toBe("Переговорная · все");
  });

  it("больше четырёх в день — «+ ещё N»", () => {
    const events = Array.from({ length: PER_DAY + 2 }, (_, i) =>
      event({ id: `e${i}`, starts_at: `2026-09-26T0${i + 1}:00:00Z` }),
    );
    const saturday = weekColumns({ from: NOW.toISOString(), days: 7, events }, NOW)[1];
    expect(saturday.rows).toHaveLength(PER_DAY);
    expect(saturday.more).toBe(2);
    expect(weekSummary(weekColumns({ from: NOW.toISOString(), days: 7, events }, NOW))).toBe("6 мероприятий на неделе");
  });

  it("пустая неделя так и называется", () => {
    expect(weekSummary(weekColumns(null, NOW))).toBe("На неделе свободно");
  });
});
