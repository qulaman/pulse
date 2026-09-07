import { createProvider, type SttProviderName } from "./stt-providers";

export interface SttOptions {
  language?: "ru" | null; // null = без language-hint
  vocabularyHints?: string[];
  // Added by the retry policy below so a stalled request is actually aborted, not just raced.
  signal?: AbortSignal;
}

export interface SttResult {
  text: string;
  durationMs: number;
  provider: string;
}

export interface SttProvider {
  name: string;
  transcribe(audio: Buffer, mime: string, opts: SttOptions): Promise<SttResult>;
}

export type SttErrorCode = "stt_failed" | "stt_timeout" | "stt_http";

/** Carries no request bodies and no keys — instances end up in ai_logs. */
export class SttError extends Error {
  readonly code: SttErrorCode;
  readonly status?: number;
  readonly provider?: string;

  constructor(
    code: SttErrorCode,
    message: string,
    options: { cause?: unknown; status?: number; provider?: string } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "SttError";
    this.code = code;
    this.status = options.status;
    this.provider = options.provider;
  }
}

/** HTTP status attached by providers to a failed-response error, if any. */
function statusOf(err: unknown): number | undefined {
  if (err instanceof SttError) return err.status;
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

/**
 * Separates the two sections of a flat vocabularyHints array so hintsToPrompt()
 * can rebuild the exact roster prompt. The wording matches the prompt itself,
 * which keeps the prompt-echo guard honest.
 */
export const COUNTERPARTIES_MARKER = "Контрагенты и объекты";

export interface VocabularyRoster {
  users: { full_name: string; aliases: string[] }[];
  counterparties: string[];
}

/**
 * Include aliases ("Ерлан Б", "Ерлан Д"): spoken initials are acoustically fragile
 * — hint the valid combinations (G.8).
 */
export function buildVocabularyHints(roster: VocabularyRoster): string[] {
  const users = roster.users.map((u) => {
    const surfaces = [u.full_name, ...u.aliases];
    return [...new Set(surfaces)].join(" / ");
  });
  const counterparties = [...new Set(roster.counterparties)];
  return counterparties.length ? [...users, COUNTERPARTIES_MARKER, ...counterparties] : users;
}

export function splitVocabularyHints(hints: string[]): { users: string[]; counterparties: string[] } {
  const at = hints.indexOf(COUNTERPARTIES_MARKER);
  if (at === -1) return { users: hints, counterparties: [] };
  return { users: hints.slice(0, at), counterparties: hints.slice(at + 1) };
}

export function hintsToPrompt(hints: string[]): string {
  const { users, counterparties } = splitVocabularyHints(hints);
  let prompt = "Имена сотрудников: " + users.join(", ") + ".";
  if (counterparties.length) {
    prompt += " " + COUNTERPARTIES_MARKER + ": " + counterparties.join(", ") + ".";
  }
  return prompt;
}

const PROVIDER_BY_ENV: Record<string, SttProviderName> = {
  openai: "openai-4o",
  whisper1: "whisper1",
  deepgram: "deepgram",
  elevenlabs: "elevenlabs",
};

export interface SttProviderSet {
  primary: SttProvider;
  fallback?: SttProvider;
}

function resolve(value: string | undefined, envName: string): SttProviderName | undefined {
  if (!value) return undefined;
  const name = PROVIDER_BY_ENV[value];
  if (!name) throw new Error(`${envName}: неизвестный STT-провайдер "${value}"`);
  return name;
}

export function getSttProviders(env: Record<string, string | undefined>): SttProviderSet {
  const primary = resolve(env.STT_PROVIDER ?? "openai", "STT_PROVIDER")!;
  const fallback = resolve(env.STT_FALLBACK_PROVIDER, "STT_FALLBACK_PROVIDER");
  return {
    primary: createProvider(primary),
    fallback: fallback && fallback !== primary ? createProvider(fallback) : undefined,
  };
}

export interface SttRetryPolicy {
  timeoutMs: number;
  retryPauseMs: number;
}

export const DEFAULT_RETRY_POLICY: SttRetryPolicy = { timeoutMs: 10_000, retryPauseMs: 1000 };

/** 4xx other than 408/429 is our fault, not the provider's — retrying only burns time. */
function isPermanent(status: number | undefined): boolean {
  if (status === undefined) return false;
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attempt(
  provider: SttProvider,
  audio: Buffer,
  mime: string,
  opts: SttOptions,
  timeoutMs: number,
): Promise<SttResult> {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    return await provider.transcribe(audio, mime, { ...opts, signal });
  } catch (cause) {
    if (cause instanceof SttError) throw cause;
    const status = statusOf(cause);
    const timedOut =
      status === undefined &&
      (signal.aborted || (cause instanceof Error && cause.name === "TimeoutError"));
    let code: SttErrorCode = "stt_failed";
    if (timedOut) code = "stt_timeout";
    else if (status !== undefined) code = "stt_http";
    const detail = timedOut ? `таймаут ${timeoutMs} мс` : status !== undefined ? `HTTP ${status}` : "сбой вызова";
    throw new SttError(code, `${provider.name}: ${detail}`, {
      cause,
      status,
      provider: provider.name,
    });
  }
}

/**
 * Fixed policy (architect's decision, do not change): primary → fallback → pause → one primary
 * retry. Permanent 4xx short-circuits. Никакие секреты в сообщения ошибок не попадают.
 */
export async function transcribe(
  audio: Buffer,
  mime: string,
  opts: SttOptions,
  providers: SttProviderSet = getSttProviders(process.env),
  policy: SttRetryPolicy = DEFAULT_RETRY_POLICY,
): Promise<SttResult> {
  const { primary, fallback } = providers;
  const { timeoutMs, retryPauseMs } = policy;

  let lastError: unknown;
  try {
    return await attempt(primary, audio, mime, opts, timeoutMs);
  } catch (err) {
    if (isPermanent(statusOf(err))) throw err;
    lastError = err;
  }

  if (fallback) {
    try {
      return await attempt(fallback, audio, mime, opts, timeoutMs);
    } catch (err) {
      lastError = err;
    }
  }

  await sleep(retryPauseMs);
  try {
    return await attempt(primary, audio, mime, opts, timeoutMs);
  } catch (err) {
    lastError = err;
  }

  throw new SttError("stt_failed", "Распознавание не удалось: все попытки провалились", {
    cause: lastError,
    provider: primary.name,
  });
}
