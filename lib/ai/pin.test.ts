import { describe, expect, it } from "vitest";

import { pinAssignee } from "./pin";
import { postprocess, type PostprocessedEntity } from "./postprocess";
import type { AnnouncementEntity, TaskEntity } from "./schema";
import type { RosterUser } from "../matchName";

const ROSTER: RosterUser[] = [
  { id: "u-erlan-b", full_name: "Ерлан Бекмуханов", aliases: [], is_active: true },
  { id: "u-erlan-d", full_name: "Ерлан Досанов", aliases: [], is_active: true },
  { id: "u-askhat", full_name: "Асхат Нурланов", aliases: ["Асхат"], is_active: true },
  { id: "u-gone", full_name: "Тимур Салимов", aliases: [], is_active: false },
];

function task(overrides: Partial<TaskEntity> = {}): TaskEntity {
  return {
    kind: "task",
    assignee_queries: [],
    assignee_id: null,
    assignee_name: null,
    assignee_confidence: 0,
    group_id: null,
    title: "Подготовить КП",
    body: null,
    deadline_iso: null,
    deadline_confidence: null,
    deadline_source_text: null,
    priority: "normal",
    scheduled_send_at: null,
    source_span: "подготовь КП",
    ...overrides,
  };
}

const announcement: AnnouncementEntity = { kind: "announcement", text: "Завтра собрание", source_span: "всем: завтра собрание" } as AnnouncementEntity;

const process = (entities: (TaskEntity | AnnouncementEntity)[]) => postprocess(entities, ROSTER, "voice");
const who = (entity: PostprocessedEntity) => (entity as { assignee_id?: string | null }).assignee_id;

describe("pinAssignee", () => {
  it("a task without a name gets the chosen person, green and sendable", () => {
    const [entity] = pinAssignee(process([task()]), ROSTER, "u-erlan-d");
    expect(who(entity!)).toBe("u-erlan-d");
    expect(entity!.assignee).toEqual({ status: "matched", user_id: "u-erlan-d", candidates: [], flag: "ok" });
    expect(entity!.blocked).toBeUndefined();
    expect((entity as { assignee_name: string }).assignee_name).toBe("Ерлан Досанов");
  });

  it("two people with one first name: the glued «Ерлан, » is a coin toss, the tap is not", () => {
    const heard = process([task({ assignee_queries: ["Ерлан"], assignee_name: "Ерлан Бекмуханов", assignee_confidence: 0.9 })]);
    expect(who(heard[0]!)).not.toBe("u-erlan-d");
    const [pinned] = pinAssignee(heard, ROSTER, "u-erlan-d");
    expect(who(pinned!)).toBe("u-erlan-d");
    expect(pinned!.blocked).toBeUndefined();
  });

  it("somebody else named out loud keeps their task", () => {
    const heard = process([
      task(),
      task({ title: "Привезти образцы", assignee_queries: ["Асхату"], assignee_name: "Асхат Нурланов", assignee_confidence: 0.95 }),
    ]);
    const pinned = pinAssignee(heard, ROSTER, "u-erlan-d");
    expect(pinned.map(who)).toEqual(["u-erlan-d", "u-askhat"]);
  });

  it("leaves the kinds without one person alone", () => {
    const pinned = pinAssignee(process([announcement]), ROSTER, "u-erlan-d");
    expect(pinned[0]).not.toHaveProperty("assignee_id");
  });

  it("no pin, or a pin on somebody who has left, changes nothing", () => {
    const heard = process([task()]);
    expect(pinAssignee(heard, ROSTER, null)).toBe(heard);
    expect(pinAssignee(heard, ROSTER, "u-gone")).toBe(heard);
    expect(pinAssignee(heard, ROSTER, "u-nobody")).toBe(heard);
  });
});
