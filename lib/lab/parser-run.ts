import "server-only";

import { z } from "zod";

import { ParseError, type ParseCall } from "@/lib/ai/parse";
import { parseCost } from "@/lib/ai/pricing";
import type { RunModel } from "@/lib/lab/parser";
import { PARSER_MODELS, type CompanySettings } from "@/lib/settings";

/** The sandbox and the corpus run of the lab's «Парсер» (D-138): shared server pieces. */

/** A model to try instead of the company's; absent — the company's own switches. */
export const RunModelSchema = z.strictObject({
  model: z.enum(PARSER_MODELS),
  escalate: z.boolean(),
  escalation_model: z.enum(PARSER_MODELS),
});

export function runModel(settings: CompanySettings, override: RunModel | undefined): RunModel {
  return override ?? settings.parser;
}

/** Every paid call priced; one call without a price makes the total unknown, never a guess. */
export function callsCost(calls: ParseCall[]): number | null {
  let total = 0;
  for (const call of calls) {
    const cost = parseCost(call.model, call.usage);
    if (cost === null) return null;
    total += cost;
  }
  return total;
}

/** What the lab says when a parse failed — the code and the provider's status, never a key. */
export function parseErrorText(error: unknown): string {
  if (!(error instanceof ParseError)) return "Разбор не удался";
  const cause = error.cause as { status?: unknown } | undefined;
  const status = typeof cause?.status === "number" ? ` (HTTP ${cause.status})` : "";
  return `${error.message}${status}`;
}
