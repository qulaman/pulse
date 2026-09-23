import { describe, expect, it } from "vitest";

import { filterNotes, firstLine, restLines, splitNotes } from "./list";
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

describe("splitNotes", () => {
  it("keeps what a note became out of the working feed", () => {
    const plain = note({ text: "Подумать про склад" });
    const asTask = note({ text: "Акция", converted_task_id: "t-1" });
    const asAnnouncement = note({ text: "Собрание", converted_announcement_id: "a-1" });

    const { active, converted } = splitNotes([plain, asTask, asAnnouncement]);

    expect(active.map((n) => n.text)).toEqual(["Подумать про склад"]);
    expect(converted).toHaveLength(2);
  });

  it("puts pinned notes on top and the rest newest first", () => {
    const old = note({ text: "старая", created_at: "2026-09-10T10:00:00Z" });
    const fresh = note({ text: "свежая", created_at: "2026-09-17T10:00:00Z" });
    const pinned = note({ text: "закреплённая", created_at: "2026-09-01T10:00:00Z", pinned: true });

    expect(splitNotes([old, fresh, pinned]).active.map((n) => n.text)).toEqual([
      "закреплённая",
      "свежая",
      "старая",
    ]);
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
