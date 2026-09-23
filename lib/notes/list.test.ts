import { describe, expect, it } from "vitest";

import {
  awaitsWords,
  filterNotes,
  firstLine,
  groupNotes,
  markMatches,
  notesSummary,
  noteTime,
  restLines,
  splitNotes,
} from "./list";
import type { Note } from "./queries";

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: crypto.randomUUID(),
    company_id: "c-1",
    user_id: "u-1",
    text: "Мысль",
    raw_transcript: null,
    audio_path: null,
    inbox_item_id: null,
    pinned: false,
    converted_task_id: null,
    converted_announcement_id: null,
    converted_at: null,
    deleted_at: null,
    client_request_id: null,
    created_at: "2026-09-17T10:00:00Z",
    updated_at: "2026-09-17T10:00:00Z",
    ...overrides,
  };
}

// 2026-09-23 12:00 in Aqtobe (UTC+5)
const NOW = new Date("2026-09-23T07:00:00Z");

describe("splitNotes", () => {
  it("keeps what a note became and what was deleted out of the working feed", () => {
    const plain = note({ text: "Подумать про склад" });
    const asTask = note({ text: "Акция", converted_task_id: "t-1" });
    const asAnnouncement = note({ text: "Собрание", converted_announcement_id: "a-1" });
    const deleted = note({ text: "Лишнее", deleted_at: "2026-09-18T10:00:00Z" });
    const deletedTask = note({ text: "Стала задачей и удалена", converted_task_id: "t-2", deleted_at: "2026-09-18T11:00:00Z" });

    const { active, converted, trash } = splitNotes([plain, asTask, asAnnouncement, deleted, deletedTask]);

    expect(active.map((n) => n.text)).toEqual(["Подумать про склад"]);
    expect(converted).toHaveLength(2);
    expect(trash.map((n) => n.text)).toEqual(["Стала задачей и удалена", "Лишнее"]);
  });

  it("puts pinned notes on top and the rest newest first", () => {
    const old = note({ text: "старая", created_at: "2026-09-10T10:00:00Z" });
    const fresh = note({ text: "свежая", created_at: "2026-09-17T10:00:00Z" });
    const pinned = note({ text: "закреплённая", created_at: "2026-09-01T10:00:00Z", pinned: true });

    expect(splitNotes([old, fresh, pinned]).active.map((n) => n.text)).toEqual(["закреплённая", "свежая", "старая"]);
  });

  it("orders «В деле» by the moment of conversion", () => {
    const early = note({ text: "раньше", converted_task_id: "t-1", converted_at: "2026-09-18T10:00:00Z" });
    const late = note({ text: "позже", converted_task_id: "t-2", converted_at: "2026-09-20T10:00:00Z", created_at: "2026-09-01T10:00:00Z" });

    expect(splitNotes([early, late]).converted.map((n) => n.text)).toEqual(["позже", "раньше"]);
  });
});

describe("filterNotes", () => {
  const rows = [note({ text: "Скидки оптовикам" }), note({ text: "Проверить склад" })];

  it("matches a substring regardless of case", () => {
    expect(filterNotes(rows, "СКЛАД").map((n) => n.text)).toEqual(["Проверить склад"]);
  });

  it("keeps everything on an empty query", () => {
    expect(filterNotes(rows, "   ")).toHaveLength(2);
  });
});

describe("firstLine / restLines", () => {
  it("skips the empty lines before the heading", () => {
    expect(firstLine("\n\n  Акция для Альфы\nподробности")).toBe("Акция для Альфы");
    expect(restLines("\n\n  Акция для Альфы\nподробности")).toBe("подробности");
  });

  it("survives an empty note", () => {
    expect(firstLine("   ")).toBe("");
    expect(restLines("   ")).toBe("");
  });
});

describe("awaitsWords", () => {
  it("is a recording whose words have not arrived", () => {
    expect(awaitsWords(note({ text: "", audio_path: "c/u/x.webm" }))).toBe(true);
    expect(awaitsWords(note({ text: "Готово", audio_path: "c/u/x.webm" }))).toBe(false);
    expect(awaitsWords(note({ text: "" }))).toBe(false);
  });
});

describe("groupNotes", () => {
  it("files notes by the Aqtobe day, pinned first", () => {
    const rows = [
      note({ text: "закреп", pinned: true, created_at: "2026-01-05T10:00:00Z" }),
      // 00:30 on the 23rd in Aqtobe is still the 22nd in UTC
      note({ text: "сегодня рано", created_at: "2026-09-22T19:30:00Z" }),
      note({ text: "вчера", created_at: "2026-09-22T10:00:00Z" }),
      note({ text: "на неделе", created_at: "2026-09-19T10:00:00Z" }),
      note({ text: "в месяце", created_at: "2026-09-01T10:00:00Z" }),
      note({ text: "август", created_at: "2026-08-10T10:00:00Z" }),
      note({ text: "прошлый год", created_at: "2025-12-31T10:00:00Z" }),
    ];

    const groups = groupNotes(rows, NOW);

    expect(groups.map((g) => [g.title, g.notes.map((n) => n.text)])).toEqual([
      ["Закреплённые", ["закреп"]],
      ["Сегодня", ["сегодня рано"]],
      ["Вчера", ["вчера"]],
      ["Последние 7 дней", ["на неделе"]],
      ["Последние 30 дней", ["в месяце"]],
      ["Август", ["август"]],
      ["2025", ["прошлый год"]],
    ]);
  });

  it("says the hour only where the day is already the heading", () => {
    expect(noteTime("2026-09-23T04:14:00Z", "today", NOW)).toBe("09:14");
    expect(noteTime("2026-09-22T04:14:00Z", "yesterday", NOW)).toBe("09:14");
    expect(noteTime("2026-09-19T04:14:00Z", "week", NOW)).toBe("сб 09:14");
    // a pinned note keeps its day in words
    expect(noteTime("2026-09-22T04:14:00Z", "pinned", NOW)).toBe("вчера 09:14");
    expect(noteTime("2026-08-10T04:14:00Z", "m-2026-7", NOW)).toBe("10.08 09:14");
  });
});

describe("markMatches", () => {
  it("marks every occurrence and keeps the original case", () => {
    expect(markMatches("Склад и склад", "склад")).toEqual([
      { text: "Склад", hit: true },
      { text: " и ", hit: false },
      { text: "склад", hit: true },
    ]);
  });

  it("returns the whole text as one plain run without a query", () => {
    expect(markMatches("Мысль", " ")).toEqual([{ text: "Мысль", hit: false }]);
    expect(markMatches("", "x")).toEqual([]);
  });
});

describe("notesSummary", () => {
  it("counts the feed, the pinned and the latest", () => {
    const piles = splitNotes([
      note({ pinned: true, created_at: "2026-09-01T10:00:00Z" }),
      note({ created_at: "2026-09-23T04:14:00Z", audio_path: "c/u/a.webm" }),
      note({ created_at: "2026-09-20T10:00:00Z" }),
    ]);

    expect(notesSummary(piles, "active", NOW)).toEqual({
      eyebrow: "Заметки",
      headline: "3 заметки",
      line: "1 закреплена · последняя сегодня 09:14",
      second: "2 за 7 дней · 1 голосом",
    });
  });

  it("names what the notes became and what waits in the bin", () => {
    const piles = splitNotes([
      note({ converted_task_id: "t-1" }),
      note({ converted_task_id: "t-2" }),
      note({ converted_announcement_id: "a-1" }),
      note({ deleted_at: "2026-09-20T10:00:00Z" }),
    ]);

    expect(notesSummary(piles, "converted", NOW).line).toBe("2 задачи · 1 объявление");
    expect(notesSummary(piles, "trash", NOW).headline).toBe("1 в корзине");
    expect(notesSummary(splitNotes([]), "active", NOW).headline).toBe("Пусто");
  });
});
