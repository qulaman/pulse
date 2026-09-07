import { describe, expect, it } from "vitest";

import rosterFixture from "../../tests/stt/roster.json";
import { FEW_SHOT, fewShotMessages } from "./examples";
import { ParseResultSchema } from "./schema";

const ROSTER_IDS = new Set(rosterFixture.users.map((u) => u.id));

describe("FEW_SHOT", () => {
  it("every assistant answer validates against the entity schema", () => {
    for (const pair of FEW_SHOT) {
      expect(() => ParseResultSchema.parse(pair.assistant)).not.toThrow();
    }
  });

  it("every assignee_id exists in the demo roster", () => {
    const ids = FEW_SHOT.flatMap((pair) =>
      pair.assistant.entities.flatMap((e) =>
        "assignee_id" in e && e.assignee_id !== null ? [e.assignee_id] : [],
      ),
    );
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(ROSTER_IDS).toContain(id);
  });

  it("П8 splits one phrase into two tasks sharing a group_id", () => {
    const last = FEW_SHOT[FEW_SHOT.length - 1].assistant.entities;
    const tasks = last.filter((e) => e.kind === "task");
    expect(tasks).toHaveLength(2);
    expect(tasks[0].kind === "task" && tasks[0].group_id).toBeTruthy();
    expect(tasks[0].kind === "task" && tasks[1].kind === "task" && tasks[0].group_id).toBe(
      tasks[1].kind === "task" ? tasks[1].group_id : undefined,
    );
    expect(new Set(tasks.map((t) => (t.kind === "task" ? t.assignee_id : null))).size).toBe(2);
  });
});

describe("fewShotMessages", () => {
  it("alternates roles and caches only the last assistant turn", () => {
    const messages = fewShotMessages();
    expect(messages).toHaveLength(FEW_SHOT.length * 2);
    messages.forEach((m, i) => expect(m.role).toBe(i % 2 === 0 ? "user" : "assistant"));

    const cached = messages.filter((m) =>
      Array.isArray(m.content) ? m.content.some((b) => "cache_control" in b && b.cache_control) : false,
    );
    expect(cached).toHaveLength(1);
    expect(cached[0]).toBe(messages[messages.length - 1]);
  });
});
