/**
 * Auth smoke: RLS visibility for two roles plus the /api/me contract.
 * Requires a running `pnpm dev` on APP_URL (default http://localhost:3000).
 */
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = "demo1234";

if (!SUPABASE_URL || !ANON_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are missing in .env.local");
  process.exit(1);
}

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];

function record(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
}

function anonClient() {
  return createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(email: string) {
  const supabase = anonClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return { supabase, session: data.session };
}

async function main() {
  const director = await signIn("director@demo.local");

  const own = await director.supabase
    .from("profiles")
    .select("role")
    .eq("id", director.session.user.id)
    .single();
  record(
    "director: свой профиль под RLS = director",
    !own.error && own.data?.role === "director",
    own.error?.message ?? `role=${own.data?.role}`,
  );

  const roster = await director.supabase.from("profiles").select("id");
  record(
    "director: profiles = 8 строк",
    !roster.error && roster.data?.length === 8,
    roster.error?.message ?? `rows=${roster.data?.length}`,
  );

  const authed = await fetch(`${APP_URL}/api/me`, {
    headers: { Authorization: `Bearer ${director.session.access_token}` },
  });
  const authedBody = (await authed.json()) as { profile?: { role?: string } };
  record(
    "GET /api/me с Bearer → 200 director",
    authed.status === 200 && authedBody.profile?.role === "director",
    `status=${authed.status} role=${authedBody.profile?.role}`,
  );

  const anon = await fetch(`${APP_URL}/api/me`);
  const anonBody = (await anon.json()) as { error?: { code?: string } };
  record(
    "GET /api/me без заголовка → 401",
    anon.status === 401 && anonBody.error?.code === "unauthorized",
    `status=${anon.status} code=${anonBody.error?.code}`,
  );

  const tv = await signIn("tv@demo.local");
  const tvRoster = await tv.supabase.from("profiles").select("id");
  record(
    "tv: profiles = 1 строка (своя)",
    !tvRoster.error && tvRoster.data?.length === 1,
    tvRoster.error?.message ?? `rows=${tvRoster.data?.length}`,
  );

  await director.supabase.auth.signOut();
  await tv.supabase.auth.signOut();
}

main()
  .catch((error: unknown) => {
    record("smoke", false, error instanceof Error ? error.message : String(error));
  })
  .finally(() => {
    const width = Math.max(...checks.map((check) => check.name.length));
    for (const check of checks) {
      console.log(`${check.ok ? "ok  " : "FAIL"}  ${check.name.padEnd(width)}  ${check.detail}`);
    }
    process.exit(checks.some((check) => !check.ok) ? 1 : 0);
  });
