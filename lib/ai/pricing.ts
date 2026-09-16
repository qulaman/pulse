/**
 * List prices used by the lab page to turn ai_logs token counts into dollars
 * (docs/AI.md §9). Verified against the vendors' price pages on 2026-09-16;
 * an unknown model costs nothing rather than something made up.
 */

/** $ per million tokens. */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  // DeepSeek bills a cache hit at a tenth of a miss and has no write surcharge;
  // reasoning tokens are part of the output count.
  "deepseek-chat": { input: 0.28, output: 0.42, cacheRead: 0.028, cacheWrite: 0.28 },
  "deepseek-reasoner": { input: 0.28, output: 0.42, cacheRead: 0.028, cacheWrite: 0.28 },
};

/** $ per minute of audio, keyed by the STT provider name written to ai_logs. */
export const STT_PRICE_PER_MINUTE: Record<string, number> = {
  "openai-4o": 0.006,
  whisper1: 0.006,
  deepgram: 0.0077,
  elevenlabs: 0.0067,
};

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

const MILLION = 1_000_000;

/** Dollars for one model call; null when the model has no price on file. */
export function parseCost(model: string, usage: TokenUsage): number | null {
  const price = MODEL_PRICES[model];
  if (!price) return null;
  return (
    (usage.input_tokens * price.input +
      usage.output_tokens * price.output +
      usage.cache_read_input_tokens * price.cacheRead +
      usage.cache_creation_input_tokens * price.cacheWrite) /
    MILLION
  );
}

/** Dollars for one transcription; null without a price or a duration. */
export function sttCost(provider: string, durationMs: number | null | undefined): number | null {
  const perMinute = STT_PRICE_PER_MINUTE[provider];
  if (perMinute === undefined || !durationMs || durationMs <= 0) return null;
  return (durationMs / 60_000) * perMinute;
}
