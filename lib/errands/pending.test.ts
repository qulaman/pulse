import { describe, expect, it } from "vitest";

import { isStale, keptErrands, sentLine, STALE_MS, verdictOf } from "@/lib/errands/pending";

describe("verdictOf — what the server's answer means for a kept request (D-106)", () => {
  it("2xx — gone, a duplicate included", () => {
    expect(verdictOf(200)).toBe("ok");
    expect(verdictOf(201)).toBe("ok");
  });

  it("no answer, an expired session, a busy server — the next round", () => {
    for (const status of [0, 401, 408, 429, 500, 502, 503]) expect(verdictOf(status)).toBe("retry");
  });

  it("a request the server will never take — dropped, not retried forever", () => {
    for (const status of [400, 403, 404, 422]) expect(verdictOf(status)).toBe("fail");
  });
});

describe("isStale — a coffee forty minutes late is not the coffee asked for", () => {
  const now = Date.parse("2026-09-23T10:00:00Z");

  it("fresh inside the window, stale past it", () => {
    expect(isStale({ at: now - 60_000 }, now)).toBe(false);
    expect(isStale({ at: now - STALE_MS }, now)).toBe(false);
    expect(isStale({ at: now - STALE_MS - 1 }, now)).toBe(true);
  });
});

describe("sentLine — the toast of a request that went", () => {
  it("a button alone, and with its note", () => {
    expect(sentLine("Кофе", null)).toBe("Кофе · отправлено");
    expect(sentLine("Кофе", "  ")).toBe("Кофе · отправлено");
    expect(sentLine("Кофе", "без сахара")).toBe("Кофе · без сахара · отправлено");
  });

  it("a free request says its words once, not the label and then the same words again", () => {
    expect(sentLine("Принеси документы из бухгалтерии", "Принеси документы из бухгалтерии, пожалуйста")).toBe(
      "Принеси документы из бухгалтерии, пожалуйста · отправлено",
    );
  });

  it("a long note is clipped, so the toast stays one line or two", () => {
    const line = sentLine("Такси", "в аэропорт к рейсу на Астану, второй терминал, чемодан большой");
    expect(line.startsWith("Такси · в аэропорт")).toBe(true);
    expect(line).toContain("… · отправлено");
    expect(line.length).toBeLessThan(60);
  });

  it("who is away comes after it — the request waits for them", () => {
    expect(sentLine("Кофе", null, "Айгуль не на месте до 14:00")).toBe("Кофе · отправлено · Айгуль не на месте до 14:00");
  });
});

describe("keptErrands — only well-formed entries come back from the phone", () => {
  const good = { id: "a", code: "coffee", label: "Кофе", icon: "☕", note: null, at: 1 };

  it("reads what was kept", () => {
    expect(keptErrands(JSON.stringify([good]))).toEqual([good]);
  });

  it("nothing, junk and foreign shapes give nothing", () => {
    expect(keptErrands(null)).toEqual([]);
    expect(keptErrands("{")).toEqual([]);
    expect(keptErrands(JSON.stringify({ id: "a" }))).toEqual([]);
    expect(keptErrands(JSON.stringify([null, 1, { id: "b", code: "tea" }, good]))).toEqual([good]);
  });
});

describe("requests for a time on the phone (D-106 §8)", () => {
  const now = Date.parse("2026-09-23T09:10:00Z");

  it("a taxi for the evening asked in the morning still goes after a long outage", () => {
    expect(isStale({ at: now - 3 * 60 * 60_000, dueAt: "2026-09-23T13:00:00Z" }, now)).toBe(false);
  });

  it("but not once its time is five minutes away", () => {
    expect(isStale({ at: now - 60_000, dueAt: "2026-09-23T09:14:00Z" }, now)).toBe(true);
  });

  it("the toast says the time", () => {
    expect(sentLine("Такси", null, null, "2026-09-23T13:00:00Z")).toBe("Такси · к 18:00 · отправлено");
  });
});
