import { z } from "zod";

import { ConventionSchema, DEFAULT_CONVENTIONS } from "@/lib/ai/conventions";
import { DESK_SCENES } from "@/lib/errands/scene";

/**
 * company.settings — everything client-specific lives here, never in code (V-02).
 * Unknown keys are kept (other subsystems own theirs); known keys get defaults.
 */

export const STT_PROVIDERS = ["openai", "whisper1", "deepgram", "elevenlabs"] as const;
export type SttProviderKey = (typeof STT_PROVIDERS)[number];

/** DeepSeek ids are the lab's A/B against Haiku (D-63); the default stays Claude. */
export const PARSER_MODELS = ["claude-haiku-4-5", "claude-sonnet-5", "deepseek-chat", "deepseek-reasoner"] as const;

export const SttSettingsSchema = z.object({
  provider: z.enum(STT_PROVIDERS).default("openai"),
  fallback: z.enum(STT_PROVIDERS).nullable().default(null),
  /** "auto" — no language hint (the STT gate: better on Kazakh); "ru" — force Russian. */
  language: z.enum(["auto", "ru"]).default("auto"),
});

export const ParserSettingsSchema = z.object({
  model: z.string().min(1).default("claude-haiku-4-5"),
  escalation_model: z.string().min(1).default("claude-sonnet-5"),
  /** Re-run on the stronger model when the parse looks shaky (docs/AI.md §8). */
  escalate: z.boolean().default(true),
});

/** Overrides only: an absent key keeps the default from lib/ai/config.ts. */
export const MatchingSettingsSchema = z
  .object({
    autoThreshold: z.number().min(0).max(1),
    minGap: z.number().min(0).max(1),
    ambiguousThreshold: z.number().min(0).max(1),
    modelConfidenceYellow: z.number().min(0).max(1),
  })
  .partial();

export const DeliveryWindowSchema = z.object({
  from: z.string().regex(/^\d{2}:\d{2}$/).default("08:00"),
  to: z.string().regex(/^\d{2}:\d{2}$/).default("21:00"),
});

/**
 * D-79: the secretary's catalogue is data, never code — the buttons of one company
 * live in its settings (V-02). `code` is what an errand keeps forever, `label` is the
 * snapshot shown at the moment of asking, `synonyms` feed the voice matcher. There is
 * no `enabled` flag: the module is on exactly when the company has an active secretary.
 */
export const SecretaryActionSchema = z.object({
  code: z.string().trim().min(1).max(32),
  label: z.string().trim().min(1).max(40),
  icon: z.string().trim().max(8).default(""),
  synonyms: z.array(z.string().trim().min(1)).max(12).default([]),
  /** What the secretary's face plays for this button (D-97); absent — read off the code and the label. */
  scene: z.enum(DESK_SCENES).optional(),
});

export type SecretaryAction = z.infer<typeof SecretaryActionSchema>;

/**
 * «Не беспокоить» and «Пригласи гостя» joined the defaults with D-87, «Охрана» with D-99; a
 * catalogue saved before them got them appended by the migrations 20260923160000 and
 * 20260923235000.
 */
export const DEFAULT_SECRETARY_ACTIONS: SecretaryAction[] = [
  { code: "coffee", label: "Кофе", icon: "☕", synonyms: ["кофе", "кофейку"] },
  { code: "tea", label: "Чай", icon: "🍵", synonyms: ["чай", "чайку"] },
  { code: "dnd", label: "Не беспокоить", icon: "🔕", synonyms: ["не беспокоить", "никого не пускай", "никого не пускать"] },
  { code: "guest", label: "Пригласи гостя", icon: "🤝", synonyms: ["пригласи гостя", "гостя в кабинет", "пусть гость заходит", "пусть заходит"] },
  { code: "security", label: "Охрана", icon: "🚨", synonyms: ["охрана", "охрану", "вызови охрану", "вызвать охрану"] },
  { code: "doctor", label: "Врач", icon: "🩺", synonyms: ["врач", "врача", "доктор"] },
  { code: "come", label: "Зайди ко мне", icon: "🚪", synonyms: ["зайди", "зайди ко мне", "подойди"] },
];

/** Two rows with one code would make the history of an errand ambiguous. */
const SecretaryActionsSchema = z
  .array(SecretaryActionSchema)
  .max(12)
  .superRefine((actions, ctx) => {
    const seen = new Set<string>();
    for (const [index, action] of actions.entries()) {
      if (seen.has(action.code)) {
        ctx.addIssue({ code: "custom", message: "Код действия повторяется", path: [index, "code"] });
      }
      seen.add(action.code);
    }
  });

export const SecretarySettingsSchema = z.object({
  /** One repeat push of an errand nobody took (D-79 §7). */
  escalate_after_min: z.number().int().min(1).max(60).default(3),
  actions: SecretaryActionsSchema.default(DEFAULT_SECRETARY_ACTIONS),
  /** «Позвонить охране» on the secretary's alarm screen (D-99); empty — no call button. */
  security_phone: z.string().trim().max(24).regex(/^[+\d\s()-]*$/).default(""),
});

/** D-44: the only client customisation — a logo, an optional accent, a tagline. */
export const BrandSchema = z.object({
  logo_url: z.url().nullable().default(null),
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().default(null),
  tagline: z.string().trim().max(80).nullable().default(null),
});

/** Patch shape without defaults: a missing key must stay untouched, never reset (zod fills defaults even through .partial()). */
export const BrandPatchSchema = z
  .object({
    logo_url: z.url().nullable(),
    accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable(),
    tagline: z.string().trim().max(80).nullable(),
  })
  .partial();

export const CompanySettingsSchema = z.object({
  brand: BrandSchema.prefault({}),
  // prefault: the empty object goes through the section schema, so its own defaults apply
  stt: SttSettingsSchema.prefault({}),
  parser: ParserSettingsSchema.prefault({}),
  /** Counterparties and site names — STT prompt hints (docs/AI.md §1). */
  vocabulary: z.array(z.string().min(1)).default([]),
  /** What «до обеда» means here (D-15); rendered into the parser prompt. */
  conventions: z.array(ConventionSchema).max(40).default(DEFAULT_CONVENTIONS),
  /** Name-matcher thresholds (D-16, docs/AI.md §5) — tuned per company from the gate, no UI. */
  matching: MatchingSettingsSchema.prefault({}),
  /** Points off during the pilot (D-40(в)); the director switches them on (D-48). */
  points_enabled: z.boolean().default(false),
  rating_mode: z.enum(["top5", "full"]).default("top5"),
  delivery_window: DeliveryWindowSchema.prefault({}),
  /** The secretary's buttons and the repeat-push timeout (D-79). */
  secretary: SecretarySettingsSchema.prefault({}),
});

export type CompanySettings = z.infer<typeof CompanySettingsSchema>;

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
export function withSecretaryCodes(actions: readonly SecretaryAction[]): SecretaryAction[] {
  const result: SecretaryAction[] = [];
  for (const action of actions) {
    const label = action.label.trim();
    if (!label) continue;
    const code = action.code.trim() || secretaryActionCode(label, result.map((a) => a.code));
    result.push({ ...action, label, code });
  }
  return result;
}

/** Defaults applied on top of whatever the row holds; malformed sections fall back to defaults. */
export function parseCompanySettings(raw: unknown): CompanySettings {
  const result = CompanySettingsSchema.safeParse(raw ?? {});
  if (result.success) return result.data;
  return CompanySettingsSchema.parse({});
}

/** The PATCH body: any subset of sections, each validated in full. */
export const SettingsPatchSchema = z
  .object({
    stt: SttSettingsSchema.partial(),
    parser: ParserSettingsSchema.partial(),
    vocabulary: z.array(z.string().trim().min(1)).max(200),
    conventions: z.array(ConventionSchema).max(40),
    matching: MatchingSettingsSchema,
    points_enabled: z.boolean(),
    rating_mode: z.enum(["top5", "full"]),
    delivery_window: DeliveryWindowSchema.partial(),
    secretary: SecretarySettingsSchema.partial(),
    brand: BrandPatchSchema,
  })
  .partial()
  .strict();

export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

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
