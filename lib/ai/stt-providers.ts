import type { SttOptions, SttProvider, SttResult } from "./stt";
import { hintsToPrompt, splitVocabularyHints } from "./stt";

export type SttProviderName = "openai-4o" | "whisper1" | "deepgram" | "elevenlabs";

const EXT_BY_MIME: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

function fileNameFor(mime: string): string {
  return `audio.${EXT_BY_MIME[mime.split(";")[0].trim()] ?? "bin"}`;
}

/** Failed HTTP responses carry the status so the retry policy can tell 4xx from 5xx. */
async function httpError(provider: string, res: Response): Promise<Error> {
  const body = await res.text().catch(() => "");
  return Object.assign(new Error(`${provider} HTTP ${res.status}: ${body.slice(0, 200)}`), {
    status: res.status,
  });
}

function requireKey(name: string): string {
  const key = process.env[name];
  if (!key) throw new Error(`${name} не задан`);
  return key;
}

/** Copy into a plain ArrayBuffer-backed view: Buffer may sit on a shared pool, which BlobPart rejects. */
function toBlobPart(audio: Buffer): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(audio.byteLength);
  bytes.set(audio);
  return bytes;
}

async function openaiTranscribe(
  providerName: string,
  model: string,
  audio: Buffer,
  mime: string,
  opts: SttOptions,
): Promise<SttResult> {
  const fd = new FormData();
  fd.append("file", new Blob([toBlobPart(audio)], { type: mime }), fileNameFor(mime));
  fd.append("model", model);
  if (opts.language) fd.append("language", opts.language);
  if (opts.vocabularyHints?.length) fd.append("prompt", hintsToPrompt(opts.vocabularyHints));
  if (model === "whisper-1") fd.append("response_format", "verbose_json");

  const startedAt = Date.now();
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${requireKey("OPENAI_API_KEY")}` },
    body: fd,
    signal: opts.signal,
  });
  if (!res.ok) throw await httpError(providerName, res);
  const json = (await res.json()) as { text?: string };
  return { text: json.text ?? "", durationMs: Date.now() - startedAt, provider: providerName };
}

/** Individual surfaces, not the "full / alias" display form the prompt uses. */
function keywordsFrom(hints: string[]): string[] {
  const { users, counterparties } = splitVocabularyHints(hints);
  const surfaces = users.flatMap((entry) => entry.split(" / ").map((s) => s.trim()));
  return [...new Set([...surfaces, ...counterparties])].filter(Boolean);
}

const openai4o: SttProvider = {
  name: "openai-4o",
  transcribe: (audio, mime, opts) => openaiTranscribe("openai-4o", "gpt-4o-transcribe", audio, mime, opts),
};

const whisper1: SttProvider = {
  name: "whisper1",
  transcribe: (audio, mime, opts) => openaiTranscribe("whisper1", "whisper-1", audio, mime, opts),
};

const deepgram: SttProvider = {
  name: "deepgram",
  async transcribe(audio, mime, opts) {
    const kw = keywordsFrom(opts.vocabularyHints ?? [])
      .map((k) => "keywords=" + encodeURIComponent(k + ":2"))
      .join("&");
    const url =
      `https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true` +
      (opts.language ? `&language=${opts.language}` : "") +
      (kw ? `&${kw}` : "");

    const startedAt = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Token ${requireKey("DEEPGRAM_API_KEY")}`, "Content-Type": mime },
      body: toBlobPart(audio),
      signal: opts.signal,
    });
    if (!res.ok) throw await httpError("deepgram", res);
    const json = (await res.json()) as {
      results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
    };
    return {
      text: json.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "",
      durationMs: Date.now() - startedAt,
      provider: "deepgram",
    };
  },
};

const elevenlabs: SttProvider = {
  name: "elevenlabs",
  async transcribe(audio, mime, opts) {
    const fd = new FormData();
    fd.append("file", new Blob([toBlobPart(audio)], { type: mime }), fileNameFor(mime));
    fd.append("model_id", "scribe_v1");
    if (opts.language) fd.append("language_code", opts.language);

    const startedAt = Date.now();
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": requireKey("ELEVENLABS_API_KEY") },
      body: fd,
      signal: opts.signal,
    });
    if (!res.ok) throw await httpError("elevenlabs", res);
    const json = (await res.json()) as { text?: string };
    return { text: json.text ?? "", durationMs: Date.now() - startedAt, provider: "elevenlabs" };
  },
};

const PROVIDERS: Record<SttProviderName, SttProvider> = {
  "openai-4o": openai4o,
  whisper1,
  deepgram,
  elevenlabs,
};

export function createProvider(name: SttProviderName): SttProvider {
  return PROVIDERS[name];
}
