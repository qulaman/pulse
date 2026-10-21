import type { EvalMetrics } from "@/lib/ai/evals/score";
import type { SignedPiece } from "@/lib/ai/evals/stamp";
import type { PostprocessedEntity } from "@/lib/ai/postprocess";
import type { PARSER_GATES } from "@/lib/ai/rules";
import type { CompanySettings, ParserRulesVersion } from "@/lib/settings";

/**
 * The lab's «Парсер» tab (D-138): what the page and `/api/lab/parser*` exchange. Types and
 * plain helpers only — the page stays free of zod and the SDK (D-126).
 */

export interface ParserLabState {
  /** The company's model switches — the same section as «Модели» and «Настройки». */
  parser: CompanySettings["parser"];
  /** Newest first; `versions[0]` is what the parser runs with. */
  versions: ParserRulesVersion[];
  prompt: {
    /** The system text exactly as the next parse sends it: core, the company's conventions, its rules. */
    system: string;
    /** The second system block: the active roster, sorted by id. */
    roster: string;
    rosterSize: number;
    /** The few-shot pairs as sent: the user turn and the model's answer. */
    examples: { user: string; answer: string }[];
    /** System + roster + examples, by Claude's count; null when the count did not answer. */
    tokens: number | null;
  };
  /** The corpus a save is checked on (`tests/ai/parser_evals.jsonl`): the cases of the company's kinds, in file order. */
  corpus: { cases: { id: string; transcript: string }[] };
  gates: typeof PARSER_GATES;
}

export interface TryTokens {
  input: number;
  cache_read: number;
  cache_write: number;
  output: number;
}

export type TrySide =
  | {
      ok: true;
      entities: PostprocessedEntity[];
      model: string;
      escalated: boolean;
      latency_ms: number;
      cost_usd: number | null;
      tokens: TryTokens;
    }
  | { ok: false; error: string };

export interface TryResponse {
  draft: TrySide;
  /** The same phrase on the rules in force — absent when the draft is those rules. */
  current: TrySide | null;
}

/** A run on a model other than the company's — the lab can compare, only the company's own run saves. */
export interface RunModel {
  model: string;
  escalate: boolean;
  escalation_model: string;
}

export type EvalPieceResponse = SignedPiece;

/** Cases per call — a piece must finish well inside a function's 60 s, escalations included. */
export const EVAL_PIECE_SIZE = 6;
/** Pieces in flight at once: twelve parses, gentle on the provider's rate limit. */
export const EVAL_PARALLEL = 2;
export const EVAL_PIECE_MAX = 8;

export function piecesOf<T>(items: readonly T[], size: number = EVAL_PIECE_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type { EvalMetrics };
