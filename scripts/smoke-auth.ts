/**
 * Auth smoke: RLS visibility for two roles plus the /api/me contract.
 * Requires a running `pnpm dev` on APP_URL (default http://localhost:3000).
 */
import { apiSession, APP_URL, finish, record, recordError } from "./lib/smoke";

const PASSWORD = "demo1234";

async function main() {
  const director = await apiSession("director@demo.local", PASSWORD);

  const own = await director.supabase.from("profiles").select("role").eq("id", director.userId).single();
  record("director: свой профиль под RLS = director", !own.error && own.data?.role === "director", own.error?.message ?? `role=${own.data?.role}`);

  const roster = await director.supabase.from("profiles").select("id");
  record("director: profiles = 9 строк", !roster.error && roster.data?.length === 9, roster.error?.message ?? `rows=${roster.data?.length}`);

  const authed = await fetch(`${APP_URL}/api/me`, { headers: { Authorization: `Bearer ${director.token}` } });
  const authedBody = (await authed.json()) as { profile?: { role?: string } };
  const isDirector = authed.status === 200 && authedBody.profile?.role === "director";
  record("GET /api/me с Bearer → 200 director", isDirector, `status=${authed.status} role=${authedBody.profile?.role}`);

  const anon = await fetch(`${APP_URL}/api/me`);
  const anonBody = (await anon.json()) as { error?: { code?: string } };
  const refused = anon.status === 401 && anonBody.error?.code === "unauthorized";
  record("GET /api/me без заголовка → 401", refused, `status=${anon.status} code=${anonBody.error?.code}`);

  const tv = await apiSession("tv@demo.local", PASSWORD);
  const tvRoster = await tv.supabase.from("profiles").select("id");
  record("tv: profiles = 1 строка (своя)", !tvRoster.error && tvRoster.data?.length === 1, tvRoster.error?.message ?? `rows=${tvRoster.data?.length}`);

  await director.supabase.auth.signOut();
  await tv.supabase.auth.signOut();
}

main()
  .catch((error: unknown) => recordError("smoke", error))
  .finally(() => finish());
