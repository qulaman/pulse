import { z } from "zod";

import { ConventionSchema, DEFAULT_CONVENTIONS } from "@/lib/ai/conventions";
import { PARSER_RULES_HISTORY_MAX, PARSER_RULES_MAX } from "@/lib/ai/rules";
import { DEFAULT_WORD_KINDS, KIND_LABEL_MAX, WORD_KINDS_MAX } from "@/lib/dictionary";
import { DESK_SCENES } from "@/lib/errands/scene";
import { STT_PROVIDERS } from "@/lib/settings-plain";

// Plain values and helpers without zod live in settings-plain.ts — the pages that only need a
// label or a code helper import them there and stay free of zod (D-126). Re-exported here, so
// server code keeps importing everything from one place.
export {
  PARSER_MODEL_LABEL,
  PARSER_MODEL_SHORT,
  PARSER_MODELS,
  secretaryActionCode,
  STT_PROVIDER_LABEL,
  STT_PROVIDER_SHORT,
  STT_PROVIDERS,
  withSecretaryCodes,
  type SttProviderKey,
} from "@/lib/settings-plain";

/**
 * company.settings — everything client-specific lives here, never in code (V-02).
 * Unknown keys are kept (other subsystems own theirs); known keys get defaults.
 */


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

/** The corpus run a version of the rules passed before it was saved (D-138). */
export const ParserRulesEvalSchema = z.object({
  cases: z.number().int(),
  failed: z.number().int(),
  assignee: z.number(),
  f1: z.number(),
  deadline: z.number(),
  model: z.string(),
  cost_usd: z.number().nullable(),
});

export const ParserRulesVersionSchema = z.object({
  version: z.number().int().min(1),
  /** Empty — the company went back to the core prompt. */
  text: z.string().max(PARSER_RULES_MAX),
  saved_at: z.string(),
  saved_by: z.string().nullable(),
  saved_by_name: z.string().nullable(),
  /** null: an empty text needs no run — it is the core `pnpm eval:parser` measures. */
  eval: ParserRulesEvalSchema.nullable(),
});

export type ParserRulesVersion = z.infer<typeof ParserRulesVersionSchema>;

/**
 * «Правила компании» (D-138): the active version is `versions[0]`, the older ones follow.
 * Written by `/api/lab/parser` only — after a corpus run — so no settings PATCH carries it.
 */
export const ParserRulesSchema = z.object({
  versions: z.array(ParserRulesVersionSchema).max(PARSER_RULES_HISTORY_MAX).default([]),
  /** The client_request_id of the last save: a retried save makes no second version. */
  request_id: z.string().nullable().default(null),
});

export type ParserRules = z.infer<typeof ParserRulesSchema>;

/** What the parser runs with: the newest version's text, or nothing. */
export function activeParserRules(rules: ParserRules): { text: string; version: number } {
  const head = rules.versions[0];
  return head ? { text: head.text, version: head.version } : { text: "", version: 0 };
}

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

/**
 * No max here on purpose: one section that fails to parse drops the whole settings to
 * defaults (`parseCompanySettings`), so the bound lives in the route that writes it.
 */
export const DictionarySettingsSchema = z.object({
  dismissed: z.array(z.string()).default([]),
  /** Suggested words hidden with «×» on «Часто встречается» — stem keys (D-111, words wave). */
  dismissed_words: z.array(z.string()).default([]),
});

/**
 * The meta of one vocabulary word: what it names, who added it and when (D-111). Every
 * field falls back to null on a bad value instead of failing — one broken entry must not
 * drop the whole settings to defaults.
 */
const WordMetaSchema = z.object({
  kind: z.string().max(40).nullable().catch(null),
  added_at: z.string().nullable().catch(null),
  added_by: z.string().nullable().catch(null),
});

/** How many hidden lessons are kept — the oldest go first. */
export const DICTIONARY_DISMISSED_MAX = 200;

/** D-133: the price of each reaction of the director, by code (lib/points/reactions.ts). */
export const ReactionPricesSchema = z.object({
  like: z.number().int().min(0).max(100000).default(1),
  fire: z.number().int().min(0).max(100000).default(10),
  heart: z.number().int().min(0).max(100000).default(100),
  clap: z.number().int().min(0).max(100000).default(0),
  zap: z.number().int().min(0).max(100000).default(0),
  think: z.number().int().min(0).max(100000).default(0),
  dislike: z.number().int().min(0).max(100000).default(0),
});

/**
 * D-133 (D-13, D-28): what the automatic rules pay on a task's moves — the database reads the
 * same keys (`points_rule()`, migration 20261014120000). The penalty exists and is off.
 */
export const PointsRulesSchema = z.object({
  quick_accept: z.number().int().min(0).max(1000).default(1),
  quick_accept_min: z.number().int().min(1).max(240).default(10),
  on_time: z.number().int().min(0).max(1000).default(3),
  early: z.number().int().min(0).max(1000).default(5),
  late_on: z.boolean().default(false),
  late: z.number().int().min(0).max(1000).default(5),
  reactions: ReactionPricesSchema.prefault({}),
});

/** D-133 (И-46): which good news goes public on Эфир. */
export const EtherEventsSchema = z.object({
  merch: z.boolean().default(true),
  praise: z.boolean().default(true),
});

export const CompanySettingsSchema = z.object({
  brand: BrandSchema.prefault({}),
  // prefault: the empty object goes through the section schema, so its own defaults apply
  stt: SttSettingsSchema.prefault({}),
  parser: ParserSettingsSchema.prefault({}),
  /** The company's own parser rules and their versions (D-138); a broken section is no rules, not lost settings. */
  parser_rules: ParserRulesSchema.prefault({}).catch({ versions: [], request_id: null }),
  /** Counterparties and site names — STT prompt hints (docs/AI.md §1). */
  vocabulary: z.array(z.string().min(1)).default([]),
  /** Kind, author and date of each word, keyed by `entryKey` — the screen's, not the prompt's (D-111). */
  vocabulary_meta: z.record(z.string(), WordMetaSchema).catch({}).default({}),
  /** The company's word types, in order (D-111 §19); a broken list falls back to the defaults. */
  word_kinds: z
    .array(z.object({ id: z.string().min(1).max(40), label: z.string().trim().min(1).max(KIND_LABEL_MAX) }))
    .max(WORD_KINDS_MAX)
    .catch(DEFAULT_WORD_KINDS)
    .default(DEFAULT_WORD_KINDS),
  /** What «до обеда» means here (D-15); rendered into the parser prompt. */
  conventions: z.array(ConventionSchema).max(40).default(DEFAULT_CONVENTIONS),
  /** Name-matcher thresholds (D-16, docs/AI.md §5) — tuned per company from the gate, no UI. */
  matching: MatchingSettingsSchema.prefault({}),
  /** Points off during the pilot (D-40(в)); the director switches them on (D-48). */
  points_enabled: z.boolean().default(false),
  rating_mode: z.enum(["top5", "full"]).default("top5"),
  /** The faces dress for the holidays of the company's calendar (D-119, lib/mascot/season.ts). */
  mascot_seasons: z.boolean().default(true),
  /** The employee's face worries over their own work — calling, panicking, nervous (D-133, В-5). */
  mascot_telegraph: z.boolean().default(true),
  points_rules: PointsRulesSchema.prefault({}),
  ether_events: EtherEventsSchema.prefault({}),
  delivery_window: DeliveryWindowSchema.prefault({}),
  /** The secretary's buttons and the repeat-push timeout (D-79). */
  secretary: SecretarySettingsSchema.prefault({}),
  /** «Словарь» (D-111): lessons hidden with «×» on «Из ваших записей», `${personId}:${form}`. */
  dictionary: DictionarySettingsSchema.prefault({}),
});

export type CompanySettings = z.infer<typeof CompanySettingsSchema>;

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
    mascot_seasons: z.boolean(),
    mascot_telegraph: z.boolean(),
    // a section arrives whole: the screen sends everything it shows
    points_rules: PointsRulesSchema,
    ether_events: EtherEventsSchema,
    delivery_window: DeliveryWindowSchema.partial(),
    secretary: SecretarySettingsSchema.partial(),
    brand: BrandPatchSchema,
  })
  .partial()
  .strict();

export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;
