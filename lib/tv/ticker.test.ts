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
};

describe("tickerItems", () => {
  it("день, вердикт, события, топ и неделя — в одной ленте", () => {
    const items = tickerItems([line("task_accepted")], SUMMARY);
    const ids = items.map((item) => item.id);
    expect(ids[0]).toBe("today");
    expect(ids[1]).toBe("verdict");
    expect(ids.some((id) => id.startsWith("event:"))).toBe(true);
    expect(ids).toContain("rating");
    expect(ids).toContain("week");
  });

  it("событие едет со временем и в настоящем времени", () => {
    const items = tickerItems([line("task_accepted")], SUMMARY);
    const event = items.find((item) => item.id.startsWith("event:"))!;
    expect(event.text).toBe("14:32 · Марат Оспанов берёт в работу");
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

  it("без сводки строка всё равно едет — на одних событиях", () => {
    const items = tickerItems([line("task_done")], undefined);
    expect(items).toHaveLength(1);
    expect(items[0]!.text).toContain("Марат Оспанов — принято");
  });
});
