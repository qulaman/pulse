/**
 * Harvest confirmed parses into eval-fixture drafts (docs/AI.md §6, §10; D-35).
 *   pnpm eval:harvest [--days N] [--all]
 *
 * Reads ai_logs (kind=parse, status=ok, confirmed) from the instance in .env.local
 * with the service role. What the director CONFIRMED is the label; what the model
 * PARSED is the prediction — so a row with was_edited=true is a ready-made regression
 * case. Rows land in tests/ai/harvest/<date>.jsonl for a human to review and move into
 * parser_evals.jsonl (never appended blindly: client speech is data, not a fixture).
 * Also prints the D-35 edit ratio per day — the pilot's stop signal.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { toAqtobeIso } from "../../lib/ai/time";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const OUT_DIR = join(HERE, "harvest");

interface Args {
  days: number;
  all: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { days: 14, all: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--days") out.days = Number(argv[++i] ?? 14);
    else if (argv[i] === "--all") out.all = true;
  }
  return out;
}

type Row = {
  id: string;
  source: "voice" | "typed" | "shared" | null;
  transcript: string | null;
  parsed_entities: unknown;
  confirmed_entities: unknown;
  was_edited: boolean | null;
  edit_fields: string[] | null;
  created_at: string;
};

interface ExpectedEntity {
  kind: string;
  assignee_id?: string | null;
  deadline_iso?: string | null;
  amount?: number;
}

/** Demo-roster ids by full name: fixtures speak u-003, the instance speaks uuids. */
function demoIdsByName(): Map<string, string> {
  const raw = JSON.parse(readFileSync(join(ROOT, "tests", "stt", "roster.json"), "utf8")) as {
    users: { id: string; full_name: string }[];
  };
  return new Map(raw.users.map((u) => [u.full_name, u.id]));
}

function expectedOf(
  entities: unknown,
  nameOf: Map<string, string>,
  demoIds: Map<string, string>,
  unmapped: Set<string>,
): ExpectedEntity[] {
  if (!Array.isArray(entities)) return [];
  return entities.map((raw) => {
    const e = raw as Record<string, unknown>;
    const out: ExpectedEntity = { kind: String(e.kind) };
    if ("assignee_id" in e) {
      const id = e.assignee_id as string | null;
      if (id === null) out.assignee_id = null;
      else {
        const name = nameOf.get(id);
        const demo = name ? demoIds.get(name) : undefined;
        if (demo) out.assignee_id = demo;
        else unmapped.add(name ?? id); // stays unchecked; the reviewer decides
      }
    }
    const deadline = (e.deadline_iso ?? e.remind_at_iso) as string | null | undefined;
    if (deadline !== undefined) {
      out.deadline_iso = deadline === null ? null : toAqtobeIso(new Date(deadline));
    }
    if (e.kind === "points" && typeof e.amount === "number") out.amount = e.amount;
    return out;
  });
}

async function main(): Promise<void> {
  const envFile = join(ROOT, ".env.local");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY не заданы (.env.local).");
    process.exit(2);
  }
  const args = parseArgs(process.argv.slice(2));
  const supabase = createClient(url, key);
  const since = new Date(Date.now() - args.days * 86_400_000).toISOString();

  const logs = await supabase
    .from("ai_logs")
    .select("id, source, transcript, parsed_entities, confirmed_entities, was_edited, edit_fields, created_at")
    .eq("kind", "parse")
    .eq("status", "ok")
    .not("confirmed_entities", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (logs.error) throw new Error(`ai_logs read failed: ${logs.error.message}`);
  const rows = (logs.data ?? []) as Row[];

  const people = await supabase.from("profiles").select("id, full_name");
  if (people.error) throw new Error(`profiles read failed: ${people.error.message}`);
  const nameOf = new Map((people.data ?? []).map((p) => [p.id, p.full_name]));
  const demoIds = demoIdsByName();

  // D-35: share of confirmations the director had to edit, per day.
  const byDay = new Map<string, { edited: number; total: number }>();
  for (const row of rows) {
    const day = toAqtobeIso(new Date(row.created_at)).slice(0, 10);
    const bucket = byDay.get(day) ?? { edited: 0, total: 0 };
    bucket.total++;
    if (row.was_edited) bucket.edited++;
    byDay.set(day, bucket);
  }
  console.log(`подтверждённых разборов за ${args.days} дн.: ${rows.length}`);
  console.log("| день | подтверждено | правок | доля |");
  console.log("|---|---|---|---|");
  for (const [day, b] of [...byDay.entries()].sort()) {
    const share = b.total ? Math.round((b.edited / b.total) * 100) : 0;
    const flag = share > 40 ? " ⚠ стоп-сигнал D-35" : share >= 20 ? " (выше нормы)" : "";
    console.log(`| ${day} | ${b.total} | ${b.edited} | ${share}%${flag} |`);
  }

  const picked = args.all ? rows : rows.filter((r) => r.was_edited);
  const unmapped = new Set<string>();
  const lines = picked
    .filter((r) => r.transcript)
    .map((r) => {
      const expected = expectedOf(r.confirmed_entities, nameOf, demoIds, unmapped);
      const frozen = toAqtobeIso(new Date(r.created_at));
      return JSON.stringify({
        id: `h-${frozen.slice(0, 10).replace(/-/g, "")}-${r.id.slice(0, 6)}`,
        source: r.source ?? "voice",
        transcript: r.transcript,
        frozen_now: frozen,
        expected: { entities: expected },
        _review: { was_edited: r.was_edited ?? false, edit_fields: r.edit_fields ?? [] },
      });
    });

  if (!lines.length) {
    console.log(args.all ? "нечего выгружать" : "правок не было — нечего выгружать (--all выгрузит все подтверждённые)");
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`);
  writeFileSync(file, lines.join("\n") + "\n");
  console.log(`\nчерновики фикстур: ${file} (${lines.length} шт.) — проверить и перенести в parser_evals.jsonl без поля _review`);
  if (unmapped.size) {
    console.log(`исполнители вне демо-ростера (assignee не проверяется): ${[...unmapped].join(", ")}`);
  }
}

// exitCode, not exit(): on Windows an immediate exit trips libuv while the HTTP keep-alive closes.
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
