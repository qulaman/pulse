import { describe, expect, it } from "vitest";

import { postprocess } from "./postprocess";
import type { Entity, PointsEntity, TaskEntity } from "./schema";
import type { RosterUser } from "../matchName";

const ROSTER: RosterUser[] = [
  { id: "u-003", full_name: "Марат Оспанов", aliases: ["Марат"], is_active: true },
  { id: "u-005", full_name: "Айгуль Сапарова", aliases: ["Айгуль"], is_active: true },
  { id: "u-009", full_name: "Тимур Салимов", aliases: ["Тимур"], is_active: false },
];

function task(overrides: Partial<TaskEntity> = {}): TaskEntity {
  return {
    kind: "task",
    assignee_queries: ["Марат"],
    assignee_id: "u-003",
    assignee_confidence: 0.95,
    group_id: null,
    title: "КП по Казхрому",
    body: null,
    deadline_iso: "2026-08-14T13:00:00+05:00",
    deadline_confidence: 0.7,
    deadline_source_text: "завтра до обеда",
    priority: "normal",
    scheduled_send_at: null,
    source_span: "Марат КП по Казхрому завтра до обеда",
    ...overrides,
  };
}

function points(overrides: Partial<PointsEntity> = {}): PointsEntity {
  return {
    kind: "points",
    assignee_queries: ["Марату"],
    assignee_id: "u-003",
    assignee_confidence: 0.95,
    amount: 10,
    reason: null,
    source_span: "Марату плюс десять",
    ...overrides,
  };
}

const run = (entities: Entity[], source: "voice" | "typed" | "shared" = "voice") =>
  postprocess(entities, ROSTER, source);

describe("postprocess", () => {
  it("drops an assignee_id that is missing from the roster or inactive", () => {
    const [invented] = run([task({ assignee_id: "u-999", assignee_queries: ["Марат"] })]);
    // the fuzzy match replaces the invented id, so the payload agrees with the chip
    expect(invented.kind === "task" && invented.assignee_id).toBe("u-003");
    expect(invented.assignee).toMatchObject({ status: "matched", user_id: "u-003" });

    const [inactive] = run([task({ assignee_id: "u-009", assignee_queries: ["Тимур"] })]);
    expect(inactive.kind === "task" && inactive.assignee_id).toBeNull();
    expect(inactive.assignee?.status).toBe("unmatched");
    expect(inactive.blocked).toBe("assignee_unmatched");
  });

  it("removes points worth zero", () => {
    expect(run([points({ amount: 0 })])).toHaveLength(0);
  });

  it("blocks negative points from voice instead of deleting them (D-30)", () => {
    const [entity] = run([points({ amount: -5 })]);
    expect(entity.kind === "points" && entity.amount).toBe(-5);
    expect(entity.blocked).toBe("points_blocked");
  });

  it("blocks any points coming from shared text (D-36)", () => {
    const [entity] = run([points({ amount: 10 })], "shared");
    expect(entity.blocked).toBe("points_blocked");
  });

  it("nulls an unparsable ISO deadline together with its confidence", () => {
    const [entity] = run([task({ deadline_iso: "к пятнице", deadline_confidence: 0.6 })]);
    expect(entity.kind === "task" && entity.deadline_iso).toBeNull();
    expect(entity.kind === "task" && entity.deadline_confidence).toBeNull();
  });

  it("attaches an assignee match to every entity that has assignee fields", () => {
    const [entity] = run([task({ assignee_queries: ["Айгуль"], assignee_id: null })]);
    expect(entity.assignee).toMatchObject({ status: "matched", user_id: "u-005" });
    expect(entity.kind === "task" && entity.assignee_id).toBe("u-005");
    expect(entity.blocked).toBeUndefined();
  });

  it("clears the model id when the bare name has namesakes (D-16, wrong assignee = never)", () => {
    const roster: RosterUser[] = [
      ...ROSTER,
      { id: "u-001", full_name: "Ерлан Байжанов", aliases: ["Ерлан"], is_active: true },
      { id: "u-002", full_name: "Ерлан Досов", aliases: ["Ерлан"], is_active: true },
    ];
    const [entity] = postprocess([task({ assignee_id: "u-001", assignee_queries: ["Ерлану"] })], roster, "voice");
    expect(entity.kind === "task" && entity.assignee_id).toBeNull();
    expect(entity.assignee?.status).toBe("ambiguous");
    expect(entity.blocked).toBe("assignee_unmatched");
  });
});
