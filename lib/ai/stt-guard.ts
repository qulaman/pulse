import { normalize, tokens } from "../text/normalize";
import { hintSurfaces, hintsToPrompt } from "./stt";

export type GuardCode = "too_dense" | "phantom" | "too_short" | "prompt_echo" | "loop" | "low_density";

export type GuardResult =
  | { ok: true; suspicious: boolean; reason?: GuardCode }
  | { ok: false; code: GuardCode };

export interface GuardInput {
  text: string;
  durationMs: number;
  vocabularyHints: string[];
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
