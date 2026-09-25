import { describe, expect, it } from "vitest";

import {
  awaitsWords,
  filterNotes,
  firstLine,
  groupNotes,
  markMatches,
  nextReminder,
  notesHero,
  noteTime,
  reminderRu,
  remindPresets,
  restLines,
  splitNotes,
  trashExpiresAt,
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
    remind_at: null,
    reminded_at: null,
    parent_id: null,
    board_id: null,
    position: null,
    done_at: null,
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

  it("keeps the points of boards on their boards, and in the bin only while the board lives (D-102)", () => {
    const thought = note({ text: "Мысль" });
    const point = note({ text: "Пункт", board_id: "b-1", position: 1 });
    const handed = note({ text: "Поручённый пункт", board_id: "b-1", position: 2, converted_task_id: "t-1" });
    const gonePoint = note({ text: "Удалённый пункт", board_id: "b-1", position: 3, deleted_at: "2026-09-23T06:00:00Z" });
    const orphan = note({ text: "Пункт удалённой доски", board_id: "b-2", position: 1, deleted_at: "2026-09-23T06:00:00Z" });

    const piles = splitNotes([thought, point, handed, gonePoint, orphan], NOW, new Set(["b-1"]));

    expect(piles.active.map((n) => n.text)).toEqual(["Мысль"]);
    expect(piles.converted).toHaveLength(0);
    expect(piles.trash.map((n) => n.text)).toEqual(["Удалённый пункт"]);
    // without the boards known, no point reaches the bin
    expect(splitNotes([gonePoint], NOW).trash).toHaveLength(0);
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

describe("notesHero", () => {
  it("counts the thoughts, the pinned, the latest, the week and the voice", () => {
    const piles = splitNotes([
      note({ id: "a", created_at: "2026-09-23T04:14:00Z", pinned: true }),
      note({ id: "b", created_at: "2026-09-22T04:00:00Z", audio_path: "c/u/b.webm" }),
      note({ id: "c", created_at: "2026-09-01T04:00:00Z" }),
    ]);
    expect(notesHero(piles, NOW)).toEqual({
      value: 3,
      label: "заметки",
      detail: "1 закреплена · последняя сегодня 09:14",
      second: "2 за 7 дней · 1 голосом",
    });
  });

  it("says what to do when there is nothing yet", () => {
    expect(notesHero(splitNotes([]), NOW).value).toBeNull();
  });
});

describe("the bin keeps three days (D-95)", () => {
  it("expires a deletion three days after it", () => {
    const gone = note({ deleted_at: "2026-09-20T07:00:00Z" });
    expect(trashExpiresAt(gone).toISOString()).toBe("2026-09-23T07:00:00.000Z");
  });

  it("drops what is past its time even before the sweep comes round", () => {
    const fresh = note({ deleted_at: "2026-09-22T07:00:00Z" });
    const stale = note({ deleted_at: "2026-09-20T06:59:00Z" });
    expect(splitNotes([fresh, stale], NOW).trash.map((n) => n.id)).toEqual([fresh.id]);
    // without a clock nothing is dropped
    expect(splitNotes([fresh, stale]).trash).toHaveLength(2);
  });
});

describe("search reaches what was said", () => {
  it("finds a word the director edited away", () => {
    const edited = note({ text: "Позвонить поставщику", raw_transcript: "позвонить в Казхром насчёт труб" });
    expect(filterNotes([edited], "казхром")).toHaveLength(1);
  });
});

describe("reminders (D-95)", () => {
  const soon = note({ text: "Позвонить в Казхром", remind_at: "2026-09-24T04:00:00Z" });
  const later = note({ text: "Счёт от поставщика", remind_at: "2026-09-28T04:00:00Z", pinned: true });
  const rung = note({ text: "Уже было", remind_at: "2026-09-23T04:00:00Z", reminded_at: "2026-09-23T04:00:30Z", created_at: "2026-09-23T03:00:00Z" });

  it("files reminders still to ring first, soonest first — pinned or not", () => {
    const groups = groupNotes(splitNotes([rung, later, soon]).active, NOW);
    expect(groups[0].key).toBe("reminders");
    expect(groups[0].notes.map((n) => n.text)).toEqual(["Позвонить в Казхром", "Счёт от поставщика"]);
    // a reminder that has rung goes back to its day
    expect(groups.find((g) => g.key === "today")?.notes.map((n) => n.text)).toEqual(["Уже было"]);
    expect(groups.some((g) => g.key === "pinned")).toBe(false);
  });

  it("says the reminder the way a person does", () => {
    expect(reminderRu(soon, NOW)).toBe("напомню завтра 09:00");
    expect(reminderRu(rung, NOW)).toBe("напомнил сегодня 09:00");
    expect(reminderRu(note({ remind_at: "2026-09-23T06:59:00Z" }), NOW)).toBe("напомню сейчас");
    expect(reminderRu(note(), NOW)).toBeNull();
  });

  it("puts the soonest one on the status screen", () => {
    expect(nextReminder([later, soon, rung])?.id).toBe(soon.id);
    expect(notesHero(splitNotes([rung, later, soon]), NOW).second).toBe("напомню завтра 09:00 · 3 за 7 дней");
  });

  it("offers one-tap times", () => {
    // Wednesday 12:00 in Aqtobe
    expect(remindPresets(NOW).map((p) => [p.label, p.at.toISOString()])).toEqual([
      ["Через час", "2026-09-23T08:00:00.000Z"],
      ["Сегодня 18:00", "2026-09-23T13:00:00.000Z"],
      ["Завтра 9:00", "2026-09-24T04:00:00.000Z"],
      ["Пн 9:00", "2026-09-28T04:00:00.000Z"],
    ]);
  });

  it("drops the evening once it is less than an hour away, and Monday when it is tomorrow", () => {
    // Sunday 17:10 in Aqtobe
    const sunday = new Date("2026-09-27T12:10:00Z");
    expect(remindPresets(sunday).map((p) => p.label)).toEqual(["Через час", "Завтра 9:00"]);
    expect(remindPresets(sunday)[0].at.toISOString()).toBe("2026-09-27T13:10:00.000Z");
  });
});
