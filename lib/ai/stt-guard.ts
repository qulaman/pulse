import { normalize, tokens } from "../text/normalize";
import { hintSurfaces, hintsToPrompt } from "./stt";

export type GuardCode = "too_dense" | "phantom" | "too_short" | "prompt_echo" | "loop" | "low_density" | "silent";

export type GuardResult =
  | { ok: true; suspicious: boolean; reason?: GuardCode }
  | { ok: false; code: GuardCode };

export interface GuardInput {
  text: string;
  durationMs: number;
  vocabularyHints: string[];
}

/**
 * Opus of a dead microphone (AI.md §1 (з)): the encoder spends under 300 bytes a second on digital
 * silence, against about 6 KB a second on speech. A recording longer than 3 s whose bytes over the
 * header and that floor would not hold a third of a second of speech has none — the recogniser
 * would invent a phrase out of its hint (2026-11-17: 8 s of −91 dB became «Ербол, составь отчёт по
 * Хиральному принтеру»). A minute of silence with one short phrase in it stays well above. Only
 * Opus is judged: AAC of an iPhone keeps a bigger floor on silence and is left to the text guards.
 */
const SILENT_HEADER_BYTES = 1000;
const SILENT_FLOOR_BYTES_PER_SEC = 300;
const SILENT_SPEECH_BYTES = 2000;
const SILENT_MIN_MS = 3000;
/** The codec is named in the container's head: no need to read a long recording through. */
const HEAD_BYTES = 16 * 1024;

/** Does the byte string occur in the file (plain bytes: the lab imports this module in a browser). */
function hasBytes(audio: Uint8Array, ascii: string): boolean {
  const first = ascii.charCodeAt(0);
  outer: for (let i = audio.indexOf(first); i !== -1 && i + ascii.length <= audio.length; i = audio.indexOf(first, i + 1)) {
    for (let j = 1; j < ascii.length; j++) if (audio[i + j] !== ascii.charCodeAt(j)) continue outer;
    return true;
  }
  return false;
}

/** The file is Opus: an mp4's sample entry with its «dOps» box, or a webm's codec «A_OPUS» — in its head. */
export function isOpus(audio: Uint8Array): boolean {
  const head = audio.subarray(0, HEAD_BYTES);
  return (hasBytes(head, "Opus") && hasBytes(head, "dOps")) || hasBytes(head, "A_OPUS");
}

/** Silence by the size of the file, before any recogniser is paid for. */
export function isSilentOpus(audio: { bytes: number; durationMs: number; opus: boolean }): boolean {
  if (!audio.opus || audio.durationMs < SILENT_MIN_MS) return false;
  const floor = SILENT_HEADER_BYTES + SILENT_FLOOR_BYTES_PER_SEC * (audio.durationMs / 1000);
  return audio.bytes - floor < SILENT_SPEECH_BYTES;
}

/** Known Whisper hallucinations on silence / unintelligible speech (AI.md §1 (в)). */
export const PHANTOMS: readonly string[] = [
  "Продолжение следует",
  "Субтитры сделал",
  "Спасибо за просмотр",
];

const PHANTOMS_NORMALIZED = PHANTOMS.map(normalize);

const MAX_CHARS_PER_SEC = 30;
const LOW_DENSITY_SUSPICIOUS = 6;
const LOW_DENSITY_MIN_MS = 3000;
// A two-word order («Марат сигареты», «Жандос кофе») is a real command; only a lone
// word («Ага», «Да») is the shape of Whisper on silence (D-52).
const MIN_WORDS = 2;
const ECHO_MIN_WORDS = 3;
const ECHO_NGRAM = 4;
const ECHO_SHARE = 0.6;
const LOOP_COVERAGE = 0.7;

function containsSequence(haystack: string[], needle: string[]): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * Verbatim chunk of the roster prompt, or a transcript built almost entirely out of
 * names. The share check uses the name surfaces only: the prompt's own scaffolding
 * («директор», «поручения», «компании») is ordinary speech and must not count.
 */
function isPromptEcho(words: string[], hints: string[]): boolean {
  if (!hints.length || words.length < ECHO_MIN_WORDS) return false;
  const hintWords = tokens(hintsToPrompt(hints));

  for (let i = 0; i + ECHO_NGRAM <= hintWords.length; i++) {
    if (containsSequence(words, hintWords.slice(i, i + ECHO_NGRAM))) return true;
  }

  const vocabulary = new Set(tokens(hintSurfaces(hints).join(" ")));
  const hits = words.filter((w) => vocabulary.has(w)).length;
  return hits / words.length >= ECHO_SHARE;
}

/** One phrase repeated back to back and covering most of the transcript. */
function isLoop(words: string[]): boolean {
  const n = words.length;
  for (let len = 2; len <= Math.floor(n / 2); len++) {
    for (let start = 0; start + len * 2 <= n; start++) {
      const phrase = words.slice(start, start + len).join(" ");
      let reps = 1;
      while (
        start + len * (reps + 1) <= n &&
        words.slice(start + len * reps, start + len * (reps + 1)).join(" ") === phrase
      ) {
        reps++;
      }
      if (reps >= 2 && (reps * len) / n > LOOP_COVERAGE) return true;
    }
  }
  return false;
}

/**
 * Pure guard between STT and the parser (AI.md §1 (б)–(ж)). Every ok:false becomes
 * `empty_transcript` for the client and `stt_guard:<code>` in ai_logs.
 *
 * Hard drops are reserved for transcripts that cannot be speech at all (phantoms,
 * prompt echo, loops, impossible density). Anything that might be the director
 * talking slowly or briefly goes through as `suspicious` — the director sees it on
 * /confirm with a yellow chip and decides (D-52).
 */
export function guardTranscript(input: GuardInput): GuardResult {
  const normalized = normalize(input.text);
  const words = normalized.split(" ").filter(Boolean);

  if (PHANTOMS_NORMALIZED.some((p) => p && normalized.includes(p))) {
    return { ok: false, code: "phantom" };
  }
  if (words.length < MIN_WORDS) return { ok: false, code: "too_short" };
  if (isPromptEcho(words, input.vocabularyHints)) return { ok: false, code: "prompt_echo" };
  if (isLoop(words)) return { ok: false, code: "loop" };

  const seconds = input.durationMs / 1000;
  if (seconds > 0) {
    const density = normalized.length / seconds;
    if (density > MAX_CHARS_PER_SEC) return { ok: false, code: "too_dense" };
    if (input.durationMs > LOW_DENSITY_MIN_MS && density < LOW_DENSITY_SUSPICIOUS) {
      return { ok: true, suspicious: true, reason: "low_density" };
    }
  }

  return { ok: true, suspicious: false };
}
