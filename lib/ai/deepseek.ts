import type Anthropic from "@anthropic-ai/sdk";

import { ParseError } from "./errors";
import type { TokenUsage } from "./pricing";

/**
 * DeepSeek as a parser provider for the lab comparison (D-63): the same system
 * prompt, roster, few-shot pairs and user message as the Claude call, sent to the
 * OpenAI-compatible chat endpoint in JSON mode. Structured outputs do not exist
 * there, so the JSON Schema travels inside the system prompt and the zod check
 * at the caller is the only enforcement.
 */

export const DEEPSEEK_MODELS = ["deepseek-chat", "deepseek-reasoner"] as const;

export function isDeepSeekModel(model: string): boolean {
  return model.startsWith("deepseek-");
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function blocksToText(content: Anthropic.MessageParam["content"]): string {
  if (typeof content === "string") return content;
  return content.map((block) => (block.type === "text" ? block.text : "")).join("");
}

/** The Anthropic-shaped request flattened to chat messages; the schema closes the system prompt. */
export function toChatMessages(
  system: Anthropic.TextBlockParam[],
  messages: Anthropic.MessageParam[],
  schema: unknown,
): ChatMessage[] {
  const systemText =
    system.map((block) => block.text).join("\n\n") +
    "\n\n## Формат ответа\nОтвечай ТОЛЬКО одним JSON-объектом по этой JSON Schema, без markdown и без текста вокруг:\n" +
    JSON.stringify(schema);
  return [
    { role: "system", content: systemText },
    ...messages.map((message) => ({ role: message.role, content: blocksToText(message.content) })),
  ];
}

export interface DeepSeekUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number };
}

/** Cache hits map to cache reads; DeepSeek has no cache-write class. */
export function readDeepSeekUsage(usage: DeepSeekUsage | undefined): TokenUsage {
  const prompt = usage?.prompt_tokens ?? 0;
  const hit = usage?.prompt_cache_hit_tokens ?? 0;
  return {
    input_tokens: usage?.prompt_cache_miss_tokens ?? Math.max(prompt - hit, 0),
    output_tokens: usage?.completion_tokens ?? 0,
    cache_read_input_tokens: hit,
    cache_creation_input_tokens: 0,
  };
}

interface ChatCompletion {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: DeepSeekUsage;
}

export interface DeepSeekCall {
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  timeoutMs: number;
}

export interface DeepSeekResult {
  text: string;
  finishReason: string | undefined;
  usage: TokenUsage;
  reasoningTokens: number;
  raw: { usage: DeepSeekUsage | null; stop_reason: string | null };
}

const ENDPOINT = "https://api.deepseek.com/chat/completions";

export async function callDeepSeek(call: DeepSeekCall): Promise<DeepSeekResult> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new ParseError("parse_failed", `${call.model}: DEEPSEEK_API_KEY не задан`);

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: call.model,
        messages: call.messages,
        max_tokens: call.maxTokens,
        response_format: { type: "json_object" },
        stream: false,
      }),
      signal: AbortSignal.timeout(call.timeoutMs),
    });
  } catch (cause) {
    throw new ParseError("parse_failed", `${call.model}: вызов парсера не удался`, { cause });
  }
  if (!res.ok) {
    // The body may quote the request; the status alone is enough for ai_logs.
    throw new ParseError("parse_failed", `${call.model}: HTTP ${res.status}`);
  }
  const json = (await res.json()) as ChatCompletion;
  const choice = json.choices?.[0];
  return {
    text: choice?.message?.content ?? "",
    finishReason: choice?.finish_reason,
    usage: readDeepSeekUsage(json.usage),
    reasoningTokens: json.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    raw: { usage: json.usage ?? null, stop_reason: choice?.finish_reason ?? null },
  };
}
