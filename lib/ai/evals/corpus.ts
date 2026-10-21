import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import type { ParserKind } from "../kinds/names";
import type { RosterUser } from "../../matchName";
import type { EvalCase, FixtureId } from "./score";

/**
 * The parser corpus on disk (docs/AI.md §6): the cases and the demo roster they are
 * written against. Read from the repository root — `pnpm eval:parser` passes it, a route
 * reads `process.cwd()`, where next.config traces both files in (D-138).
 */

export const CORPUS_FILE = "tests/ai/parser_evals.jsonl";
export const CORPUS_ROSTER_FILE = "tests/stt/roster.json";

export interface Corpus {
  cases: EvalCase[];
  roster: RosterUser[];
  fixtureId: FixtureId;
  /** Changes with any case or roster edit — a run on an old corpus is not this corpus's run. */
  hash: string;
}

/**
 * Production rosters carry uuids, and the few-shot examples carry u-0NN ids the model
 * happily copies (D-56) — a run on the demo ids never sees that. Real ids are the
 * default; `demoIds` keeps the fixtures' own ids for comparison with old runs.
 */
export function loadCorpus(root: string = process.cwd(), options: { demoIds?: boolean } = {}): Corpus {
  // a corpus run asks for it a dozen times; the files change only with a commit (or an edit in dev)
  const key = `${root}|${options.demoIds ? 1 : 0}|${statSync(join(root, CORPUS_FILE)).mtimeMs}|${statSync(join(root, CORPUS_ROSTER_FILE)).mtimeMs}`;
  const known = loaded.get(key);
  if (known) return known;
  const corpus = readCorpus(root, options);
  loaded.clear();
  loaded.set(key, corpus);
  return corpus;
}

const loaded = new Map<string, Corpus>();

function readCorpus(root: string, options: { demoIds?: boolean }): Corpus {
  const casesText = readFileSync(join(root, CORPUS_FILE), "utf8");
  const rosterText = readFileSync(join(root, CORPUS_ROSTER_FILE), "utf8");

  const cases = casesText
    .replace(/\r\n?/g, "\n")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as EvalCase);

  const back = new Map<string, string>();
  const raw = JSON.parse(rosterText) as { users: { id: string; full_name: string; aliases: string[] }[] };
  const roster = raw.users.map((u, index) => {
    const id = options.demoIds ? u.id : `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    back.set(id, u.id);
    return { ...u, id, is_active: true };
  });

  const hash = createHash("sha256")
    .update(casesText.replace(/\r\n?/g, "\n"))
    .update("\0")
    .update(rosterText.replace(/\r\n?/g, "\n"))
    .digest("hex");

  return { cases, roster, fixtureId: (id) => back.get(id) ?? id, hash };
}

/**
 * The cases a company's run is scored on (task 026, acceptance): those whose expected kinds
 * are all among the kinds the company has on. A kind switched off is one the model never
 * answers with, so a case expecting it would fail for the right reason — and keep the
 * company's rules from ever passing the gates. A case expecting nothing stays.
 */
export function casesForKinds(cases: readonly EvalCase[], kinds: readonly ParserKind[]): EvalCase[] {
  const on = new Set<string>(kinds);
  return cases.filter((c) => c.expected.entities.every((e) => on.has(e.kind)));
}
