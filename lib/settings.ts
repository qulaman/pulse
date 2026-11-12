import { z } from "zod";

import { CONVENTION_KEYS, ConventionSchema, normalizeConventions } from "@/lib/ai/conventions";
import { normalizeKinds } from "@/lib/ai/kinds/names";
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
  /**
   * The kinds the parser answers with (task 026): their prompt sections, examples and schema.
   * Absent — all eight; `task` is always on; an unknown name is dropped, never an error.
   */
  kinds: z
    .unknown()
    .optional()
    .transform((value) => normalizeKinds(Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : undefined)),
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
  /** D-152: a daily report sent for a working day, and one not sent — stored positive, written as a minus (like `late`). */
  daily_report: z.number().int().min(0).max(1000).default(1),
  daily_report_missed: z.number().int().min(0).max(1000).default(10),
});

/** "HH:MM" on the Aqtobe wall clock. */
const ClockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** ISO weekdays (1 — Monday … 7 — Sunday), each once, in order. */
const WorkdaysSchema = z
  .array(z.number().int().min(1).max(7))
  .min(1)
  .max(7)
  .transform((days) => [...new Set(days)].sort((a, b) => a - b));

/** A real calendar day as "YYYY-MM-DD" (2026-02-30 is refused). */
const DaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => {
    // zod runs the refine after a failed regex too: a non-date must not throw here
    const time = Date.parse(`${day}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day;
  });

/** The company's holidays (D-155 §7): days off whatever the weekday, each once, in order. */
const HolidaysSchema = z
  .array(DaySchema)
  // past days stay (the period counts them): ~14 a year for decades
  .max(400)
  .transform((days) => [...new Set(days)].sort());

/**
 * D-152: the daily report. The database reads the same keys with the same defaults
 * (`daily_report_*()`, migration 20261028120000). Written by the server only, never by the screen:
 * `started_on` — the first day a missing report is fined (the first morning tick, or switching the
 * module on); `checked_on` — the last day the morning tick closed (kept here, or a settings save
 * would make the tick look at closed days again). `holidays` — no report is due on them (D-155 §7);
 * a broken list reads as none, never as a broken section. `ask_from` — from this time of a working
 * day Лента asks for the report not handed in yet: the row in «Дела» stands out, the face calls,
 * the greeting says so (D-167). Only the phone reads it; the push still goes at `remind_at`.
 */
export const DailyReportSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  workdays: WorkdaysSchema.default([1, 2, 3, 4, 5]),
  holidays: HolidaysSchema.default([]).catch([]),
  work_start: ClockSchema.default("09:00"),
  remind_at: ClockSchema.default("18:00"),
  ask_from: ClockSchema.default("17:00").catch("17:00"),
  started_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  checked_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});

export type DailyReportSettings = z.infer<typeof DailyReportSettingsSchema>;

const DAILY_REPORT_DEFAULTS: DailyReportSettings = DailyReportSettingsSchema.parse({});

/** The PATCH shape: no defaults (a missing key stays untouched), no server keys — a sent `started_on` / `checked_on` is dropped. */
export const DailyReportPatchSchema = z
  .object({
    enabled: z.boolean(),
    workdays: WorkdaysSchema,
    holidays: HolidaysSchema,
    work_start: ClockSchema,
    remind_at: ClockSchema,
    ask_from: ClockSchema,
  })
  .partial();

export type DailyReportPatch = z.infer<typeof DailyReportPatchSchema>;

/**
 * The stored section after a PATCH (D-152 §7): the edited keys over the current ones; switching
 * the module on starts the fines from `today` — the days it was off are never fined backwards.
 */
export function mergeDailyReport(current: DailyReportSettings, patch: DailyReportPatch, today: string): DailyReportSettings {
  const next: DailyReportSettings = { ...current, ...patch };
  if (!current.enabled && next.enabled) next.started_on = today;
  return next;
}

/**
 * D-155 §3 (D-18): how long a voice recording is kept — `closed_days` after what it belongs to is
 * closed, `orphan_days` for a recording nothing came of. The sweep reads the same keys with the same
 * defaults (`voice_retention_*()`, tasks/027); transcripts and texts are kept for good.
 */
export const VoiceRetentionSchema = z.object({
  closed_days: z.number().int().min(7).max(3650).default(90),
  orphan_days: z.number().int().min(7).max(3650).default(30),
});

export type VoiceRetention = z.infer<typeof VoiceRetentionSchema>;

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
  /**
   * What «до обеда» means here (D-15): one row per fixed key, the phrases go to the parser
   * prompt, the times to the resolver (task 026). Old `phrase/meaning` rows are converted,
   * unknown ones dropped — never a failed parse of the whole settings.
   */
  // optional(): a transform alone makes the key required, and a missing key would drop every section
  conventions: z.unknown().optional().transform(normalizeConventions),
  /** Name-matcher thresholds (D-16, docs/AI.md §5) — tuned per company from the gate, no UI. */
  matching: MatchingSettingsSchema.prefault({}),
  /** Points off during the pilot (D-40(в)); the director switches them on (D-48). */
  points_enabled: z.boolean().default(false),
  rating_mode: z.enum(["top5", "full"]).default("top5"),
  /** The faces dress for the holidays of the company's calendar (D-119, lib/mascot/season.ts). */
  mascot_seasons: z.boolean().default(true),
  /** The employee's face worries over their own work — calling, panicking, nervous (D-133, В-5). */
  mascot_telegraph: z.boolean().default(true),
  /** «Лаб» on the whole team's bar while the company tests the product (D-150); off at release. */
  lab_for_all: z.boolean().default(false),
  /**
   * «Лаборатория» and «Данные»: the developers' tools, closed to a client (owner, 2026-11-04). Set
   * in the database only: no PATCH takes it (the patch schema has no such key) and
   * `update_company_settings` drops it, so a company cannot open them for itself. A broken value
   * reads as closed, never as a broken settings row.
   */
  dev_tools: z.boolean().default(false).catch(false),
  points_rules: PointsRulesSchema.prefault({}),
  ether_events: EtherEventsSchema.prefault({}),
  delivery_window: DeliveryWindowSchema.prefault({}),
  /** The secretary's buttons and the repeat-push timeout (D-79). */
  secretary: SecretarySettingsSchema.prefault({}),
  /** «Словарь» (D-111): lessons hidden with «×» on «Из ваших записей», `${personId}:${form}`. */
  dictionary: DictionarySettingsSchema.prefault({}),
  /** The daily report (D-152); a broken section reads as the defaults, never the whole settings. */
  daily_report: DailyReportSettingsSchema.prefault({}).catch(DAILY_REPORT_DEFAULTS),
  /** How long voice recordings are kept (D-155 §3); a broken section reads as the defaults. */
  voice_retention: VoiceRetentionSchema.prefault({}).catch({ closed_days: 90, orphan_days: 30 }),
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
    conventions: z.array(ConventionSchema).max(CONVENTION_KEYS.length).transform(normalizeConventions),
    matching: MatchingSettingsSchema,
    points_enabled: z.boolean(),
    rating_mode: z.enum(["top5", "full"]),
    mascot_seasons: z.boolean(),
    mascot_telegraph: z.boolean(),
    lab_for_all: z.boolean(),
    // a section arrives whole: the screen sends everything it shows
    points_rules: PointsRulesSchema,
    ether_events: EtherEventsSchema,
    voice_retention: VoiceRetentionSchema,
    delivery_window: DeliveryWindowSchema.partial(),
    secretary: SecretarySettingsSchema.partial(),
    brand: BrandPatchSchema,
    daily_report: DailyReportPatchSchema,
  })
  .partial()
  .strict();

export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;
