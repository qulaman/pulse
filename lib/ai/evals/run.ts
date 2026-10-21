import type Anthropic from "@anthropic-ai/sdk";

import type { MatchingConfig } from "../config";
import type { Convention } from "../conventions";
import type { ParserKind } from "../kinds/names";
import { parseTranscript, ParseError, type ParseCall, type ParseUsage } from "../parse";
import { postprocess } from "../postprocess";
import type { Corpus } from "./corpus";
import { failedCase, scoreCase, type CaseResult, type EvalCase } from "./score";

/**
 * One corpus case through the parser the way `/api/voice/parse` runs it — minus the route,
 * the errand matcher and the pinned person (docs/AI.md §6). The CLI and the lab (D-138)
 * call this, so both runs score the same pipeline.
 */

export interface RunOptions {
  model?: string;
  escalate?: boolean;
  escalationModel?: string;
  /** The corpus is written against the default table (D-15) — leave unset to keep it so. */
  conventions?: Convention[];
  rules?: string;
  /** The company's kinds in the lab (task 026); the CLI leaves it unset — every kind. */
  kinds?: readonly ParserKind[];
  matching?: Partial<MatchingConfig>;
  client?: Anthropic;
}

export interface CaseRun {
  result: CaseResult;
  usage: ParseUsage | null;
  calls: ParseCall[];
}

export async function runCase(c: EvalCase, corpus: Corpus, options: RunOptions = {}): Promise<CaseRun> {
  try {
    const outcome = await parseTranscript({
      transcript: c.transcript,
      source: c.source,
      now: new Date(c.frozen_now),
      roster: corpus.roster,
      model: options.model,
      escalate: options.escalate,
      escalationModel: options.escalationModel,
      conventions: options.conventions,
      rules: options.rules,
      kinds: options.kinds,
      client: options.client,
    });
    // the model's own pick before postprocess: a full_name copied from the roster (D-56)
    const rosterNames = new Set(corpus.roster.map((u) => u.full_name));
    const rawNames = outcome.entities.flatMap((e) =>
      "assignee_name" in e && e.assignee_name !== null ? [e.assignee_name] : [],
    );
    const predicted = postprocess(outcome.entities, corpus.roster, c.source, options.matching);
    const matched = predicted.filter((e) => e.assignee?.status === "matched");
    return {
      result: {
        id: c.id,
        model: outcome.model,
        escalated: outcome.escalated,
        latencyMs: outcome.latencyMs,
        ...scoreCase(c, predicted, corpus.fixtureId),
        idValid: rawNames.filter((name) => rosterNames.has(name)).length,
        idTotal: rawNames.length,
        autoOk: matched.filter((e) => e.assignee?.flag === "ok").length,
        autoChecked: matched.length,
      },
      usage: outcome.usage,
      calls: outcome.calls,
    };
  } catch (error) {
    const code = error instanceof ParseError ? error.code : "unknown";
    const cause = (error as { cause?: unknown }).cause;
    const detail = cause instanceof Error ? ` (${cause.name}: ${cause.message})` : "";
    return { result: failedCase(c, `${code}: ${(error as Error).message}${detail}`), usage: null, calls: [] };
  }
}
