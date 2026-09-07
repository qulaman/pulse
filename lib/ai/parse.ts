import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { fewShotMessages } from "./examples";
import { buildSystemBlocks, buildUserMessage, type ParseSource } from "./prompt";
import { ParseResultSchema, type Entity } from "./schema";
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
}

const MAX_TOKENS = 4096;
const ESCALATION_TRANSCRIPT_CHARS = 400;
const ESCALATION_ENTITY_COUNT = 3;
const ESCALATION_CONFIDENCE = 0.6;

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
    const confidences: (number | null)[] = [];
    if ("assignee_confidence" in entity) confidences.push(entity.assignee_confidence);
    if ("deadline_confidence" in entity) confidences.push(entity.deadline_confidence);
    return confidences.some((c) => c !== null && c < ESCALATION_CONFIDENCE);
  });
}

interface CallResult {
  entities: Entity[];
  usage: ParseUsage;
  raw: unknown;
}

async function callModel(
  client: Anthropic,
  model: string,
  input: ParseInput,
  maxTokens: number,
): Promise<CallResult> {
  let message;
  try {
    message = await client.messages.parse({
      model,
      max_tokens: maxTokens,
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
      output_config: { format: zodOutputFormat(ParseResultSchema) },
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
  if (message.parsed_output === null || message.parsed_output === undefined) {
    throw new ParseError("parse_failed", `${model}: пустой structured output`);
  }

  return {
    entities: message.parsed_output.entities,
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
    const target = escalationModel();
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
