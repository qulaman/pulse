/**
 * The plain part of company settings: the lists, the labels and the button-code helpers, with no
 * zod in them. A client page that needs only these imports them from here — importing
 * lib/settings.ts brought all of zod, locales included, into its bundle (D-126). lib/settings.ts
 * re-exports everything below.
 */

export const STT_PROVIDERS = ["openai", "whisper1", "deepgram", "elevenlabs"] as const;
export type SttProviderKey = (typeof STT_PROVIDERS)[number];

/** DeepSeek ids are the lab's A/B against Haiku (D-63); the default stays Claude. */
export const PARSER_MODELS = ["claude-haiku-4-5", "claude-sonnet-5", "deepseek-chat", "deepseek-reasoner"] as const;

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  ә: "a", ғ: "g", қ: "k", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i",
};

/**
 * The code of a catalogue button is the director's label in latin letters — it never
 * changes afterwards, because an errand keeps it forever while the label may be
 * renamed (D-79 §4). A label with nothing to transliterate falls back to action_N.
 */
export function secretaryActionCode(label: string, taken: readonly string[] = []): string {
  const base =
    label
      .toLowerCase()
      .split("")
      .map((ch) => TRANSLIT[ch] ?? (/[a-z0-9]/.test(ch) ? ch : " "))
      .join("")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 32) || `action_${taken.length + 1}`;
  let code = base;
  for (let n = 2; taken.includes(code); n += 1) code = `${base}_${n}`.slice(0, 32);
  return code;
}

/**
 * What the form sends: empty rows are the editor's scratch space, and a row the
 * director just added gets its code here, once.
 */
export function withSecretaryCodes<T extends { code: string; label: string }>(actions: readonly T[]): T[] {
  const result: T[] = [];
  for (const action of actions) {
    const label = action.label.trim();
    if (!label) continue;
    const code = action.code.trim() || secretaryActionCode(label, result.map((a) => a.code));
    result.push({ ...action, label, code });
  }
  return result;
}

export const STT_PROVIDER_LABEL: Record<SttProviderKey, string> = {
  openai: "OpenAI gpt-4o-transcribe (основной по гейту)",
  whisper1: "OpenAI whisper-1 (контроль)",
  deepgram: "Deepgram nova-3",
  elevenlabs: "ElevenLabs Scribe v2 — запасной (D-53)",
};

/** One-line names for summaries and chips — the long labels above belong in a <select>. */
export const STT_PROVIDER_SHORT: Record<SttProviderKey, string> = {
  openai: "gpt-4o-transcribe",
  whisper1: "whisper-1",
  deepgram: "Deepgram nova-3",
  elevenlabs: "ElevenLabs Scribe v2",
};

export const PARSER_MODEL_SHORT: Record<string, string> = {
  "claude-haiku-4-5": "Claude Haiku 4.5",
  "claude-sonnet-5": "Claude Sonnet 5",
  "deepseek-chat": "DeepSeek V3",
  "deepseek-reasoner": "DeepSeek R1",
};

export const PARSER_MODEL_LABEL: Record<string, string> = {
  "claude-haiku-4-5": "Claude Haiku 4.5 — быстрый, ~2.8 с",
  "claude-sonnet-5": "Claude Sonnet 5 — точнее, ~6 с",
  "deepseek-chat": "DeepSeek V3 (chat) — без рассуждений, лаборатория",
  "deepseek-reasoner": "DeepSeek R1 (reasoner) — с рассуждениями, медленно, лаборатория",
};
