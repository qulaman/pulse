import type { PostprocessedEntity } from "../postprocess";
import type { ParseSource } from "../prompt";
import { PARSER_GATES } from "../rules";

/**
 * Parser eval scoring (docs/AI.md §6): one corpus case against what the parser and
 * postprocess made of it. Pure — `pnpm eval:parser` and the lab's corpus run (D-138) both
 * score with it, so a number on the page means what it means in a results file.
 */

export interface ExpectedEntity {
  kind: string;
  /** Another kind that reads the phrase as fairly (a booking beside a weekly meeting: once or every time). */
  also?: string[];
  id?: string;
  assignee_id?: string | null;
  deadline_iso?: string | null;
  amount?: number;
  group_with?: string;
  /** A repeating order (D-148): the step and days the phrase named, the deadline of each day. */
  every?: string;
  weekdays?: number[];
  month_day?: number;
  interval?: number;
  due_time?: string;
  /** A meeting series (D-148): "none" for a single meeting. */
  repeat?: string;
}

export interface EvalCase {
  id: string;
  source: ParseSource;
  transcript: string;
  frozen_now: string;
  expected: { entities: ExpectedEntity[] };
}

export interface CaseResult {
  id: string;
  ok: boolean;
  model: string;
  escalated: boolean;
  latencyMs: number;
  entityHits: number;
  expectedCount: number;
  predictedCount: number;
  assigneeChecked: number;
  assigneeCorrect: number;
  deadlineChecked: number;
  deadlineCorrect: number;
  splitOk: boolean;
  queryOk: boolean;
  failures: string[];
  error?: string;
  /** model ids that exist in the roster, before postprocess repairs them (D-56) */
  idValid: number;
  idTotal: number;
  /** matched assignees the director sees without a yellow «проверь» chip */
  autoOk: number;
  autoChecked: number;
}

/** Production ids → the fixture ids the corpus expects (u-003). */
export type FixtureId = (id: string) => string;

function assigneeIdOf(entity: PostprocessedEntity, fixtureId: FixtureId): string | null {
  const id = entity.assignee?.status === "matched" ? (entity.assignee.user_id ?? null) : null;
  return id === null ? null : fixtureId(id);
}

/** Greedy match on (kind, assignee after matchName); kind-only fallback keeps recall honest. */
function pair(
  expected: ExpectedEntity[],
  predicted: PostprocessedEntity[],
  fixtureId: FixtureId,
): { exp: ExpectedEntity; pred: PostprocessedEntity }[] {
  const free = [...predicted];
  const pairs: { exp: ExpectedEntity; pred: PostprocessedEntity }[] = [];

  for (const exp of expected) {
    const kindOk = (p: PostprocessedEntity) => p.kind === exp.kind || (exp.also?.includes(p.kind) ?? false);
    let index = free.findIndex(
      (p) => kindOk(p) && (exp.assignee_id === undefined || assigneeIdOf(p, fixtureId) === exp.assignee_id),
    );
    if (index === -1) index = free.findIndex(kindOk);
    if (index === -1) continue;
    pairs.push({ exp, pred: free[index] });
    free.splice(index, 1);
  }
  return pairs;
}

function deadlineOf(entity: PostprocessedEntity): string | null {
  if (entity.kind === "task") return entity.deadline_iso;
  if (entity.kind === "reminder") return entity.remind_at_iso;
  // a meeting's moment lives in its own field, and expected.deadline_iso checks it (D-78)
  if (entity.kind === "event") return entity.starts_at_iso;
  return null;
}

/** What a repeating order or a meeting series got wrong of what the case names (D-148). */
function ruleFailures(exp: ExpectedEntity, pred: PostprocessedEntity): string[] {
  const out: string[] = [];
  if (pred.kind === "recurrence") {
    const checks: [keyof ExpectedEntity, unknown][] = [
      ["every", pred.every],
      ["interval", pred.interval],
      ["month_day", pred.month_day],
      ["due_time", pred.due_time],
    ];
    for (const [field, actual] of checks) {
      if (exp[field] !== undefined && exp[field] !== actual) out.push(`recurrence: ${field} ожидался ${exp[field]}, получен ${actual}`);
    }
    if (exp.weekdays !== undefined && exp.weekdays.join(",") !== pred.weekdays.join(",")) {
      out.push(`recurrence: weekdays ожидались [${exp.weekdays}], получены [${pred.weekdays}]`);
    }
  }
  if (pred.kind === "event" && exp.repeat !== undefined && exp.repeat !== pred.repeat) {
    out.push(`event: repeat ожидался ${exp.repeat}, получен ${pred.repeat}`);
  }
  return out;
}

function within30Min(a: string, b: string): boolean {
  return Math.abs(Date.parse(a) - Date.parse(b)) <= 30 * 60 * 1000;
}

function groupIdOf(entity: PostprocessedEntity): string | null {
  return entity.kind === "task" ? entity.group_id : null;
}

export type CaseScore = Omit<
  CaseResult,
  "id" | "model" | "escalated" | "latencyMs" | "error" | "idValid" | "idTotal" | "autoOk" | "autoChecked"
>;

export function scoreCase(c: EvalCase, predicted: PostprocessedEntity[], fixtureId: FixtureId): CaseScore {
  const failures: string[] = [];
  const pairs = pair(c.expected.entities, predicted, fixtureId);
  // an expected entity nothing of its kind answered is a miss even when the count agrees —
  // «в понедельник» heard as a repeating order used to pass with the F1 alone showing it (D-148)
  for (const exp of c.expected.entities) {
    if (!pairs.some((p) => p.exp === exp)) failures.push(`${exp.kind}: не найдена (${predicted.map((e) => e.kind).join(", ") || "ничего"})`);
  }

  let entityHits = 0;
  let assigneeChecked = 0;
  let assigneeCorrect = 0;
  let deadlineChecked = 0;
  let deadlineCorrect = 0;

  for (const { exp, pred } of pairs) {
    const assigneeOk =
      exp.assignee_id === undefined || assigneeIdOf(pred, fixtureId) === (exp.assignee_id ?? null);
    if (exp.assignee_id !== undefined) {
      assigneeChecked++;
      if (assigneeOk) assigneeCorrect++;
      else failures.push(`${exp.kind}: assignee ожидался ${exp.assignee_id}, получен ${assigneeIdOf(pred, fixtureId)}`);
    }
    if (assigneeOk) entityHits++;

    if (exp.deadline_iso !== undefined) {
      deadlineChecked++;
      const actual = deadlineOf(pred);
      const ok =
        exp.deadline_iso === null
          ? actual === null
          : actual !== null && within30Min(actual, exp.deadline_iso);
      if (ok) deadlineCorrect++;
      else failures.push(`${exp.kind}: дедлайн ожидался ${exp.deadline_iso}, получен ${actual}`);
    }

    if (exp.amount !== undefined) {
      const actual = pred.kind === "points" ? pred.amount : null;
      if (actual !== exp.amount) failures.push(`points: amount ожидался ${exp.amount}, получен ${actual}`);
    }

    failures.push(...ruleFailures(exp, pred));
  }

  const countOk = predicted.length === c.expected.entities.length;
  if (!countOk) {
    failures.push(`сущностей ожидалось ${c.expected.entities.length}, получено ${predicted.length}`);
  }

  // group_with: two expected entities must land on the same group_id.
  let groupOk = true;
  for (const { exp, pred } of pairs) {
    if (!exp.group_with) continue;
    const other = pairs.find((p) => p.exp.id === exp.group_with);
    if (!other || groupIdOf(pred) === null || groupIdOf(pred) !== groupIdOf(other.pred)) {
      groupOk = false;
      failures.push(`group_id не совпал для ${exp.id ?? exp.kind} и ${exp.group_with}`);
    }
  }

  const expectQuery = c.expected.entities.some((e) => e.kind === "query");
  const gotQuery = predicted.some((e) => e.kind === "query");
  const queryOk = expectQuery === gotQuery;
  if (!queryOk) failures.push(`query: ожидалось ${expectQuery}, получено ${gotQuery}`);

  return {
    ok: failures.length === 0,
    entityHits,
    expectedCount: c.expected.entities.length,
    predictedCount: predicted.length,
    assigneeChecked,
    assigneeCorrect,
    deadlineChecked,
    deadlineCorrect,
    splitOk: countOk && groupOk,
    queryOk,
    failures,
  };
}

/**
 * A case the parser never answered: nothing hit, and every check it carried counts as missed —
 * a failure must never leave the assignee or deadline share higher than a wrong answer would.
 */
export function failedCase(c: EvalCase, error: string): CaseResult {
  return {
    id: c.id,
    ok: false,
    model: "-",
    escalated: false,
    latencyMs: 0,
    entityHits: 0,
    expectedCount: c.expected.entities.length,
    predictedCount: 0,
    assigneeChecked: c.expected.entities.filter((e) => e.assignee_id !== undefined).length,
    assigneeCorrect: 0,
    deadlineChecked: c.expected.entities.filter((e) => e.deadline_iso !== undefined).length,
    deadlineCorrect: 0,
    splitOk: false,
    queryOk: false,
    failures: [],
    idValid: 0,
    idTotal: 0,
    autoOk: 0,
    autoChecked: 0,
    error,
  };
}

export interface EvalMetrics {
  cases: number;
  failed: number;
  assignee: number;
  precision: number;
  recall: number;
  f1: number;
  deadline: number;
  split: number;
  query: number;
  escalated: number;
  p50LatencyMs: number;
  /** null when no case named anyone */
  idValid: number | null;
  autoOk: number | null;
}

export function summarize(results: CaseResult[]): EvalMetrics {
  const sum = (pick: (r: CaseResult) => number) => results.reduce((a, r) => a + pick(r), 0);
  const hits = sum((r) => r.entityHits);
  const expectedTotal = sum((r) => r.expectedCount);
  const predictedTotal = sum((r) => r.predictedCount);
  const precision = predictedTotal ? hits / predictedTotal : 0;
  const recall = expectedTotal ? hits / expectedTotal : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const assigneeChecked = sum((r) => r.assigneeChecked);
  const deadlineChecked = sum((r) => r.deadlineChecked);
  const idTotal = sum((r) => r.idTotal);
  const autoChecked = sum((r) => r.autoChecked);
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  return {
    cases: results.length,
    failed: results.filter((r) => !r.ok).length,
    assignee: assigneeChecked ? sum((r) => r.assigneeCorrect) / assigneeChecked : 1,
    precision,
    recall,
    f1,
    deadline: deadlineChecked ? sum((r) => r.deadlineCorrect) / deadlineChecked : 1,
    split: results.length ? results.filter((r) => r.splitOk).length / results.length : 0,
    query: results.length ? results.filter((r) => r.queryOk).length / results.length : 0,
    escalated: results.filter((r) => r.escalated).length,
    p50LatencyMs: latencies.length ? latencies[Math.floor(latencies.length / 2)] : 0,
    idValid: idTotal ? sum((r) => r.idValid) / idTotal : null,
    autoOk: autoChecked ? sum((r) => r.autoOk) / autoChecked : null,
  };
}

/** The two gates of CLAUDE.md §5; the deadline share is reported, not gated. */
export function passesGates(metrics: Pick<EvalMetrics, "assignee" | "f1">): boolean {
  return metrics.assignee >= PARSER_GATES.assignee && metrics.f1 >= PARSER_GATES.f1;
}
