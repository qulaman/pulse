import { describe, expect, it } from "vitest";

import { lineOf, type TvEvent } from "./feed";
import type { TvSummary } from "./queries";
import { tickerItems } from "./ticker";

function line(kind: TvEvent["kind"], name = "Марат Оспанов", title: string | null = "Акт", amount: number | null = null) {
  return lineOf(
    {
      id: `${kind}-${name}`,
      kind,
      created_at: "2026-09-17T09:32:00Z",
      payload: { name, title, amount },
      payload_guest: { name: name.split(" ")[0]!, title: null, amount: null },
    },
    false,
  );
}

const SUMMARY: TvSummary = {
  guest: false,
  points_enabled: true,
  now: "2026-09-17T09:32:00Z",
  pulse: [],
  counts: { overdue: 0, declined: 0, review: 0, questions: 0 },
  today: { sent: 4, done: 1, in_work: 3 },
  rating: [{ name: "Марат Оспанов", points: 200, rank: 1 }],
  load: [],
  week: [{ day: "2026-09-16", done: 2 }, { day: "2026-09-17", done: 3 }],
  merch: [{ name: "Марат Оспанов", title: "Худи", at: "2026-09-17T08:00:00Z" }],
  events: [],
};

describe("tickerItems", () => {
  it("день, события, топ и неделя — в одной ленте; вердикта «Входящего» на стене нет (D-45)", () => {
    const items = tickerItems([line("task_accepted")], { ...SUMMARY, counts: { overdue: 2, declined: 1, review: 3, questions: 1 } });
    const ids = items.map((item) => item.id);
    expect(ids[0]).toBe("today");
    expect(ids).not.toContain("verdict");
    expect(items.map((item) => `${item.lead} ${item.text}`).join(" ")).not.toMatch(/просроч|отказ|приёмк|вопрос/);
    expect(ids.some((id) => id.startsWith("event:"))).toBe(true);
    expect(ids).toContain("rating");
    expect(ids).toContain("week");
  });

  it("событие едет со временем и в настоящем времени", () => {
    const items = tickerItems([line("task_accepted")], SUMMARY);
    const event = items.find((item) => item.id.startsWith("event:"))!;
    expect(event.lead).toBe("14:32");
    expect(event.text).toBe("Марат Оспанов берёт в работу");
  });

  it("числа дня склоняются по-русски", () => {
    const one = tickerItems([], { ...SUMMARY, today: { sent: 1, done: 0, in_work: 0 } })[0]!;
    const five = tickerItems([], { ...SUMMARY, today: { sent: 5, done: 0, in_work: 0 } })[0]!;
    expect(one.text).toContain("1 поручение");
    expect(five.text).toContain("5 поручений");
  });

  it("без очков в ленте нет ни топа, ни наград (гейт адаптации, D-40)", () => {
    const items = tickerItems([], { ...SUMMARY, points_enabled: false });
    expect(items.map((item) => item.id)).not.toContain("rating");
    expect(items.map((item) => item.id)).not.toContain("merch");
  });

  it("пустой день не пишет «0 поручений»", () => {
    const items = tickerItems([], { ...SUMMARY, today: { sent: 0, done: 0, in_work: 0 } });
    expect(items.map((item) => item.id)).not.toContain("today");
  });

  it("без сводки строка всё равно едет — на одних событиях", () => {
    const items = tickerItems([line("task_done")], undefined);
    expect(items).toHaveLength(1);
    expect(items[0]!.text).toContain("Марат Оспанов — принято");
  });
});

describe("tickerItems: мероприятия", () => {
  const meeting = {
    id: "e-1",
    title: "Планёрка",
    starts_at: "2026-09-17T11:00:00Z", // 16:00 по Актобе, почти через полтора часа
    location: "в офисе",
    people: 6,
  };

  it("ставит ближайшие встречи после чисел дня, со временем, местом и числом людей", () => {
    const items = tickerItems([], { ...SUMMARY, events: [meeting] });
    const row = items.find((item) => item.id === "meeting:e-1");
    expect(row?.lead).toBe("16:00");
    expect(row?.text).toBe("Планёрка · в офисе · 6 чел.");
    expect(row?.tone).toBe("accent");
  });

  it("за полчаса до начала строка становится жёлтой", () => {
    const items = tickerItems([], {
      ...SUMMARY,
      now: "2026-09-17T10:45:00Z",
      events: [meeting],
    });
    expect(items.find((item) => item.id === "meeting:e-1")?.tone).toBe("warn");
  });

  it("завтрашняя встреча так и называется, а гость не видит названия", () => {
    const items = tickerItems([], {
      ...SUMMARY,
      events: [{ ...meeting, id: "e-2", starts_at: "2026-09-18T05:00:00Z", title: null, location: null }],
    });
    const row = items.find((item) => item.id === "meeting:e-2");
    expect(row?.lead).toBe("Завтра 10:00");
    expect(row?.text).toBe("Мероприятие · 6 чел.");
  });

  it("без мероприятий строк не добавляет", () => {
    const items = tickerItems([], SUMMARY);
    expect(items.some((item) => item.id.startsWith("meeting:"))).toBe(false);
  });
});
