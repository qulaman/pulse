import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { loadCorpus } from "@/lib/ai/evals/corpus";
import { runCase, type CaseRun } from "@/lib/ai/evals/run";
import { failedCase } from "@/lib/ai/evals/score";
import { evalSecret, runFingerprint, signPiece } from "@/lib/ai/evals/stamp";
import { normalizeRules, PARSER_RULES_MAX } from "@/lib/ai/rules";
import { EVAL_PIECE_MAX, type EvalPieceResponse } from "@/lib/lab/parser";
import { callsCost, runModel, RunModelSchema } from "@/lib/lab/parser-run";
import { loadCompanySettings } from "@/lib/roster";
import { parseCompanySettings } from "@/lib/settings";

export const maxDuration = 60;

// A case still parsing by then is a failed case of a signed piece, not a killed function.
const PIECE_DEADLINE_MS = 50_000;

/**
 * One piece of the lab's corpus run (D-138): a few cases of `tests/ai/parser_evals.jsonl`
 * through the parser with the draft rules, scored exactly as `pnpm eval:parser` scores
 * them, and signed — the save (`PUT /api/lab/parser`) takes only signed pieces of this
 * fingerprint. The corpus keeps its own roster and the default conventions, as in the CLI;
 * the model, the kinds and the matcher are the company's, or a model the lab is comparing.
 */

const BodySchema = z.strictObject({
  rules: z.string().max(PARSER_RULES_MAX * 2),
  ids: z.array(z.string().min(1)).min(1).max(EVAL_PIECE_MAX),
  run: RunModelSchema.optional(),
});

export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director", "secretary"],
  async ({ profile, body }) => {
    const settings = parseCompanySettings(await loadCompanySettings(profile.companyId));
    const corpus = loadCorpus();
    const cases = body.ids.map((id) => corpus.cases.find((c) => c.id === id));
    if (cases.some((c) => c === undefined)) return apiError(400, "unknown_case", "В корпусе нет такого кейса");

    const model = runModel(settings, body.run);
    const rules = normalizeRules(body.rules).slice(0, PARSER_RULES_MAX);
    // one try less than the voice route: a piece has to land inside the function's minute
    const client = new Anthropic({ timeout: 20_000, maxRetries: 1 });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<"late">((resolve) => {
      timer = setTimeout(() => resolve("late"), PIECE_DEADLINE_MS);
    });
    const runs = await Promise.all(
      cases.map(async (c): Promise<CaseRun> => {
        const run = await Promise.race([
          runCase(c!, corpus, {
            model: model.model,
            escalate: model.escalate,
            escalationModel: model.escalation_model,
            rules,
            kinds: settings.parser.kinds,
            matching: settings.matching,
            client,
          }),
          late,
        ]);
        return run === "late" ? { result: failedCase(c!, "timeout: разбор не уложился в минуту функции"), usage: null, calls: [] } : run;
      }),
    );
    clearTimeout(timer);

    let cost: number | null = 0;
    for (const run of runs) {
      const each = callsCost(run.calls);
      cost = cost === null || each === null ? null : cost + each;
    }

    const piece: EvalPieceResponse = signPiece(evalSecret(), profile.companyId, {
      fingerprint: runFingerprint({
        rules,
        model: model.model,
        escalate: model.escalate,
        escalationModel: model.escalation_model,
        matching: settings.matching,
        kinds: settings.parser.kinds,
        corpusHash: corpus.hash,
      }),
      ran_at: new Date().toISOString(),
      results: runs.map((run) => run.result),
      cost_usd: cost,
    });
    return apiOk(piece);
  },
  BodySchema,
);
