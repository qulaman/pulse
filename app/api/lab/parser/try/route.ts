import { z } from "zod";

import { withAuth } from "@/lib/api/handler";
import { apiOk } from "@/lib/api/respond";
import { parseTranscript } from "@/lib/ai/parse";
import { postprocess } from "@/lib/ai/postprocess";
import { normalizeRules, PARSER_RULES_MAX } from "@/lib/ai/rules";
import type { TryResponse, TrySide } from "@/lib/lab/parser";
import { callsCost, parseErrorText, runModel, RunModelSchema } from "@/lib/lab/parser-run";
import { loadCompanySettings, loadRoster } from "@/lib/roster";
import { activeParserRules, parseCompanySettings } from "@/lib/settings";

export const maxDuration = 60;

/**
 * The lab's sandbox (D-138): one phrase through the parser with the draft rules and, side by
 * side, with the rules in force — the company's roster, conventions, kinds and matcher, nothing
 * written anywhere. Not an ai_logs row: the lab's cost table is the director's real parses,
 * and harvest (`pnpm eval:harvest`) must not mistake a probe for the director's speech.
 */

const BodySchema = z.strictObject({
  transcript: z.string().trim().min(1).max(2000),
  rules: z.string().max(PARSER_RULES_MAX * 2),
  compare: z.boolean().default(true),
  run: RunModelSchema.optional(),
});

export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director", "secretary"],
  async ({ profile, body }) => {
    const [rawSettings, roster] = await Promise.all([loadCompanySettings(profile.companyId), loadRoster(profile.companyId)]);
    const settings = parseCompanySettings(rawSettings);
    const model = runModel(settings, body.run);
    const draft = normalizeRules(body.rules).slice(0, PARSER_RULES_MAX);
    const current = activeParserRules(settings.parser_rules).text;
    const now = new Date();

    const side = async (rules: string): Promise<TrySide> => {
      try {
        const outcome = await parseTranscript({
          transcript: body.transcript,
          source: "typed",
          now,
          roster,
          model: model.model,
          escalate: model.escalate,
          escalationModel: model.escalation_model,
          conventions: settings.conventions,
          rules,
          kinds: settings.parser.kinds,
        });
        return {
          ok: true,
          entities: postprocess(outcome.entities, roster, "typed", settings.matching),
          model: outcome.model,
          escalated: outcome.escalated,
          latency_ms: outcome.latencyMs,
          cost_usd: callsCost(outcome.calls),
          tokens: {
            input: outcome.usage.input_tokens,
            cache_read: outcome.usage.cache_read_input_tokens,
            cache_write: outcome.usage.cache_creation_input_tokens,
            output: outcome.usage.output_tokens,
          },
        };
      } catch (error) {
        return { ok: false, error: parseErrorText(error) };
      }
    };

    const [draftSide, currentSide] = await Promise.all([
      side(draft),
      body.compare && draft !== current ? side(current) : Promise.resolve(null),
    ]);
    const response: TryResponse = { draft: draftSide, current: currentSide };
    return apiOk(response);
  },
  BodySchema,
);
