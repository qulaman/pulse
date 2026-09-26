import type { PublicEnv } from "./env.schema";

type Source = Record<string, string | undefined>;

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * The rules of `publicEnvSchema` (env.schema.ts), checked by hand: this module is in every
 * browser bundle, and the zod schema brought all of zod with it — ~60 locales included —
 * to check four strings (D-126). env.public.test.ts keeps the two in agreement.
 */
export function checkPublicEnv(source: Source): PublicEnv {
  const problems: string[] = [];
  const url = source.NEXT_PUBLIC_SUPABASE_URL;
  if (url === undefined || !isUrl(url)) problems.push("NEXT_PUBLIC_SUPABASE_URL: Invalid URL");
  const anon = source.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anon) problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY: required");
  for (const name of ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "NEXT_PUBLIC_SENTRY_DSN"] as const) {
    // optional, but an empty string is a mistake, not an absence
    if (source[name] === "") problems.push(`${name}: empty`);
  }
  if (problems.length > 0) throw new Error(`Invalid environment variables — ${problems.join("; ")}`);

  const env: PublicEnv = {
    NEXT_PUBLIC_SUPABASE_URL: url as string,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anon as string,
  };
  if (source.NEXT_PUBLIC_VAPID_PUBLIC_KEY !== undefined) env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = source.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (source.NEXT_PUBLIC_SENTRY_DSN !== undefined) env.NEXT_PUBLIC_SENTRY_DSN = source.NEXT_PUBLIC_SENTRY_DSN;
  return env;
}

/**
 * Validated NEXT_PUBLIC_* env. Values are inlined at build time,
 * so they are read by explicit property access, not by iterating process.env.
 */
export function getPublicEnv(): PublicEnv {
  return checkPublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  });
}
