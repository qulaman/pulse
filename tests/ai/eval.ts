/**
 * Parser evals (docs/AI.md §6, docs/TESTING.md §4).
 *   pnpm eval:parser [--no-escalate] [--filter <prefix>] [--limit N] [--no-gate]
 *
 * Gates: assignee accuracy >= 97%, entity F1 >= 90%. Exit code 1 below either,
 * unless --no-gate. Every run writes tests/ai/results/YYYY-MM-DD_HHmm.json and
 * diffs against the previous run.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseTranscript, ParseError } from "../../lib/ai/parse";
import { postprocess, type PostprocessedEntity } from "../../lib/ai/postprocess";
import type { ParseSource } from "../../lib/ai/prompt";
import type { RosterUser } from "../../lib/matchName";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const RESULTS_DIR = join(HERE, "results");

// Estimates in $ per million tokens; cache reads bill at 0.1x input (docs/AI.md §9).
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 2, output: 10 },
};

interface ExpectedEntity {
  kind: string;
  id?: string;
  assignee_id?: string | null;
  deadline_iso?: string | null;
  amount?: number;
  group_with?: string;
}

interface EvalCase {
  id: string;
  source: ParseSource;
  transcript: string;
  frozen_now: string;
  expected: { entities: ExpectedEntity[] };
}

interface CaseResult {
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
}

function parseArgs(argv: string[]) {
  const out = { escalate: true, filter: "", limit: 0, gate: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--no-escalate") out.escalate = false;
    else if (argv[i] === "--no-gate") out.gate = false;
    else if (argv[i] === "--filter") out.filter = argv[++i] ?? "";
    else if (argv[i] === "--limit") out.limit = Number(argv[++i] ?? 0);
  }
  return out;
}

function loadEnv(): void {
  const file = join(ROOT, ".env.local");
  if (!existsSync(file)) return;
  process.loadEnvFile(file);
}

function loadRoster(): RosterUser[] {
  const raw = JSON.parse(readFileSync(join(ROOT, "tests", "stt", "roster.json"), "utf8")) as {
    users: { id: string; full_name: string; aliases: string[] }[];
  };
  return raw.users.map((u) => ({ ...u, is_active: true }));
}

function loadCases(): EvalCase[] {
  return readFileSync(join(HERE, "parser_evals.jsonl"), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as EvalCase);
}

function assigneeIdOf(entity: PostprocessedEntity): string | null {
  return entity.assignee?.status === "matched" ? (entity.assignee.user_id ?? null) : null;
}

/** Greedy match on (kind, assignee after matchName); kind-only fallback keeps recall honest. */
function pair(
  expected: ExpectedEntity[],
  predicted: PostprocessedEntity[],
): { exp: ExpectedEntity; pred: PostprocessedEntity }[] {
  const free = [...predicted];
  const pairs: { exp: ExpectedEntity; pred: PostprocessedEntity }[] = [];

  for (const exp of expected) {
    let index = free.findIndex(
      (p) =>
        p.kind === exp.kind &&
        (exp.assignee_id === undefined || assigneeIdOf(p) === exp.assignee_id),
    );
    if (index === -1) index = free.findIndex((p) => p.kind === exp.kind);
    if (index === -1) continue;
    pairs.push({ exp, pred: free[index] });
    free.splice(index, 1);
  }
  return pairs;
}

function deadlineOf(entity: PostprocessedEntity): string | null {
  if (entity.kind === "task") return entity.deadline_iso;
  if (entity.kind === "reminder") return entity.remind_at_iso;
  return null;
}

function within30Min(a: string, b: string): boolean {
  return Math.abs(Date.parse(a) - Date.parse(b)) <= 30 * 60 * 1000;
}

function groupIdOf(entity: PostprocessedEntity): string | null {
  return entity.kind === "task" ? entity.group_id : null;
}

function scoreCase(c: EvalCase, predicted: PostprocessedEntity[]): Omit<
  CaseResult,
  "id" | "model" | "escalated" | "latencyMs" | "error"
> {
  const failures: string[] = [];
  const pairs = pair(c.expected.entities, predicted);

  let entityHits = 0;
  let assigneeChecked = 0;
  let assigneeCorrect = 0;
  let deadlineChecked = 0;
  let deadlineCorrect = 0;

  for (const { exp, pred } of pairs) {
    const assigneeOk =
      exp.assignee_id === undefined || assigneeIdOf(pred) === (exp.assignee_id ?? null);
    if (exp.assignee_id !== undefined) {
      assigneeChecked++;
      if (assigneeOk) assigneeCorrect++;
      else failures.push(`${exp.kind}: assignee ожидался ${exp.assignee_id}, получен ${assigneeIdOf(pred)}`);
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

function previousResult(): { file: string; data: { cases: CaseResult[] } } | null {
  if (!existsSync(RESULTS_DIR)) return null;
  const files = readdirSync(RESULTS_DIR).filter((f) => f.endsWith(".json")).sort();
  const last = files[files.length - 1];
  if (!last) return null;
  return {
    file: last,
    data: JSON.parse(readFileSync(join(RESULTS_DIR, last), "utf8")) as { cases: CaseResult[] },
  };
}

function stamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}`;
}

async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const roster = loadRoster();
  let cases = loadCases();
  if (args.filter) cases = cases.filter((c) => c.id.startsWith(args.filter));
  if (args.limit > 0) cases = cases.slice(0, args.limit);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY не задан (.env.local) — прогон невозможен.");
    process.exit(2);
  }

  const results: CaseResult[] = [];
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let cost = 0;

  for (const c of cases) {
    const now = new Date(c.frozen_now);
    try {
      const outcome = await parseTranscript({
        transcript: c.transcript,
        source: c.source,
        now,
        roster,
        escalate: args.escalate,
      });
      const predicted = postprocess(outcome.entities, roster, c.source);
      const score = scoreCase(c, predicted);

      usage.input += outcome.usage.input_tokens;
      usage.output += outcome.usage.output_tokens;
      usage.cacheRead += outcome.usage.cache_read_input_tokens;
      usage.cacheWrite += outcome.usage.cache_creation_input_tokens;

      const price = PRICING[outcome.model] ?? PRICING["claude-haiku-4-5"];
      cost +=
        (outcome.usage.input_tokens * price.input +
          outcome.usage.cache_creation_input_tokens * price.input * 1.25 +
          outcome.usage.cache_read_input_tokens * price.input * 0.1 +
          outcome.usage.output_tokens * price.output) /
        1_000_000;

      results.push({
        id: c.id,
        model: outcome.model,
        escalated: outcome.escalated,
        latencyMs: outcome.latencyMs,
        ...score,
      });
      console.log(`${score.ok ? "ok  " : "FAIL"} ${c.id} (${outcome.model}${outcome.escalated ? ", escalated" : ""})`);
      for (const f of score.failures) console.log(`       ${f}`);
    } catch (error) {
      const code = error instanceof ParseError ? error.code : "unknown";
      const cause = (error as { cause?: unknown }).cause;
      const detail = cause instanceof Error ? ` (${cause.name}: ${cause.message})` : "";
      results.push({
        id: c.id,
        ok: false,
        model: "-",
        escalated: false,
        latencyMs: 0,
        entityHits: 0,
        expectedCount: c.expected.entities.length,
        predictedCount: 0,
        assigneeChecked: 0,
        assigneeCorrect: 0,
        deadlineChecked: 0,
        deadlineCorrect: 0,
        splitOk: false,
        queryOk: false,
        failures: [],
        error: `${code}: ${(error as Error).message}${detail}`,
      });
      console.log(`ERR  ${c.id} — ${code}: ${(error as Error).message}${detail}`);
    }
  }

  const sum = (pick: (r: CaseResult) => number) => results.reduce((a, r) => a + pick(r), 0);
  const hits = sum((r) => r.entityHits);
  const expectedTotal = sum((r) => r.expectedCount);
  const predictedTotal = sum((r) => r.predictedCount);
  const precision = predictedTotal ? hits / predictedTotal : 0;
  const recall = expectedTotal ? hits / expectedTotal : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const assigneeChecked = sum((r) => r.assigneeChecked);
  const assignee = assigneeChecked ? sum((r) => r.assigneeCorrect) / assigneeChecked : 1;
  const deadlineChecked = sum((r) => r.deadlineChecked);
  const deadline = deadlineChecked ? sum((r) => r.deadlineCorrect) / deadlineChecked : 1;
  const split = results.length ? results.filter((r) => r.splitOk).length / results.length : 0;
  const query = results.length ? results.filter((r) => r.queryOk).length / results.length : 0;
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const p50 = latencies.length ? latencies[Math.floor(latencies.length / 2)] : 0;

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  console.log("\n| метрика | значение |");
  console.log("|---|---|");
  console.log(`| кейсов | ${results.length} (провалено ${results.filter((r) => !r.ok).length}) |`);
  console.log(`| assignee accuracy | ${pct(assignee)} (гейт 97%) |`);
  console.log(`| entity F1 | ${pct(f1)} (гейт 90%), P ${pct(precision)} / R ${pct(recall)} |`);
  console.log(`| deadline accuracy | ${pct(deadline)} |`);
  console.log(`| полнота мульти-разбиения | ${pct(split)} |`);
  console.log(`| query/command accuracy | ${pct(query)} |`);
  console.log(`| эскалаций | ${results.filter((r) => r.escalated).length} |`);
  console.log(
    `| токены | вход ${usage.input}, кэш-чтение ${usage.cacheRead}, кэш-запись ${usage.cacheWrite}, выход ${usage.output} |`,
  );
  console.log(`| стоимость прогона | $${cost.toFixed(4)} |`);
  console.log(`| p50 латентности | ${p50} мс |`);

  const previous = previousResult();
  if (previous) {
    const was = new Map(previous.data.cases.map((r) => [r.id, r.ok]));
    const broke = results.filter((r) => !r.ok && was.get(r.id) === true).map((r) => r.id);
    const fixed = results.filter((r) => r.ok && was.get(r.id) === false).map((r) => r.id);
    console.log(`\ndiff к ${previous.file}: сломалось [${broke.join(", ")}], починилось [${fixed.join(", ")}]`);
  }

  mkdirSync(RESULTS_DIR, { recursive: true });
  // Minute-resolution stamps collide when two runs land in the same minute — never
  // let a second run (a --filter probe, say) overwrite the run of record.
  const base = stamp(new Date());
  let outFile = join(RESULTS_DIR, `${base}.json`);
  for (let n = 2; existsSync(outFile); n++) outFile = join(RESULTS_DIR, `${base}-${n}.json`);
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        ran_at: new Date().toISOString(),
        options: args,
        metrics: { assignee, precision, recall, f1, deadline, split, query, p50LatencyMs: p50 },
        usage,
        cost_usd: Number(cost.toFixed(4)),
        cases: results,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  console.log(`\nрезультат: ${outFile}`);

  if (args.gate && (assignee < 0.97 || f1 < 0.9)) {
    console.error("ГЕЙТ КРАСНЫЙ: assignee < 97% или F1 < 90%.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
