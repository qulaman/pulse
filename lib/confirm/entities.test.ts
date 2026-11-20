import { describe, expect, it } from "vitest";

import type { PostprocessedEntity } from "@/lib/ai/postprocess";

import { describeParticipants, isNotesOnly, whyNothingToSend } from "./entities";

function taskEntity(overrides: Partial<PostprocessedEntity> = {}): PostprocessedEntity {
  return {
    kind: "task",
    assignee_queries: ["Ерлан"],
    assignee_id: null,
    assignee_confidence: 0.4,
    group_id: null,
    title: "КП для Казхрома",
    body: null,
    deadline_iso: null,
    deadline_confidence: null,
    deadline_source_text: null,
    priority: "normal",
    scheduled_send_at: null,
    source_span: "КП для Казхрома",
    assignee: {
      status: "ambiguous",
      user_id: null,
      candidates: [
        { user_id: "u-1", full_name: "Ерлан Сатов", score: 0.8 },
        { user_id: "u-2", full_name: "Ерлан Ким", score: 0.75 },
      ],
      flag: "check",
    },
    blocked: "assignee_unmatched",
    ...overrides,
  } as PostprocessedEntity;
}

function noteEntity(text = "Сделать акцию для Альфы"): PostprocessedEntity {
  return { kind: "note", text, source_span: text } as PostprocessedEntity;
}

describe("isNotesOnly", () => {
  it("is true for notes alone", () => {
    expect(isNotesOnly([noteEntity(), noteEntity("Подумать про склад")])).toBe(true);
  });

  it("is false when a task rides along", () => {
    expect(isNotesOnly([noteEntity(), taskEntity()])).toBe(false);
  });

  it("is false for an empty parse", () => {
    expect(isNotesOnly([])).toBe(false);
  });
});

describe("describeParticipants", () => {
  const nameOf = (id: string) => ({ "u-003": "Марат", "u-005": "Айгуль", "u-001": "Ерлан" })[id];

  it("says «Все» when the whole company is invited", () => {
    expect(describeParticipants({ everyone: true, participant_ids: [] }, nameOf)).toBe("Все");
  });

  it("says «Только я» when nobody else is in it — the author always is", () => {
    expect(describeParticipants({ everyone: false, participant_ids: [] }, nameOf)).toBe("Только я");
  });

  it("names two people in full", () => {
    expect(describeParticipants({ everyone: false, participant_ids: ["u-003", "u-005"] }, nameOf)).toBe(
      "Марат, Айгуль",
    );
  });

  it("counts the rest after the first name", () => {
    expect(
      describeParticipants({ everyone: false, participant_ids: ["u-003", "u-005", "u-001"] }, nameOf),
    ).toBe("Марат +2");
  });
});

describe("whyNothingToSend — the face says the real reason (D-137)", () => {
  const points = (amount: number, blocked?: "points_blocked") =>
    ({ kind: "points", assignee_id: "u-005", amount, reason: null, source_span: "Айгуль минус 10", blocked }) as unknown as PostprocessedEntity;

  it("a minus said by the director is sendable: nothing to explain", () => {
    expect(whyNothingToSend([points(-10)], true)).toBe("");
  });
  it("points while the company has them off", () => {
    expect(whyNothingToSend([points(-10)], false)).toBe("Очки выключены в Настройках.");
  });
  it("points from shared text", () => {
    expect(whyNothingToSend([points(10, "points_blocked")], true)).toBe("Очки из пересланного текста не начисляются.");
  });
  it("a task without an assignee is still «исполнителя»", () => {
    expect(whyNothingToSend([taskEntity({ blocked: "assignee_unmatched" } as Partial<PostprocessedEntity>)], true)).toBe("Не хватает исполнителя.");
  });
});
