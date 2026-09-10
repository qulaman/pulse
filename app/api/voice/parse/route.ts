import { z } from "zod";

import { withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { DEFAULT_PARSER_MODEL, ParseError, parseTranscript } from "@/lib/ai/parse";
import { postprocess, type PostprocessedEntity } from "@/lib/ai/postprocess";
import { loadRoster } from "@/lib/roster";
import { createServiceSupabase } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/types";

export const maxDuration = 60;

const BodySchema = z.strictObject({
  transcript: z.string().min(1),
  audio_path: z.string().nullable().optional(), // typed input has no recording
  source: z.enum(["voice", "typed", "shared"]),
  client_request_id: z.uuid(),
  /** Guard verdict from /transcribe: low speech density (AI.md §1 (ж)). */
  suspicious: z.boolean().optional(),
});

const SUSPICIOUS_CONFIDENCE_CAP = 0.5;

/**
 * A transcript the guard flagged may carry a hallucinated but perfectly valid
 * roster name — the matcher cannot catch that, so every assignee is forced to
 * the yellow "проверь" chip and blocked from silent send (AI.md §1 (ж)).
 */
function capSuspicious(entities: PostprocessedEntity[]): PostprocessedEntity[] {
  return entities.map((entity) => {
    if (!("assignee_confidence" in entity)) return entity;
    const capped = { ...entity } as PostprocessedEntity & { assignee_confidence: number };
    capped.assignee_confidence = Math.min(capped.assignee_confidence, SUSPICIOUS_CONFIDENCE_CAP);
    if (capped.assignee) capped.assignee = { ...capped.assignee, flag: "check" };
    return capped;
  });
}

export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director"],
  async ({ profile, body }) => {
    const supabase = createServiceSupabase();
    const logRow = {
      company_id: profile.companyId,
      user_id: profile.userId,
      kind: "parse" as const,
      source: body.source,
      provider: "anthropic",
      client_request_id: body.client_request_id,
      transcript: body.transcript,
    };

    // Idempotency (AI.md §10): a double FAB tap must not buy tokens twice.
    const previous = await supabase
      .from("ai_logs")
      .select("parsed_entities, model")
      .eq("company_id", profile.companyId)
      .eq("client_request_id", body.client_request_id)
      .eq("kind", "parse")
      .eq("status", "ok")
      .maybeSingle();

    if (previous.data?.parsed_entities) {
      return apiOk({
        entities: previous.data.parsed_entities,
        model: previous.data.model,
        escalated: false,
        latency_ms: 0,
      });
    }

    const roster = await loadRoster(profile.companyId);

    let outcome;
    try {
      outcome = await parseTranscript({
        transcript: body.transcript,
        source: body.source,
        now: new Date(),
        roster,
      });
    } catch (error) {
      const code = error instanceof ParseError ? error.code : "parse_failed";
      await supabase.from("ai_logs").insert({
        ...logRow,
        model: DEFAULT_PARSER_MODEL,
        status: `error:${code}`,
      });
      if (code === "parse_refused") {
        return apiError(422, "parse_refused", "Не разобрал, что нужно сделать", {
          transcript: body.transcript,
        });
      }
      return apiError(502, "parse_failed", "Распознал текст, но не разобрал", {
        transcript: body.transcript,
      });
    }

    const entities = body.suspicious
      ? capSuspicious(postprocess(outcome.entities, roster, body.source))
      : postprocess(outcome.entities, roster, body.source);

    const raw = outcome.raw as { usage?: Json; stop_reason?: Json } | null;
    await supabase.from("ai_logs").insert({
      ...logRow,
      model: outcome.model,
      parsed_entities: entities,
      input_tokens: outcome.usage.input_tokens,
      output_tokens: outcome.usage.output_tokens,
      cache_read_tokens: outcome.usage.cache_read_input_tokens,
      parse_ms: outcome.latencyMs,
      latency_ms: outcome.latencyMs,
      status: "ok",
      // Never the whole answer: the entities are already stored above.
      raw_response: { usage: raw?.usage ?? null, stop_reason: raw?.stop_reason ?? null },
    });

    if (entities.length > 0) {
      await supabase
        .from("inbox_items")
        .update({ status: "parsed", entities })
        .eq("company_id", profile.companyId)
        .eq("client_request_id", body.client_request_id);
    }

    // entities: [] is not an error — the frontend shows the raw transcript (parse_empty).
    return apiOk({
      entities,
      model: outcome.model,
      escalated: outcome.escalated,
      latency_ms: outcome.latencyMs,
    });
  },
  BodySchema,
);
