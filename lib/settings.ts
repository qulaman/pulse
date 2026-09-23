import { z } from "zod";

import { ConventionSchema, DEFAULT_CONVENTIONS } from "@/lib/ai/conventions";

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
    delivery_window: DeliveryWindowSchema.partial(),
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
