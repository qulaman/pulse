import { describe, expect, it } from "vitest";

import rosterFixture from "../../tests/stt/roster.json";
import { FEW_SHOT, fewShotMessages } from "./examples";
import { ModelParseResultSchema } from "./schema";

const ROSTER_NAMES = new Set(rosterFixture.users.map((u) => u.full_name));

describe("FEW_SHOT", () => {
  it("every assistant answer validates against the model's schema — the one the API enforces", () => {
    for (const pair of FEW_SHOT) {
      expect(() => ModelParseResultSchema.parse(pair.assistant)).not.toThrow();
    }
  });

  // D-56: the model names people, never ids — an example with an id would teach it to copy ids.
  it("every assignee_name exists in the demo roster and no example carries an id", () => {
    const names = FEW_SHOT.flatMap((pair) =>
      pair.assistant.entities.flatMap((e) =>
        "assignee_name" in e && e.assignee_name !== null ? [e.assignee_name] : [],
      ),
    );
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(ROSTER_NAMES).toContain(name);
    expect(JSON.stringify(FEW_SHOT)).not.toMatch(/"(assignee_id|participant_ids)"/);
  });

  it("П8 splits one phrase into two tasks sharing a group_id", () => {
    const last = FEW_SHOT.find((pair) => pair.user.startsWith("Ерлану Б. и Марату"))!.assistant.entities;
    const tasks = last.filter((e) => e.kind === "task");
    expect(tasks).toHaveLength(2);
    expect(tasks[0].kind === "task" && tasks[0].group_id).toBeTruthy();
    expect(tasks[0].kind === "task" && tasks[1].kind === "task" && tasks[0].group_id).toBe(
      tasks[1].kind === "task" ? tasks[1].group_id : undefined,
    );
    expect(new Set(tasks.map((t) => (t.kind === "task" ? t.assignee_name : null))).size).toBe(2);
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
