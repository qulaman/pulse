import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { resolveMatchingConfig, type MatchingConfig } from "../config";
import { DEFAULT_CONVENTIONS } from "../conventions";
import { FEW_SHOT } from "../examples";
import { parserSystemPrompt } from "../prompt";
import { ENTITIES_JSON_SCHEMA } from "../schema";
import { summarize, type CaseResult, type EvalMetrics } from "./score";

/**
 * The lab runs the corpus in pieces (one function call has 60 s), so a save cannot just
 * trust the numbers the page sends back (D-138). Every piece comes back signed by the
 * server over the company and a fingerprint of everything the parse depends on; the save
 * checks the signatures, that the pieces cover the whole corpus, and recomputes the metrics
 * itself. A deploy that changed the core prompt, a new model in the settings or an edited
 * corpus changes the fingerprint — the old run no longer counts.
 */

export interface RunConfig {
  rules: string;
  model: string;
  escalate: boolean;
  escalationModel: string;
  matching?: Partial<MatchingConfig>;
  corpusHash: string;
}

export function runFingerprint(config: RunConfig): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        system: parserSystemPrompt(DEFAULT_CONVENTIONS, config.rules),
        fewShot: FEW_SHOT,
        schema: ENTITIES_JSON_SCHEMA,
        model: config.model,
        escalation: config.escalate ? config.escalationModel : null,
        matching: resolveMatchingConfig(config.matching),
        corpus: config.corpusHash,
      }),
    )
    .digest("hex");
}

/** What one piece of a run says; signed as the exact string the client gets. */
export interface RunPiece {
  fingerprint: string;
  ran_at: string;
  results: CaseResult[];
  cost_usd: number | null;
}

export interface SignedPiece {
  payload: string;
  stamp: string;
}

/** Never the key itself: a key derived for this one purpose. */
export function evalSecret(): string {
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing — corpus runs cannot be signed");
  return createHash("sha256").update(`pulse:parser-eval:${base}`).digest("hex");
}

function mac(secret: string, companyId: string, payload: string): Buffer {
  return createHmac("sha256", secret).update(companyId).update("\n").update(payload).digest();
}

export function signPiece(secret: string, companyId: string, piece: RunPiece): SignedPiece {
  const payload = JSON.stringify(piece);
  return { payload, stamp: mac(secret, companyId, payload).toString("hex") };
}

export type CollectedRun =
  | { ok: true; results: CaseResult[]; metrics: EvalMetrics; costUsd: number | null }
  | { ok: false; reason: "forged" | "stale" | "incomplete" };

/**
 * The pieces as one run: every stamp genuine, every piece of this fingerprint, every corpus
 * case exactly once. A case run twice (a retried piece) keeps its first result.
 */
export function collectRun(
  secret: string,
  companyId: string,
  fingerprint: string,
  caseIds: readonly string[],
  pieces: readonly SignedPiece[],
): CollectedRun {
  const byId = new Map<string, CaseResult>();
  let cost: number | null = 0;
  for (const piece of pieces) {
    const expected = mac(secret, companyId, piece.payload);
    const given = Buffer.from(piece.stamp, "hex");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "forged" };
    const parsed = JSON.parse(piece.payload) as RunPiece;
    if (parsed.fingerprint !== fingerprint) return { ok: false, reason: "stale" };
    for (const result of parsed.results) if (!byId.has(result.id)) byId.set(result.id, result);
    cost = cost === null || parsed.cost_usd === null ? null : cost + parsed.cost_usd;
  }
  if (caseIds.some((id) => !byId.has(id))) return { ok: false, reason: "incomplete" };
  const results = caseIds.map((id) => byId.get(id)!);
  return { ok: true, results, metrics: summarize(results), costUsd: cost };
}
