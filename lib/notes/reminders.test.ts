import { describe, expect, it } from "vitest";

import { dueToRing, endOfAqtobeDay, flagWords, horizonOf, leftToday, rangKey, reminderHref, ringWords, type DueReminder } from "./reminders";

// 2026-11-17 14:00 in Aqtobe (UTC+5)
const NOW = new Date("2026-11-17T09:00:00Z");
const row = (id: string, remind_at: string | null, text = `Мысль ${id}`, board_id: string | null = null): DueReminder => ({ id, text, remind_at, board_id, audio_path: null });

describe("the read's bounds", () => {
  it("today ends at midnight in Aqtobe", () => {
    expect(endOfAqtobeDay(NOW).toISOString()).toBe("2026-11-17T19:00:00.000Z");
  });

  it("near midnight the read still looks two hours ahead", () => {
    const late = new Date("2026-11-17T18:30:00Z"); // 23:30 in Aqtobe
    expect(horizonOf(late).toISOString()).toBe("2026-11-17T20:30:00.000Z");
    expect(horizonOf(NOW).toISOString()).toBe("2026-11-17T19:00:00.000Z");
  });
});

describe("dueToRing", () => {
  it("rings what has come, the earliest first, once per browser", () => {
    const rows = [row("b", "2026-11-17T08:59:00Z"), row("a", "2026-11-17T08:00:00Z"), row("later", "2026-11-17T10:00:00Z")];
    expect(dueToRing(rows, NOW, new Set()).map((r) => r.id)).toEqual(["a", "b"]);
    expect(dueToRing(rows, NOW, new Set([rangKey(rows[1]!)])).map((r) => r.id)).toEqual(["b"]);
  });

  it("a reminder moved to a new time rings again", () => {
    const moved = row("a", "2026-11-17T08:50:00Z");
    expect(dueToRing([moved], NOW, new Set([rangKey(row("a", "2026-11-17T08:00:00Z"))])).map((r) => r.id)).toEqual(["a"]);
  });
});

describe("leftToday", () => {
  it("counts today's reminders in Aqtobe, not tomorrow's", () => {
    const rows = [row("a", "2026-11-17T12:00:00Z"), row("b", "2026-11-17T18:59:00Z"), row("tomorrow", "2026-11-17T19:30:00Z"), row("none", null)];
    expect(leftToday(rows, NOW).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("a time gone by is not «напомню»: it rang or rings now", () => {
    const rows = [row("past", "2026-11-17T08:30:00Z"), row("ahead", "2026-11-17T10:00:00Z")];
    expect(leftToday(rows, NOW).map((r) => r.id)).toEqual(["ahead"]);
  });
});

describe("ringWords", () => {
  it("one reminder: its first line, «Открыть» to the note", () => {
    expect(ringWords([row("n1", "2026-11-17T08:59:00Z", "Позвонить в банк\nпро ставку")], NOW)).toEqual({ text: "Напоминание: Позвонить в банк", href: "/desk/notes?n=n1" });
  });

  it("a late one says for when it was set, as the push does", () => {
    expect(ringWords([row("n1", "2026-11-16T13:00:00Z", "Банк")], NOW).text).toBe("Напоминание: Банк · было на вчера 18:00");
  });

  it("a voice note without words yet, a point of a board", () => {
    expect(ringWords([row("n1", "2026-11-17T08:59:00Z", "")], NOW).text).toBe("Напоминание: Голосовая заметка");
    expect(ringWords([row("p1", "2026-11-17T08:59:00Z", "Пункт", "b1")], NOW).href).toBe("/desk/boards/b1");
  });

  it("several at once: the count, two heads and the list", () => {
    const rows = [row("a", "2026-11-17T08:00:00Z", "Банк"), row("b", "2026-11-17T08:10:00Z", "Смета"), row("c", "2026-11-17T08:20:00Z", "Ерлан")];
    expect(ringWords(rows, NOW)).toEqual({ text: "Напоминания: 3 — Банк, Смета и ещё 1", href: "/desk/notes" });
    expect(flagWords(rows)).toBe("3 напоминания");
    expect(flagWords(rows.slice(0, 1))).toBe("Банк");
  });
});

describe("reminderHref", () => {
  it("a loose thought opens in «Заметки»", () => {
    expect(reminderHref({ id: "n1", board_id: null })).toBe("/desk/notes?n=n1");
  });
});
