import { z } from "zod";

/**
 * company.settings — everything client-specific lives here, never in code (V-02).
 * Unknown keys are kept (other subsystems own theirs); known keys get defaults.
 */

export const STT_PROVIDERS = ["openai", "whisper1", "deepgram", "elevenlabs"] as const;
export type SttProviderKey = (typeof STT_PROVIDERS)[number];

export const PARSER_MODELS = ["claude-haiku-4-5", "claude-sonnet-5"] as const;

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

export const DeliveryWindowSchema = z.object({
  from: z.string().regex(/^\d{2}:\d{2}$/).default("08:00"),
  to: z.string().regex(/^\d{2}:\d{2}$/).default("21:00"),
});

export const CompanySettingsSchema = z.object({
  // prefault: the empty object goes through the section schema, so its own defaults apply
  stt: SttSettingsSchema.prefault({}),
  parser: ParserSettingsSchema.prefault({}),
  /** Counterparties and site names — STT prompt hints (docs/AI.md §1). */
  vocabulary: z.array(z.string().min(1)).default([]),
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
    points_enabled: z.boolean(),
    rating_mode: z.enum(["top5", "full"]),
    delivery_window: DeliveryWindowSchema.partial(),
  })
  .partial()
  .strict();

export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

export const STT_PROVIDER_LABEL: Record<SttProviderKey, string> = {
  openai: "OpenAI gpt-4o-transcribe (основной по гейту)",
  whisper1: "OpenAI whisper-1 (контроль)",
  deepgram: "Deepgram nova-3",
  elevenlabs: "ElevenLabs Scribe",
};

export const PARSER_MODEL_LABEL: Record<string, string> = {
  "claude-haiku-4-5": "Claude Haiku 4.5 — быстрый, ~2.8 с",
  "claude-sonnet-5": "Claude Sonnet 5 — точнее, ~6 с",
};
