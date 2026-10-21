import { createHash } from "node:crypto";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { casesForKinds, loadCorpus } from "@/lib/ai/evals/corpus";
import { passesGates } from "@/lib/ai/evals/score";
import { collectRun, evalSecret, runFingerprint } from "@/lib/ai/evals/stamp";
import { fewShotMessages } from "@/lib/ai/examples";
import { isDeepSeekModel } from "@/lib/ai/deepseek";
import { buildSystemBlocks, buildUserMessage, parserSystemPrompt, rosterJson } from "@/lib/ai/prompt";
import { normalizeRules, PARSER_GATES, PARSER_RULES_HISTORY_MAX, PARSER_RULES_MAX } from "@/lib/ai/rules";
import { pct } from "@/lib/lab/format";
import type { ParserLabState } from "@/lib/lab/parser";
import { loadCompanySettings, loadRoster } from "@/lib/roster";
import {
  activeParserRules,
  parseCompanySettings,
  type ParserRules,
  type ParserRulesVersion,
} from "@/lib/settings";
import type { Json } from "@/lib/supabase/types";

/**
 * «Парсер» in the lab (D-138): what the model sees, the company's own rules and their
 * versions. GET is the tab's state; PUT saves a new version of the rules — only after a
 * corpus run of exactly that text passed the gates (`/api/lab/parser/eval`), or an empty
 * text, which is the core prompt `pnpm eval:parser` measures. The director and the
 * secretary, as everywhere in the lab.
 */

const COUNT_TIMEOUT_MS = 3_000;

// The count changes only with the prompt: one ask per text per server instance.
const counted = new Map<string, number>();

/** The whole prefix by Claude's count — free, but a dead key or a slow API just means «—». */
async function countPromptTokens(
  model: string,
  system: Anthropic.TextBlockParam[],
  shots: Anthropic.MessageParam[],
): Promise<number | null> {
  const key = createHash("sha256").update(JSON.stringify({ model, system, shots })).digest("hex");
  const known = counted.get(key);
  if (known !== undefined) return known;
  try {
    const client = new Anthropic({ timeout: COUNT_TIMEOUT_MS, maxRetries: 0 });
    const result = await client.messages.countTokens({
      model: isDeepSeekModel(model) ? "claude-haiku-4-5" : model,
      system,
      messages: [...shots, { role: "user", content: buildUserMessage({ transcript: "…", source: "voice", now: new Date() }) }],
    });
    if (counted.size > 50) counted.clear();
    counted.set(key, result.input_tokens);
    return result.input_tokens;
  } catch {
    return null;
  }
}

function answerText(content: Anthropic.MessageParam["content"]): string {
  const raw = typeof content === "string" ? content : content.map((block) => ("text" in block ? block.text : "")).join("");
  try {
    return JSON.stringify(JSON.parse(raw), null, 1);
  } catch {
    return raw;
  }
}

export const GET = withAuth(["director", "secretary"], async ({ profile }) => {
  const [rawSettings, roster] = await Promise.all([loadCompanySettings(profile.companyId), loadRoster(profile.companyId)]);
  const settings = parseCompanySettings(rawSettings);
  const active = activeParserRules(settings.parser_rules);
  const corpus = loadCorpus();

  // what the company's parse sends: its conventions, rules and kinds (D-138, task 026)
  const kinds = settings.parser.kinds;
  const system = buildSystemBlocks(roster, settings.conventions, active.text, kinds);
  const messages = fewShotMessages(kinds);
  const examples: ParserLabState["prompt"]["examples"] = [];
  for (let i = 0; i + 1 < messages.length; i += 2) {
    const user = messages[i].content;
    examples.push({ user: typeof user === "string" ? user : "", answer: answerText(messages[i + 1].content) });
  }

  const body: ParserLabState = {
    parser: settings.parser,
    versions: settings.parser_rules.versions,
    prompt: {
      system: parserSystemPrompt(settings.conventions, active.text, kinds),
      roster: rosterJson(roster),
      rosterSize: roster.length,
      examples,
      tokens: await countPromptTokens(settings.parser.model, system, messages),
    },
    // the cases of the company's kinds: a kind switched off is not what its rules are checked on
    corpus: { cases: casesForKinds(corpus.cases, kinds).map((c) => ({ id: c.id, transcript: c.transcript })) },
    gates: PARSER_GATES,
  };
  return apiOk(body);
});

const SaveSchema = z.strictObject({
  text: z.string().max(PARSER_RULES_MAX * 2),
  client_request_id: z.uuid(),
  /** The version the page saw in force: someone else's save in between is a conflict, not a loss. */
  base_version: z.number().int().min(0),
  pieces: z
    .array(z.strictObject({ payload: z.string().max(200_000), stamp: z.string().max(128) }))
    .max(40)
    .default([]),
});

const RUN_PROBLEM: Record<"forged" | "stale" | "incomplete", string> = {
  forged: "Прогон не сходится. Проверь на корпусе ещё раз",
  stale: "С прогона поменялась модель, промпт или корпус. Проверь ещё раз",
  incomplete: "Прогон неполный. Проверь на корпусе ещё раз",
};

export const PUT = withAuth<z.infer<typeof SaveSchema>>(
  ["director", "secretary"],
  async ({ req, profile, body }) => {
    const settings = parseCompanySettings(await loadCompanySettings(profile.companyId));
    const rules = settings.parser_rules;
    // a retried save is the save that already happened
    if (rules.request_id === body.client_request_id) return apiOk({ versions: rules.versions });

    const head = rules.versions[0]?.version ?? 0;
    if (body.base_version !== head) {
      return apiError(409, "conflict", "Правила только что поменялись. Открой вкладку заново и проверь ещё раз");
    }

    const text = normalizeRules(body.text);
    if (text.length > PARSER_RULES_MAX) return apiError(400, "too_long", `Не длиннее ${PARSER_RULES_MAX} знаков`);
    if (text === activeParserRules(rules).text) return apiError(409, "unchanged", "Эти правила уже действуют");

    let evalSummary: ParserRulesVersion["eval"] = null;
    if (text) {
      const corpus = loadCorpus();
      const fingerprint = runFingerprint({
        rules: text,
        model: settings.parser.model,
        escalate: settings.parser.escalate,
        escalationModel: settings.parser.escalation_model,
        matching: settings.matching,
        kinds: settings.parser.kinds,
        corpusHash: corpus.hash,
      });
      const run = collectRun(
        evalSecret(),
        profile.companyId,
        fingerprint,
        casesForKinds(corpus.cases, settings.parser.kinds).map((c) => c.id),
        body.pieces,
      );
      if (!run.ok) return apiError(422, `eval_${run.reason}`, RUN_PROBLEM[run.reason]);
      if (!passesGates(run.metrics)) {
        return apiError(
          422,
          "eval_gate",
          `Правила не прошли пороги: исполнитель ${pct(run.metrics.assignee)} (нужно ${pct(PARSER_GATES.assignee)}), F1 ${pct(run.metrics.f1)} (нужно ${pct(PARSER_GATES.f1)})`,
        );
      }
      evalSummary = {
        cases: run.metrics.cases,
        failed: run.metrics.failed,
        assignee: run.metrics.assignee,
        f1: run.metrics.f1,
        deadline: run.metrics.deadline,
        model: settings.parser.model,
        cost_usd: run.costUsd,
      };
    }

    const version: ParserRulesVersion = {
      version: head + 1,
      text,
      saved_at: new Date().toISOString(),
      saved_by: profile.userId,
      saved_by_name: profile.fullName,
      eval: evalSummary,
    };
    const next: ParserRules = {
      versions: [version, ...rules.versions].slice(0, PARSER_RULES_HISTORY_MAX),
      request_id: body.client_request_id,
    };

    // the caller's own identity: update_company_settings checks the role and the company
    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("update_company_settings", { patch: { parser_rules: next } as unknown as Json });
    if (error) {
      if (error.message.includes("forbidden")) return apiError(403, "forbidden", "Нет доступа");
      throw new Error(`parser rules save failed: ${error.message}`);
    }
    return apiOk({ versions: parseCompanySettings(data).parser_rules.versions });
  },
  SaveSchema,
);
