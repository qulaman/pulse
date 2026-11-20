import { z } from "zod";

/**
 * Single source of truth for env variables (docs/SETUP.md §2).
 * Kept free of `server-only` so it can be unit-tested without a Next runtime.
 */

const required = z.string().min(1);
const optional = z.string().min(1).optional();

export const serverEnvSchema = z.object({
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: required,
  SUPABASE_SERVICE_ROLE_KEY: required,

  // AI
  OPENAI_API_KEY: required,
  ANTHROPIC_API_KEY: required,
  DEEPGRAM_API_KEY: optional,
  ELEVENLABS_API_KEY: optional,
  DEEPSEEK_API_KEY: optional,
  PARSER_MODEL: optional,
  PARSER_ESCALATION_MODEL: optional,

  // Web Push
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: optional,
  VAPID_PRIVATE_KEY: optional,
  VAPID_SUBJECT: optional,

  // Cron
  CRON_SECRET: optional,

  // The developers' console (D-157): its own host, and the app's address for sign-in links from it
  OPS_HOST: optional,
  OPS_APP_ORIGIN: z.url().optional(),

  // Read by nobody; lib/env.public.ts still checks it
  NEXT_PUBLIC_SENTRY_DSN: optional,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export const publicEnvSchema = serverEnvSchema.pick({
  NEXT_PUBLIC_SUPABASE_URL: true,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: true,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: true,
  NEXT_PUBLIC_SENTRY_DSN: true,
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/** Formats zod issues so the failing variable name is always visible. */
function formatIssues(issues: z.core.$ZodIssue[]): string {
  return issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment variables — ${formatIssues(result.error.issues)}`);
  }
  return result.data;
}

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = publicEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment variables — ${formatIssues(result.error.issues)}`);
  }
  return result.data;
}
