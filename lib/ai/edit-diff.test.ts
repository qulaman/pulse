import { describe, expect, it } from "vitest";

import { editDiff } from "./edit-diff";
import type { AnnouncementEntity, Entity, TaskEntity } from "./schema";

function task(overrides: Partial<TaskEntity> = {}): TaskEntity {
  return {
    kind: "task",
    assignee_queries: ["Марат"],
    assignee_id: "u-003",
    assignee_name: null,
    assignee_confidence: 0.95,
    group_id: null,
    title: "КП по Казхрому",
    body: null,
    deadline_iso: "2026-08-14T13:00:00+05:00",
    deadline_confidence: 0.7,
    deadline_source_text: "завтра до обеда",
    priority: "normal",
    scheduled_send_at: null,
    source_span: "Марат, подготовь КП",
    ...overrides,
  };
}

const announcement: AnnouncementEntity = {
  kind: "announcement",
  text: "Завтра планёрка в 9",
  source_span: "Завтра планёрка в 9",
};

describe("editDiff", () => {
  it("untouched batch — no edits", () => {
    const parsed: Entity[] = [task(), announcement];
    expect(editDiff(parsed, [task(), announcement])).toEqual({ was_edited: false, edit_fields: [] });
  });

  it("changed fields are listed per entity index", () => {
    const diff = editDiff(
      [task(), announcement],
      [task({ title: "КП по ССГПО", priority: "high" }), announcement],
    );
    expect(diff.was_edited).toBe(true);
    expect(diff.edit_fields.sort()).toEqual(["entity.0.priority", "entity.0.title"]);
  });

  it("dropped entity", () => {
    expect(editDiff([task(), announcement], [task()])).toEqual({
      was_edited: true,
      edit_fields: ["entity.1.removed"],
    });
  });

  it("added entity, and postprocess service fields are ignored", () => {
    const parsed = [{ ...task(), assignee: { status: "matched" }, blocked: undefined } as unknown as Entity];
    const diff = editDiff(parsed, [task(), announcement]);
    expect(diff).toEqual({ was_edited: true, edit_fields: ["entity.1.added"] });
  });
});
