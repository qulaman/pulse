import { describe, expect, it } from "vitest";

import { tvWeekday } from "./clock";
import { lineOf, type TvEvent } from "./feed";
import type { TvSummary } from "./queries";
import { tickerItems } from "./ticker";
import { PHRASE_MAX } from "./voice";

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

/** Everything the band would print, joined: what a passer-by could read off the wall. */
function printed(items: readonly { lead: string | null; text: string }[]): string {
  return items.map((item) => `${item.lead ?? ""} ${item.text}`).join(" | ");
}

describe("tickerItems", () => {
  it("события, топ и неделя — в одной ленте; ни чисел дня, ни вердикта «Входящего» (D-45, D-185)", () => {
    const items = tickerItems([line("task_accepted")], { ...SUMMARY, counts: { overdue: 2, declined: 1, review: 3, questions: 1 } });
    const ids = items.map((item) => item.id);
    expect(ids[0]!.startsWith("event:")).toBe(true);
    expect(ids).not.toContain("today");
    expect(ids).not.toContain("verdict");
    expect(items.map((item) => item.lead)).not.toContain("Сегодня");
    expect(printed(items)).not.toMatch(/просроч|отказ|приёмк|вопрос|доработ|в срок/i);
    expect(ids).toContain("rating");
    expect(ids).toContain("week");
  });

  it("событие едет со временем и коротко: имя, двоеточие, стадия", () => {
    const items = tickerItems([line("task_accepted")], SUMMARY);
    const event = items.find((item) => item.id.startsWith("event:"))!;
    expect(event.lead).toBe("14:32");
    expect(event.text).toBe("Марат Оспанов: в работе");
  });

  it("числа дня в ленту не едут — они крупно на «Сегодня»", () => {
    for (const today of [
      { sent: 1, done: 0, in_work: 0 },
      { sent: 5, done: 7, in_work: 3 },
    ]) {
      const items = tickerItems([], { ...SUMMARY, today });
      expect(items.map((item) => item.id)).not.toContain("today");
      expect(printed(items)).not.toMatch(/поручени|в работе/);
    }
  });

  it("без очков в ленте нет ни топа, ни наград (гейт адаптации, D-40)", () => {
    const items = tickerItems([], { ...SUMMARY, points_enabled: false });
    expect(items.map((item) => item.id)).not.toContain("rating");
    expect(items.map((item) => item.id)).not.toContain("merch");
  });

  it("пустой день и пустая неделя не пишут нулей", () => {
    const items = tickerItems([], { ...SUMMARY, today: { sent: 0, done: 0, in_work: 0 }, week: [{ day: "2026-09-17", done: 0 }] });
    expect(items.map((item) => item.id)).not.toContain("today");
    expect(items.map((item) => item.id)).not.toContain("week");
    expect(printed(items)).not.toMatch(/\b0\b/);
  });

  it("без сводки строка всё равно едет — на одних событиях", () => {
    const items = tickerItems([line("task_done")], undefined);
    expect(items).toHaveLength(1);
    expect(items[0]!.text).toBe("Марат Оспанов: Акт");
  });

  it("топ недели — только имена, три полных имени в окно ленты не влезают", () => {
    const rating = [
      { name: "Айгерим Сапарова", points: 420, rank: 1 },
      { name: "Марат Оспанов", points: 340, rank: 2 },
      { name: "Динара Касымова", points: 300, rank: 3 },
      { name: "Ерлан Беков", points: 120, rank: 4 },
    ];
    const row = tickerItems([], { ...SUMMARY, rating }).find((item) => item.id === "rating");
    expect(row).toEqual({ id: "rating", lead: "Топ недели", text: "Айгерим 420 · Марат 340 · Динара 300", tone: "gold" });
    // a guest: the base sends first names and no points (D-33)
    const guest = tickerItems([], { ...SUMMARY, rating: [{ name: "Айгерим", points: null, rank: 1 }, { name: "Марат", points: null, rank: 2 }] });
    expect(guest.find((item) => item.id === "rating")?.text).toBe("Айгерим · Марат");
  });

  it("неделя — «За неделю» и «готово N дел» по-русски", () => {
    const week = (done: number) => tickerItems([], { ...SUMMARY, week: [{ day: "2026-09-17", done }] }).find((item) => item.id === "week");
    expect(week(48)).toEqual({ id: "week", lead: "За неделю", text: "готово 48 дел", tone: "ok" });
    expect([1, 3, 21].map((n) => week(n)?.text)).toEqual(["готово 1 дело", "готово 3 дела", "готово 21 дело"]);
    // the summary's own days are summed: 2 + 3
    expect(tickerItems([], SUMMARY).find((item) => item.id === "week")?.text).toBe("готово 5 дел");
  });

  it("награда — «имя · название», только если строка влезает целиком", () => {
    expect(tickerItems([], SUMMARY).find((item) => item.id === "merch")).toEqual({
      id: "merch",
      lead: "Награда",
      text: "Марат Оспанов · Худи",
      tone: "gold",
    });
    const room = PHRASE_MAX - "Марат Оспанов · ".length;
    const fits = tickerItems([], { ...SUMMARY, merch: [{ ...SUMMARY.merch[0]!, title: "Я".repeat(room) }] });
    expect(fits.find((item) => item.id === "merch")?.text).toHaveLength(PHRASE_MAX);
    const long = tickerItems([], { ...SUMMARY, merch: [{ ...SUMMARY.merch[0]!, title: "Я".repeat(room + 1) }] });
    expect(long.map((item) => item.id)).not.toContain("merch");
    expect(printed(long)).not.toMatch(/…|\.\.\./);
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

  it("ставит ближайшие встречи первыми: время, название и место — без числа людей", () => {
    const items = tickerItems([line("task_accepted")], { ...SUMMARY, events: [meeting] });
    expect(items[0]!.id).toBe("meeting:e-1");
    const row = items.find((item) => item.id === "meeting:e-1");
    expect(row?.lead).toBe("16:00");
    expect(row?.text).toBe("Планёрка, в офисе");
    expect(row?.tone).toBe("accent");
    expect(row?.text).not.toMatch(/чел|\d/);
  });

  it("место уходит, если строка длиннее 48 знаков; название остаётся", () => {
    const room = PHRASE_MAX - "Планёрка, ".length;
    const fits = tickerItems([], { ...SUMMARY, events: [{ ...meeting, location: "Я".repeat(room) }] });
    expect(fits.find((item) => item.id === "meeting:e-1")?.text).toBe(`Планёрка, ${"Я".repeat(room)}`);
    const long = tickerItems([], { ...SUMMARY, events: [{ ...meeting, location: "Я".repeat(room + 1) }] });
    expect(long.find((item) => item.id === "meeting:e-1")?.text).toBe("Планёрка");
    const nowhere = tickerItems([], { ...SUMMARY, events: [{ ...meeting, location: null }] });
    expect(nowhere.find((item) => item.id === "meeting:e-1")?.text).toBe("Планёрка");
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
    expect(row?.text).toBe("Встреча");
  });

  it("дальше завтрашнего — день недели", () => {
    const starts = "2026-09-19T05:00:00Z"; // Saturday 10:00 in Aqtobe
    const items = tickerItems([], { ...SUMMARY, events: [{ ...meeting, id: "e-3", starts_at: starts }] });
    expect(items.find((item) => item.id === "meeting:e-3")?.lead).toBe(`${tvWeekday(new Date(starts))} 10:00`);
  });

  it("без мероприятий строк не добавляет", () => {
    const items = tickerItems([], SUMMARY);
    expect(items.some((item) => item.id.startsWith("meeting:"))).toBe(false);
  });
});
