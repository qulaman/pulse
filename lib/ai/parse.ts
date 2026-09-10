import Anthropic from "@anthropic-ai/sdk";

import { fewShotMessages } from "./examples";
import { buildSystemBlocks, buildUserMessage, type ParseSource } from "./prompt";
import { ENTITIES_JSON_SCHEMA, ParseResultSchema, type Entity } from "./schema";
import type { RosterUser } from "../matchName";

export type ParseErrorCode = "parse_refused" | "parse_failed";

/** Frontend error contract (docs/AI.md §11). Carries no prompt content and no keys. */
export class ParseError extends Error {
  readonly code: ParseErrorCode;

  constructor(code: ParseErrorCode, message: string, options: { cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "ParseError";
    this.code = code;
  }
}

export interface ParseUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface ParseOutcome {
  entities: Entity[];
  model: string;
  escalated: boolean;
  usage: ParseUsage;
  latencyMs: number;
  raw: unknown;
}

export interface ParseInput {
  transcript: string;
  source: ParseSource;
  now: Date;
  roster: RosterUser[];
  model?: string;
  client?: Anthropic;
  escalate?: boolean;
  /** Overrides PARSER_ESCALATION_MODEL (company.settings.parser.escalation_model). */
  escalationModel?: string;
}

const MAX_TOKENS = 4096;
const ESCALATION_TRANSCRIPT_CHARS = 400;
const ESCALATION_ENTITY_COUNT = 3;
const ESCALATION_ASSIGNEE_CONFIDENCE = 0.6;
// Conventions from the table legitimately carry 0.5–0.6 («на неделе» = 0.5), so only a
// deadline below the table's floor is a sign of a shaky parse.
const ESCALATION_DEADLINE_CONFIDENCE = 0.5;

export const DEFAULT_PARSER_MODEL = "claude-haiku-4-5";
export const DEFAULT_ESCALATION_MODEL = "claude-sonnet-5";

function parserModel(override?: string): string {
  return override ?? process.env.PARSER_MODEL ?? DEFAULT_PARSER_MODEL;
}

function escalationModel(): string {
  return process.env.PARSER_ESCALATION_MODEL ?? DEFAULT_ESCALATION_MODEL;
}

function emptyUsage(): ParseUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
}

function readUsage(usage: Anthropic.Usage | undefined): ParseUsage {
  return {
    input_tokens: usage?.input_tokens ?? 0,
    output_tokens: usage?.output_tokens ?? 0,
    cache_read_input_tokens: usage?.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? 0,
  };
}

function addUsage(a: ParseUsage, b: ParseUsage): ParseUsage {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
    cache_creation_input_tokens: a.cache_creation_input_tokens + b.cache_creation_input_tokens,
  };
}

/**
 * Escalation triggers (docs/AI.md §8) — checked on the Haiku result before /confirm
 * is shown, so the director never sees the weaker parse.
 */
function needsEscalation(transcript: string, entities: Entity[]): boolean {
  if (transcript.length > ESCALATION_TRANSCRIPT_CHARS) return true;
  if (entities.length > ESCALATION_ENTITY_COUNT) return true;
  return entities.some((entity) => {
    if ("assignee_confidence" in entity && entity.assignee_confidence < ESCALATION_ASSIGNEE_CONFIDENCE) {
      return true;
    }
    return (
      "deadline_confidence" in entity &&
      entity.deadline_confidence !== null &&
      entity.deadline_confidence < ESCALATION_DEADLINE_CONFIDENCE
    );
  });
}

interface CallResult {
  entities: Entity[];
  usage: ParseUsage;
  raw: unknown;
}

/** Extraction with eight few-shot pairs needs no reasoning; thinking only adds seconds (D-43). */
function thinkingFor(model: string): Anthropic.ThinkingConfigParam | undefined {
  return model.includes("haiku-4-5") ? undefined : { type: "disabled" };
}

async function callModel(
  client: Anthropic,
  model: string,
  input: ParseInput,
  maxTokens: number,
): Promise<CallResult> {
  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model,
      max_tokens: maxTokens,
      thinking: thinkingFor(model),
      system: buildSystemBlocks(input.roster),
      messages: [
        ...fewShotMessages(),
        {
          role: "user",
          content: buildUserMessage({
            transcript: input.transcript,
            source: input.source,
            now: input.now,
          }),
        },
      ],
      output_config: { format: { type: "json_schema", schema: ENTITIES_JSON_SCHEMA } },
    });
  } catch (cause) {
    throw new ParseError("parse_failed", `${model}: вызов парсера не удался`, { cause });
  }

  if (message.stop_reason === "refusal") {
    throw new ParseError("parse_refused", `${model}: модель отказалась разбирать транскрипт`);
  }
  if (message.stop_reason === "max_tokens") {
    if (maxTokens >= MAX_TOKENS * 2) {
      throw new ParseError("parse_failed", `${model}: ответ не уместился в max_tokens`);
    }
    return callModel(client, model, input, maxTokens * 2);
  }
  const text = message.content.find((block) => block.type === "text")?.text ?? "";
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (cause) {
    throw new ParseError("parse_failed", `${model}: structured output не является JSON`, { cause });
  }
  // The API enforces the schema; this is the safety net and the typed boundary.
  const parsed = ParseResultSchema.safeParse(json);
  if (!parsed.success) {
    throw new ParseError(
      "parse_failed",
      `${model}: ответ не прошёл схему (${parsed.error.issues.length} issue(s))`,
      { cause: parsed.error },
    );
  }

  return {
    entities: parsed.data.entities,
    usage: readUsage(message.usage),
    raw: message,
  };
}

/**
 * Structured outputs guarantee the response shape, so there is no repair-retry here:
 * only refusal, max_tokens and transport failures are handled (docs/AI.md §3, §11).
 */
export async function parseTranscript(input: ParseInput): Promise<ParseOutcome> {
  const client = input.client ?? new Anthropic({ timeout: 20_000, maxRetries: 2 });
  const model = parserModel(input.model);
  const startedAt = Date.now();

  const first = await callModel(client, model, input, MAX_TOKENS);
  let usage = addUsage(emptyUsage(), first.usage);

  const escalate = input.escalate ?? true;
  if (escalate && needsEscalation(input.transcript, first.entities)) {
    const target = input.escalationModel ?? escalationModel();
    const second = await callModel(client, target, input, MAX_TOKENS);
    usage = addUsage(usage, second.usage);
    return {
      entities: second.entities,
      model: target,
      escalated: true,
      usage,
      latencyMs: Date.now() - startedAt,
      raw: second.raw,
    };
  }

  return {
    entities: first.entities,
    model,
    escalated: false,
    usage,
    latencyMs: Date.now() - startedAt,
    raw: first.raw,
  };
}
