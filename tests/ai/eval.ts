/**
 * Parser evals (docs/AI.md §6, docs/TESTING.md §4).
 *   pnpm eval:parser [--no-escalate] [--filter <prefix>] [--limit N] [--no-gate] [--base <file>]
 *
 * Gates: assignee accuracy >= 97%, entity F1 >= 90%. Exit code 1 below either,
 * unless --no-gate. Every run writes tests/ai/results/YYYY-MM-DD_HHmm.json and
 * diffs against the previous run, or against `--base` (a file in tests/ai/results).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadCorpus } from "../../lib/ai/evals/corpus";
import { parseCost } from "../../lib/ai/pricing";
import { runCase } from "../../lib/ai/evals/run";
import { passesGates, summarize, type CaseResult } from "../../lib/ai/evals/score";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const RESULTS_DIR = join(HERE, "results");

function parseArgs(argv: string[]) {
  const out = { escalate: true, filter: "", limit: 0, gate: true, demoIds: false, base: "" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--no-escalate") out.escalate = false;
    else if (argv[i] === "--no-gate") out.gate = false;
    else if (argv[i] === "--demo-ids") out.demoIds = true;
    else if (argv[i] === "--filter") out.filter = argv[++i] ?? "";
    else if (argv[i] === "--limit") out.limit = Number(argv[++i] ?? 0);
    else if (argv[i] === "--base") out.base = argv[++i] ?? "";
  }
  return out;
}

function loadEnv(): void {
  const file = join(ROOT, ".env.local");
  if (!existsSync(file)) return;
  process.loadEnvFile(file);
}

function previousResult(base: string): { file: string; data: { cases: CaseResult[] } } | null {
  if (!existsSync(RESULTS_DIR)) return null;
  const files = readdirSync(RESULTS_DIR).filter((f) => f.endsWith(".json")).sort();
  const last = base ? files.find((f) => f === base || f === `${base}.json`) : files[files.length - 1];
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
  // scoring and the case run live in lib/ai/evals — the lab's corpus run uses the same (D-138)
  const corpus = loadCorpus(ROOT, { demoIds: args.demoIds });
  let cases = corpus.cases;
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
    const run = await runCase(c, corpus, { escalate: args.escalate });
    const score = run.result;
    results.push(score);
    if (score.error) {
      console.log(`ERR  ${c.id} — ${score.error}`);
      continue;
    }
    if (run.usage) {
      usage.input += run.usage.input_tokens;
      usage.output += run.usage.output_tokens;
      usage.cacheRead += run.usage.cache_read_input_tokens;
      usage.cacheWrite += run.usage.cache_creation_input_tokens;
    }
    // every paid call at its own model's price — an escalated case paid two models
    for (const call of run.calls) cost += parseCost(call.model, call.usage) ?? 0;
    console.log(`${score.ok ? "ok  " : "FAIL"} ${c.id} (${score.model}${score.escalated ? ", escalated" : ""})`);
    for (const f of score.failures) console.log(`       ${f}`);
  }

  const metrics = summarize(results);
  const { assignee, precision, recall, f1, deadline, split, query } = metrics;
  const p50 = metrics.p50LatencyMs;

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  console.log("\n| метрика | значение |");
  console.log("|---|---|");
  console.log(`| кейсов | ${metrics.cases} (провалено ${metrics.failed}) |`);
  console.log(`| assignee accuracy | ${pct(assignee)} (гейт 97%) |`);
  console.log(`| имя исполнителя от модели — из ростера | ${metrics.idValid === null ? "—" : pct(metrics.idValid)} |`);
  console.log(`| исполнитель без чипа «проверь» | ${metrics.autoOk === null ? "—" : pct(metrics.autoOk)} |`);
  console.log(`| entity F1 | ${pct(f1)} (гейт 90%), P ${pct(precision)} / R ${pct(recall)} |`);
  console.log(`| deadline accuracy | ${pct(deadline)} |`);
  console.log(`| полнота мульти-разбиения | ${pct(split)} |`);
  console.log(`| query/command accuracy | ${pct(query)} |`);
  console.log(`| эскалаций | ${metrics.escalated} |`);
  console.log(
    `| токены | вход ${usage.input}, кэш-чтение ${usage.cacheRead}, кэш-запись ${usage.cacheWrite}, выход ${usage.output} |`,
  );
  console.log(`| стоимость прогона | $${cost.toFixed(4)} |`);
  console.log(`| p50 латентности | ${p50} мс |`);

  const previous = previousResult(args.base);
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

  if (args.gate && !passesGates(metrics)) {
    console.error("ГЕЙТ КРАСНЫЙ: assignee < 97% или F1 < 90%.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
