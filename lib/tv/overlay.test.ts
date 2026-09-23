import { describe, expect, it } from "vitest";

import { EVENT_SOON_MIN, INVITED_MS, overlayOf, waited } from "./overlay";
import type { TvEventRow, TvOverlay } from "./queries";

const NOW = new Date("2026-09-25T09:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const minutesAhead = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString();

function visit(patch: Partial<NonNullable<TvOverlay["visit"]>> = {}): TvOverlay {
  return {
    visit: { id: "v1", status: "waiting", note: "Иванов, по поставкам", created_at: minutesAgo(3), answered_at: null, ...patch },
    waiting: 1,
  };
}

const meeting = (startsAt: string): TvEventRow => ({ id: "e1", title: "Планёрка", starts_at: startsAt, location: "Переговорная", people: 6 });

describe("overlayOf — посетитель", () => {
  it("ждёт ответа: надпись во всю стену со словами секретаря и временем", () => {
    const view = overlayOf(visit(), [], NOW);
    expect(view.banner).toEqual({
      kind: "visit",
      id: "v1",
      title: "К вам посетитель",
      note: "Иванов, по поставкам",
      since: "ждёт 3 мин",
      more: 0,
    });
    expect(view.pill).toBeNull();
  });

  it("гость в кабинете: слов секретаря нет, надпись остаётся", () => {
    const view = overlayOf(visit({ note: null }), [], NOW);
    expect(view.banner?.kind).toBe("visit");
    expect(view.banner && "note" in view.banner ? view.banner.note : "x").toBeNull();
  });

  it("только что пришёл — «только что», а не «ждёт только что»", () => {
    const view = overlayOf(visit({ created_at: NOW.toISOString() }), [], NOW);
    expect(view.banner && "since" in view.banner ? view.banner.since : "").toBe("только что");
  });

  it("«Пусть заходит» — «Заходите» на несколько секунд, потом ничего", () => {
    const invited = visit({ status: "invited", answered_at: new Date(NOW.getTime() - 2_000).toISOString() });
    expect(overlayOf(invited, [], NOW).banner?.kind).toBe("visit-in");
    const later = new Date(NOW.getTime() + INVITED_MS);
    expect(overlayOf(invited, [], later).banner).toBeNull();
  });

  it("«Подождёт» — тихая плашка вместо надписи", () => {
    const view = overlayOf(visit({ status: "wait", answered_at: minutesAgo(1), created_at: minutesAgo(7) }), [], NOW);
    expect(view.banner).toBeNull();
    expect(view.pill).toEqual({ kind: "visit-wait", id: "v1", text: "Посетитель ждёт · 7 мин" });
  });

  it("ждут двое — надпись говорит «ещё 1»", () => {
    const view = overlayOf({ ...visit(), waiting: 2 }, [], NOW);
    expect(view.banner && "more" in view.banner ? view.banner.more : 0).toBe(1);
  });
});

describe("overlayOf — мероприятие", () => {
  it("за 15 минут до начала надпись висит минуту", () => {
    const view = overlayOf(null, [meeting(minutesAhead(EVENT_SOON_MIN))], NOW);
    expect(view.banner).toEqual({
      kind: "event",
      id: "e1",
      title: "Через 15 минут",
      detail: "Планёрка · Переговорная · 6 чел.",
    });
    expect(overlayOf(null, [meeting(minutesAhead(EVENT_SOON_MIN - 2))], NOW).banner).toBeNull();
  });

  it("на старте — «Начинается», минуту", () => {
    expect(overlayOf(null, [meeting(NOW.toISOString())], NOW).banner?.title).toBe("Начинается");
    expect(overlayOf(null, [meeting(minutesAgo(2))], NOW).banner).toBeNull();
  });

  it("посетитель важнее мероприятия", () => {
    expect(overlayOf(visit(), [meeting(NOW.toISOString())], NOW).banner?.kind).toBe("visit");
  });
});

describe("waited", () => {
  it("минуты и часы без секунд", () => {
    expect(waited(minutesAgo(0), NOW)).toBe("только что");
    expect(waited(minutesAgo(59), NOW)).toBe("59 мин");
    expect(waited(minutesAgo(65), NOW)).toBe("1 ч 5 мин");
    expect(waited(minutesAgo(120), NOW)).toBe("2 ч");
  });
});
