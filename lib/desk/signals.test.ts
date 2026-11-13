import { describe, expect, it } from "vitest";

import {
  afterAlarm,
  agoLine,
  alarmOf,
  clock,
  directorSignal,
  freshAnswer,
  guardPhone,
  newKeys,
  parseSound,
  secretarySignal,
  tabTitle,
  type SignalErrand,
  type SignalVisit,
} from "./signals";

const NOW = new Date("2026-11-13T08:00:00Z");
const ago = (s: number) => new Date(NOW.getTime() - s * 1000).toISOString();
const ME = "me";
const OTHER = "other";
const DIRECTOR = "dir";

let n = 0;
function errand(over: Partial<SignalErrand> = {}): SignalErrand {
  n += 1;
  return {
    id: `e${n}`,
    kind: "coffee",
    label: "Кофе",
    status: "sent",
    created_at: ago(60),
    accepted_at: null,
    claimed_by: null,
    author_id: DIRECTOR,
    question: null,
    asked_at: null,
    answer: null,
    answered_at: null,
    ...over,
  };
}

function visit(over: Partial<SignalVisit> = {}): SignalVisit {
  n += 1;
  return { id: `v${n}`, kind: "visitor", status: "waiting", note: "Арман", created_at: ago(120), answered_at: null, shown_at: null, closed_at: null, author_id: ME, ...over };
}

describe("alarmOf", () => {
  it("takes the untaken «Охрана» over one already in hand", () => {
    const taken = errand({ kind: "security", label: "Охрана", status: "accepted", claimed_by: ME, created_at: ago(300) });
    const calling = errand({ kind: "security", label: "Охрана", created_at: ago(10) });
    expect(alarmOf([taken, calling])?.id).toBe(calling.id);
    expect(alarmOf([taken])?.id).toBe(taken.id);
  });

  it("knows a button named by its words and ignores closed ones", () => {
    expect(alarmOf([errand({ kind: "custom_1", label: "Вызови охрану" })])?.label).toBe("Вызови охрану");
    expect(alarmOf([errand({ kind: "security", label: "Охрана", status: "done" }), errand()])).toBeNull();
  });
});

describe("secretarySignal", () => {
  it("counts the untaken requests and names the newest", () => {
    const signal = secretarySignal({
      meId: ME,
      errands: [errand({ label: "Чай", created_at: ago(30) }), errand({ label: "Кофе", created_at: ago(200) }), errand({ status: "accepted", claimed_by: ME })],
      visits: [],
      now: NOW,
    });
    expect(signal.count).toBe(2);
    expect(signal.words).toBe("Чай");
    expect(signal.dot).toBe("wait");
    expect(signal.ringing).toBe(false);
    expect(tabTitle(signal)).toBe("(2) Чай — Pulse");
  });

  it("rings and says «Охрана!» while the alarm waits; the alarm never chimes", () => {
    const alarm = errand({ kind: "security", label: "Охрана", created_at: ago(5) });
    const coffee = errand({ created_at: ago(1) });
    const signal = secretarySignal({ meId: ME, errands: [alarm, coffee], visits: [], now: NOW });
    expect(signal.ringing).toBe(true);
    expect(signal.dot).toBe("alarm");
    expect(signal.words).toBe("Охрана!");
    expect(signal.chime).toEqual([`e:${coffee.id}`]);
  });

  it("stops ringing once the alarm is taken", () => {
    const signal = secretarySignal({ meId: ME, errands: [errand({ kind: "security", label: "Охрана", status: "accepted", claimed_by: OTHER })], visits: [], now: NOW });
    expect(signal.ringing).toBe(false);
    expect(signal.dot).toBe("none");
    expect(tabTitle(signal)).toBe("Pulse");
  });

  it("says the director's answer for a minute, then lets it go", () => {
    const asked = errand({ status: "accepted", claimed_by: ME, question: "С сахаром?", asked_at: ago(50), answer: "Да", answered_at: ago(20) });
    const signal = secretarySignal({ meId: ME, errands: [asked], visits: [], now: NOW });
    expect(signal.words).toBe("Директор: Да");
    expect(signal.dot).toBe("wait");
    expect(tabTitle(signal)).toBe("Директор: Да — Pulse");
    const later = secretarySignal({ meId: ME, errands: [asked], visits: [], now: new Date(NOW.getTime() + 60_000) });
    expect(later.words).toBeNull();
  });
});

describe("freshAnswer", () => {
  it("hears the director on her visitor, not on a colleague's", () => {
    const mine = visit({ status: "invited", answered_at: ago(10) });
    const theirs = visit({ status: "declined", answered_at: ago(5), author_id: OTHER });
    expect(freshAnswer([], [mine, theirs], ME, NOW)).toBe("Директор: пусть заходит");
  });

  it("takes the newest of two answers and ignores a request held by another", () => {
    const older = visit({ kind: "message", status: "read", answered_at: ago(40) });
    const newer = errand({ status: "accepted", claimed_by: ME, answer: "Зелёный", answered_at: ago(3) });
    const foreign = errand({ status: "accepted", claimed_by: OTHER, answer: "Нет", answered_at: ago(1) });
    expect(freshAnswer([newer, foreign], [older], ME, NOW)).toBe("Директор: Зелёный");
  });
});

describe("directorSignal", () => {
  it("keeps the navigation's number and chimes for the door and a question", () => {
    const at = visit({ author_id: OTHER });
    const read = visit({ kind: "message", status: "read", closed_at: ago(1) });
    const q = errand({ status: "accepted", claimed_by: OTHER, question: "Чёрный или зелёный?", asked_at: ago(15) });
    const signal = directorSignal({ meId: DIRECTOR, count: 3, errands: [q], visits: [at, read] });
    expect(tabTitle(signal)).toBe("(3) Pulse");
    expect(signal.dot).toBe("wait");
    expect(signal.chime).toEqual([`v:${at.id}`, `q:${q.id}:${q.asked_at}`]);
    expect(directorSignal({ meId: DIRECTOR, count: 0, errands: [], visits: [] }).dot).toBe("none");
  });
});

describe("tabTitle", () => {
  it("caps the number", () => {
    expect(tabTitle({ count: 140, words: null })).toBe("(99+) Pulse");
  });
});

describe("newKeys", () => {
  it("passes only what was not seen", () => {
    expect(newKeys(new Set(["e:1"]), ["e:1", "e:2"])).toEqual(["e:2"]);
  });
});

describe("parseSound", () => {
  it("is on for the secretary and off for the director until chosen", () => {
    expect(parseSound(null, "secretary")).toBe(true);
    expect(parseSound(null, "director")).toBe(false);
    expect(parseSound("off", "secretary")).toBe(false);
    expect(parseSound("on", "director")).toBe(true);
    expect(parseSound("junk", "director")).toBe(false);
  });
});

describe("guardPhone", () => {
  it("groups an eleven-digit number and leaves a short one as typed", () => {
    expect(guardPhone("87015551234")).toBe("+7 701 555 12 34");
    expect(guardPhone("+7 (701) 555-12-34")).toBe("+7 701 555 12 34");
    expect(guardPhone(" 102 ")).toBe("102");
    expect(guardPhone(null)).toBe("");
  });
});

describe("clock and agoLine", () => {
  it("counts minutes and seconds, hours when it comes to that", () => {
    expect(clock(ago(72), NOW)).toBe("1:12");
    expect(clock(ago(5), NOW)).toBe("0:05");
    expect(clock(ago(3725), NOW)).toBe("1:02:05");
    expect(agoLine(ago(30), NOW)).toBe("30 с назад");
    expect(agoLine(ago(150), NOW)).toBe("2 мин назад");
  });
});

describe("afterAlarm", () => {
  it("says what waits behind the alarm, and nothing when nothing does", () => {
    const alarm = errand({ kind: "security", label: "Охрана" });
    const rows = [alarm, errand(), errand(), errand({ status: "accepted", claimed_by: ME }), errand({ status: "accepted", claimed_by: OTHER })];
    const lobby = [visit(), visit({ kind: "message" }), visit({ status: "invited", closed_at: ago(1) })];
    expect(afterAlarm({ errands: rows, visits: lobby, meId: ME, alarmId: alarm.id })).toBe("После тревоги: ждут ещё 2 · у вас 1 · в приёмной 1");
    expect(afterAlarm({ errands: [alarm], visits: [], meId: ME, alarmId: alarm.id })).toBeNull();
  });
});
