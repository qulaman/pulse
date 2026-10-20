import { describe, expect, it } from "vitest";

import type { PostprocessedEntity } from "../postprocess";
import { failedCase, passesGates, scoreCase, summarize, type EvalCase } from "./score";

const MARAT = "10000000-0000-4000-8000-000000000003";
const fixtureId = (id: string) => (id === MARAT ? "u-003" : id);

function task(overrides: Partial<Extract<PostprocessedEntity, { kind: "task" }>> = {}): PostprocessedEntity {
  return {
    kind: "task",
    assignee_queries: ["Марат"],
    assignee_id: MARAT,
    assignee_name: "Марат Оспанов",
    assignee_confidence: 0.95,
    group_id: null,
    title: "КП",
    body: null,
    deadline_iso: "2026-08-14T15:00:00+05:00",
    deadline_confidence: 0.95,
    deadline_source_text: "к пятнице к трём",
    priority: "normal",
    scheduled_send_at: null,
    source_span: "Марат, КП к пятнице к трём",
    assignee: { status: "matched", user_id: MARAT, candidates: [], flag: "ok" },
    ...overrides,
  } as PostprocessedEntity;
}

const CASE: EvalCase = {
  id: "t-1",
  source: "voice",
  transcript: "Марат, КП к пятнице к трём",
  frozen_now: "2026-08-13T16:32:00+05:00",
  expected: { entities: [{ kind: "task", assignee_id: "u-003", deadline_iso: "2026-08-14T15:00:00+05:00" }] },
};

describe("parser eval scoring (docs/AI.md §6)", () => {
  it("a right parse is a hit: assignee by fixture id, deadline within 30 minutes", () => {
    const score = scoreCase(CASE, [task({ deadline_iso: "2026-08-14T15:20:00+05:00" })], fixtureId);
    expect(score).toMatchObject({ ok: true, entityHits: 1, assigneeCorrect: 1, deadlineCorrect: 1, splitOk: true, queryOk: true });
  });

  it("a wrong person, a far deadline and an extra entity each fail with a reason", () => {
    const other = task({ assignee: { status: "matched", user_id: "someone", candidates: [], flag: "ok" } });
    const score = scoreCase(CASE, [{ ...other, deadline_iso: "2026-08-15T09:00:00+05:00" } as PostprocessedEntity, task()], fixtureId);
    expect(score.ok).toBe(false);
    // greedy pairing takes the right person first, so the extra entity is the miss
    expect(score.assigneeCorrect).toBe(1);
    expect(score.failures).toContain("сущностей ожидалось 1, получено 2");
  });

  it("summarize: F1 from hits, gates on assignee and F1 only", () => {
    const good = { id: "a", model: "m", escalated: false, latencyMs: 100, ...scoreCase(CASE, [task()], fixtureId), idValid: 1, idTotal: 1, autoOk: 1, autoChecked: 1 };
    const broken = failedCase(CASE, "parse_failed: boom");
    const metrics = summarize([good, broken]);
    expect(metrics.cases).toBe(2);
    expect(metrics.failed).toBe(1);
    expect(metrics.precision).toBe(1);
    expect(metrics.recall).toBe(0.5);
    expect(metrics.f1).toBeCloseTo(2 / 3);
    expect(passesGates(metrics)).toBe(false);
    expect(passesGates(summarize([good]))).toBe(true);
  });

  it("a case that failed counts its checks as missed — an error never lifts the assignee share", () => {
    const broken = failedCase(CASE, "parse_failed: boom");
    expect(broken).toMatchObject({ assigneeChecked: 1, assigneeCorrect: 0, deadlineChecked: 1, deadlineCorrect: 0 });
    const good = { id: "a", model: "m", escalated: false, latencyMs: 100, ...scoreCase(CASE, [task()], fixtureId), idValid: 1, idTotal: 1, autoOk: 1, autoChecked: 1 };
    expect(summarize([good, broken]).assignee).toBe(0.5);
  });
});
