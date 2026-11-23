import { describe, expect, it } from "vitest";

import { EVENT_SOON_MIN, FULL_MS, meetingOf, noticesToStamp, overlayOf, waited } from "./overlay";
import type { TvEventRow, TvOverlay } from "./queries";

const NOW = new Date("2026-09-25T09:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const minutesAhead = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString();

function visit(patch: Partial<NonNullable<TvOverlay["visit"]>> = {}): TvOverlay {
  return {
    visit: { id: "v1", status: "waiting", note: "Иванов, по поставкам", created_at: minutesAgo(3), answered_at: null, ...patch },
    waiting: 1,
    message: null,
    messages: 0,
  };
}

function message(patch: Partial<NonNullable<TvOverlay["message"]>> = {}, messages = 1): TvOverlay {
  return {
    visit: null,
    waiting: 0,
    message: { id: "m1", note: "Звонил Ахметов, просит перезвонить", created_at: minutesAgo(2), ...patch },
    messages,
  };
}

const meeting = (startsAt: string): TvEventRow => ({ id: "e1", title: "Планёрка", starts_at: startsAt, location: "Переговорная", people: 6 });

const secondsAgo = (s: number) => new Date(NOW.getTime() - s * 1_000).toISOString();
const after = (iso: string, ms: number) => new Date(new Date(iso).getTime() + ms);

/** Everything the overlay would print, joined: what the room could read off the wall. */
function printed(view: ReturnType<typeof overlayOf>): string {
  return [...Object.values(view.banner ?? {}), ...Object.values(view.pill ?? {})].filter((v) => typeof v === "string").join(" | ");
}

const PHONE_PLATE = "Сообщение — подробности у вас в телефоне";

describe("overlayOf — посетитель", () => {
  it("первую минуту — надпись во всю стену со словами секретаря", () => {
    const view = overlayOf(visit({ created_at: secondsAgo(20) }), [], NOW);
    expect(view.banner).toEqual({
      kind: "visit",
      id: "v1",
      title: "К вам посетитель",
      note: "Иванов, по поставкам",
      since: "только что",
      more: 0,
    });
    expect(view.pill).toBeNull();
  });

  it("через минуту надпись сворачивается в плашку: «Посетитель ждёт N мин» (D-185)", () => {
    const created = secondsAgo(20);
    expect(overlayOf(visit({ created_at: created }), [], after(created, FULL_MS - 1)).banner?.kind).toBe("visit");
    const folded = overlayOf(visit({ created_at: created }), [], after(created, FULL_MS));
    expect(folded.banner).toBeNull();
    expect(folded.pill).toEqual({ kind: "visit", id: "v1", text: "Посетитель ждёт 1 мин" });
    // the helper's visitor came three minutes ago: long folded, the plate counts the waiting
    expect(overlayOf(visit(), [], NOW)).toEqual({ banner: null, pill: { kind: "visit", id: "v1", text: "Посетитель ждёт 3 мин" } });
  });

  it("гость в кабинете: слов секретаря нет, надпись остаётся", () => {
    const view = overlayOf(visit({ note: null, created_at: secondsAgo(5) }), [], NOW);
    expect(view.banner?.kind).toBe("visit");
    expect(view.banner && "note" in view.banner ? view.banner.note : "x").toBeNull();
    // folded, the plate never carries the secretary's words — guest or not
    expect(overlayOf(visit({ note: null }), [], NOW).pill?.text).toBe("Посетитель ждёт 3 мин");
    expect(printed(overlayOf(visit(), [], NOW))).not.toMatch(/Иванов|поставк/);
  });

  it("только что пришёл — «только что», а не «ждёт только что»", () => {
    const view = overlayOf(visit({ created_at: NOW.toISOString() }), [], NOW);
    expect(view.banner && "since" in view.banner ? view.banner.since : "").toBe("только что");
  });

  it("«Подождёт» — тихая плашка вместо надписи, даже в первую минуту", () => {
    const view = overlayOf(visit({ status: "wait", answered_at: minutesAgo(1), created_at: minutesAgo(7) }), [], NOW);
    expect(view.banner).toBeNull();
    expect(view.pill).toEqual({ kind: "visit-wait", id: "v1", text: "Посетитель ждёт 7 мин" });
    const quick = overlayOf(visit({ status: "wait", answered_at: secondsAgo(5), created_at: secondsAgo(30) }), [], NOW);
    expect(quick).toEqual({ banner: null, pill: { kind: "visit-wait", id: "v1", text: "Посетитель ждёт" } });
  });

  it("ждут двое — надпись говорит «ещё 1»", () => {
    const view = overlayOf({ ...visit({ created_at: secondsAgo(10) }), waiting: 2 }, [], NOW);
    expect(view.banner && "more" in view.banner ? view.banner.more : 0).toBe(1);
  });
});

describe("overlayOf — сообщение секретаря", () => {
  it("первую минуту — во всю стену: слова секретаря и когда написано", () => {
    expect(overlayOf(message({ created_at: secondsAgo(30) }), [], NOW).banner).toEqual({
      kind: "message",
      id: "m1",
      title: "Сообщение от секретаря",
      text: "Звонил Ахметов, просит перезвонить",
      since: "только что",
      more: 0,
    });
    expect(overlayOf(message({ created_at: NOW.toISOString() }), [], NOW).pill).toBeNull();
  });

  it("через минуту — плашка «Секретарь: …» со словами, если они короткие", () => {
    const created = secondsAgo(10);
    expect(overlayOf(message({ created_at: created }), [], after(created, FULL_MS - 1)).banner?.kind).toBe("message");
    const folded = overlayOf(message({ created_at: created }), [], after(created, FULL_MS));
    expect(folded.banner).toBeNull();
    expect(folded.pill).toEqual({ kind: "message", id: "m1", text: "Секретарь: Звонил Ахметов, просит перезвонить" });
  });

  it("длинные слова на плашку не лезут и не режутся: «подробности у вас в телефоне»", () => {
    const fits = "Б".repeat(56);
    const long = "Б".repeat(57);
    expect(overlayOf(message({ note: fits }), [], NOW).pill).toEqual({ kind: "message", id: "m1", text: `Секретарь: ${fits}` });
    expect(overlayOf(message({ note: long }), [], NOW).pill).toEqual({ kind: "message", id: "m1", text: PHONE_PLATE });
    // fresh, the long words are on the banner whole
    expect(overlayOf(message({ note: long, created_at: secondsAgo(5) }), [], NOW).banner).toMatchObject({ kind: "message", text: long });
    expect(printed(overlayOf(message({ note: long }), [], NOW))).not.toMatch(/…|\.\.\./);
  });

  it("гость в кабинете: надпись и звонок есть, слов нет — только «подробности у вас в телефоне» (D-33)", () => {
    for (const note of [null, "", "   "]) {
      const fresh = overlayOf(message({ note, created_at: NOW.toISOString() }), [], NOW);
      expect(fresh.banner).toMatchObject({ kind: "message", text: "Подробности — у вас в телефоне" });
      expect(printed(fresh)).not.toMatch(/Ахметов|перезвонить/);
      expect(overlayOf(message({ note }), [], NOW).pill?.text).toBe(PHONE_PLATE);
    }
  });

  it("три непрочитанных — «ещё 2»", () => {
    expect(overlayOf(message({ created_at: secondsAgo(15) }, 3), [], NOW).banner).toMatchObject({ more: 2 });
  });

  it("посетитель у стола важнее сообщения; «Подождёт» — плашкой под сообщением", () => {
    const both: TvOverlay = { ...message({ created_at: secondsAgo(10) }), visit: visit({ created_at: secondsAgo(20) }).visit, waiting: 1 };
    expect(overlayOf(both, [], NOW)).toMatchObject({ banner: { kind: "visit" }, pill: null });
    const waits: TvOverlay = {
      ...message({ created_at: secondsAgo(10) }),
      visit: { ...visit().visit!, status: "wait", answered_at: minutesAgo(1) },
      waiting: 1,
    };
    const view = overlayOf(waits, [], NOW);
    expect(view.banner?.kind).toBe("message");
    expect(view.pill?.kind).toBe("visit-wait");
    // a visitor folded into the plate: a fresh message still takes the wall, the visitor stays on the plate
    const folded: TvOverlay = { ...message({ created_at: secondsAgo(10) }), visit: visit().visit, waiting: 1 };
    expect(overlayOf(folded, [], NOW)).toMatchObject({ banner: { kind: "message" }, pill: { kind: "visit", text: "Посетитель ждёт 3 мин" } });
  });

  it("плашка одна: посетитель раньше сообщения, и она говорит, что сообщение ждёт", () => {
    const both: TvOverlay = { ...message(), visit: visit().visit, waiting: 1 };
    expect(overlayOf(both, [], NOW)).toEqual({ banner: null, pill: { kind: "visit", id: "v1", text: "Посетитель ждёт 3 мин · есть сообщение" } });
    const waits: TvOverlay = { ...message({ note: null }), visit: { ...visit().visit!, status: "wait", answered_at: minutesAgo(1) }, waiting: 1 };
    expect(overlayOf(waits, [], NOW).pill).toEqual({ kind: "visit-wait", id: "v1", text: "Посетитель ждёт 3 мин · есть сообщение" });
    // the visitor answered and gone: the message's plate comes back
    expect(overlayOf({ ...both, visit: null, waiting: 0 }, [], NOW).pill?.kind).toBe("message");
  });

  it("сообщение важнее мероприятия; свёрнутое — плашкой рядом с надписью о мероприятии", () => {
    expect(overlayOf(message({ created_at: secondsAgo(10) }), [meeting(NOW.toISOString())], NOW).banner?.kind).toBe("message");
    const view = overlayOf(message(), [meeting(NOW.toISOString())], NOW);
    expect(view.banner).toMatchObject({ kind: "event", minutes: null });
    expect(view.pill?.kind).toBe("message");
    // a guest's fresh message still takes the wall for its minute, without the words
    expect(overlayOf(message({ note: null, created_at: NOW.toISOString() }), [meeting(NOW.toISOString())], NOW)).toMatchObject({
      banner: { kind: "message", text: "Подробности — у вас в телефоне" },
    });
  });
});

describe("overlayOf — мероприятие", () => {
  it("за 15 минут до начала надпись висит минуту", () => {
    const view = overlayOf(null, [meeting(minutesAhead(EVENT_SOON_MIN))], NOW);
    expect(view.banner).toEqual({
      kind: "event",
      id: "e1",
      minutes: 15,
      title: "Планёрка",
      untitled: false,
      place: "Переговорная, 6 человек",
    });
    expect(overlayOf(null, [meeting(minutesAhead(EVENT_SOON_MIN - 2))], NOW).banner).toBeNull();
  });

  it("на старте — минут нет, минуту", () => {
    expect(overlayOf(null, [meeting(NOW.toISOString())], NOW).banner).toMatchObject({ kind: "event", minutes: null });
    expect(overlayOf(null, [meeting(minutesAgo(2))], NOW).banner).toBeNull();
  });

  it("гостю — без названия и места: «Встреча» и сколько людей", () => {
    const guest: TvEventRow = { id: "e2", title: null, starts_at: minutesAhead(EVENT_SOON_MIN), location: null, people: 1 };
    expect(overlayOf(null, [guest], NOW).banner).toMatchObject({ title: "Встреча", untitled: true, place: "1 человек" });
    // a meeting really called «Встреча» keeps its caption: the flag says untitled, not the word
    expect(overlayOf(null, [{ ...guest, title: "Встреча" }], NOW).banner).toMatchObject({ untitled: false });
    expect(overlayOf(null, [{ ...guest, people: 0 }], NOW).banner).toMatchObject({ place: null });
  });

  it("посетитель важнее мероприятия; свёрнутый — плашкой рядом с надписью о мероприятии", () => {
    expect(overlayOf(visit({ created_at: secondsAgo(10) }), [meeting(NOW.toISOString())], NOW).banner?.kind).toBe("visit");
    expect(overlayOf(visit(), [meeting(NOW.toISOString())], NOW)).toMatchObject({ banner: { kind: "event" }, pill: { kind: "visit" } });
  });
});

describe("meetingOf", () => {
  it("в пределах часа — отсчёт минут", () => {
    expect(meetingOf(meeting(minutesAhead(25)), NOW)).toEqual({ time: "14:25", when: "через 25 мин", title: "Планёрка", place: "Переговорная" });
  });

  it("позже сегодня — только время", () => {
    expect(meetingOf(meeting(minutesAhead(150)), NOW)).toMatchObject({ time: "16:30", when: null });
  });

  it("уже началась — «идёт»", () => {
    expect(meetingOf(meeting(minutesAgo(10)), NOW).when).toBe("идёт");
  });

  it("завтрашняя — «завтра», по календарю Актобе", () => {
    // 09:00 UTC = 14:00 in Aqtobe; tomorrow 09:00 there is 19 hours ahead
    expect(meetingOf(meeting(minutesAhead(19 * 60)), NOW)).toMatchObject({ time: "09:00", when: "завтра" });
    // 23:30 the same day is not tomorrow
    expect(meetingOf(meeting(minutesAhead(9 * 60 + 30)), NOW).when).toBeNull();
  });

  it("гостю — «Встреча» без места", () => {
    expect(meetingOf({ ...meeting(minutesAhead(90)), title: null, location: null }, NOW)).toMatchObject({ title: "Встреча", place: null });
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

describe("overlayOf — первая минута считается с того, как стена увидела надпись (D-185)", () => {
  it("киоск с часами, ушедшими вперёд, или вернувшийся после обрыва всё равно звонит минуту", () => {
    const late = visit({ created_at: minutesAgo(5) });
    // by created_at the visitor is long folded; the wall saw it just now
    const seen = new Map<string, number>();
    expect(noticesToStamp(late, NOW, seen)).toEqual(["v1"]);
    seen.set("v1", NOW.getTime());
    expect(overlayOf(late, [], NOW, seen).banner).toMatchObject({ kind: "visit", since: "ждёт 5 мин" });
    expect(overlayOf(late, [], new Date(NOW.getTime() + FULL_MS), seen).banner).toBeNull();
    // stamping adds only what is missing
    expect(noticesToStamp(late, NOW, seen)).toEqual([]);
  });

  it("сообщение, пришедшее при посетителе, ждёт своей минуты, а не пропадает за ним", () => {
    const both: TvOverlay = { ...message({ created_at: secondsAgo(5) }), visit: visit({ created_at: secondsAgo(1) }).visit, waiting: 1 };
    const seen = new Map<string, number>();
    // the visitor holds the wall: only the visitor is stamped, the message waits
    expect(noticesToStamp(both, NOW, seen)).toEqual(["v1"]);
    seen.set("v1", NOW.getTime());
    expect(overlayOf(both, [], NOW, seen).banner?.kind).toBe("visit");
    // a minute later the visitor folds — now the message is seen, gets its minute and its chime
    const later = new Date(NOW.getTime() + FULL_MS);
    expect(noticesToStamp(both, later, seen)).toEqual(["m1"]);
    seen.set("m1", later.getTime());
    expect(overlayOf(both, [], later, seen)).toMatchObject({ banner: { kind: "message" }, pill: { kind: "visit" } });
    expect(overlayOf(both, [], new Date(later.getTime() + FULL_MS), seen).pill?.text).toMatch(/есть сообщение$/);
  });
});
