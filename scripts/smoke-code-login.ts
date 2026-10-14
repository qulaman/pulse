/**
 * Code sign-in smoke (D-135), through the API of a running app: the director issues a code for
 * Айгуль → a fresh browser (no cookies) signs in with it → the cookies are hers; the code works
 * once; a lost answer replayed with the same request id signs in again; the card sees «вошли с
 * iPhone»; a page of another site cannot post a code; an employee issues only for herself.
 * Touches only Айгуль's codes — her password and data stay as they are. Never trips the
 * attempt limits (one wrong code). Requires the migration 20261014150000 on the base and a
 * running app on APP_URL (default http://localhost:3000).
 */
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const AIGUL = "10000000-0000-0000-0000-000000000008";
const DIRECTOR = "10000000-0000-0000-0000-000000000001";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const record = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

async function bearer(email: string): Promise<string> {
  const supabase = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: "demo1234" });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return data.session.access_token;
}

async function issue(token: string | null, cookie: string | null, id: string) {
  const res = await fetch(`${APP_URL}/api/people/${id}/login-code`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ client_request_id: crypto.randomUUID() }),
  });
  return { status: res.status, body: (await res.json()) as { code?: string; link?: string; error?: { code?: string } } };
}

async function redeem(code: string, requestId: string, extra: Record<string, string> = {}) {
  const res = await fetch(`${APP_URL}/api/auth/code`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": IPHONE, ...extra },
    body: JSON.stringify({ code, client_request_id: requestId, device: "smoke-code-login" }),
  });
  // the session cookies of this answer — what a fresh browser would keep
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => !c.endsWith("="))
    .join("; ");
  return { status: res.status, cookie, body: (await res.json()) as { ok?: boolean; brand?: { name?: string }; error?: { code?: string } } };
}

async function me(cookie: string) {
  const res = await fetch(`${APP_URL}/api/me`, { headers: { cookie } });
  const body = (await res.json()) as { profile?: { userId?: string; role?: string } };
  return { status: res.status, id: body.profile?.userId };
}

async function main() {
  const director = await bearer("director@demo.local");

  const issued = await issue(director, null, AIGUL);
  const code = issued.body.code ?? "";
  record("директор выдаёт код Айгуль → 201, 8 цифр", issued.status === 201 && /^\d{8}$/.test(code), `status=${issued.status}`);
  record("в ответе ссылка на вход", /\/(login|c\/[a-z0-9-]+)$/.test(issued.body.link ?? ""), issued.body.link ?? "—");

  const statusOpen = await fetch(`${APP_URL}/api/people/${AIGUL}/login-code`, { headers: { authorization: `Bearer ${director}` } });
  const open = (await statusOpen.json()) as { state?: string };
  record("статус: ждёт входа", open.state === "open", `state=${open.state}`);

  const wrongDigit = code.slice(0, 7) + String((Number(code[7]) + 1) % 10);
  const wrong = await redeem(wrongDigit, crypto.randomUUID());
  record("неверный код → 400 bad_code", wrong.status === 400 && wrong.body.error?.code === "bad_code", `status=${wrong.status}`);

  const evil = await redeem(code, crypto.randomUUID(), { origin: "https://evil.example" });
  record("POST с чужого сайта → 403, код не тратится", evil.status === 403, `status=${evil.status}`);

  const requestId = crypto.randomUUID();
  const good = await redeem(`${code.slice(0, 4)} ${code.slice(4)}`, requestId);
  record("код «4829 1375» → 200, бренд компании", good.status === 200 && good.body.ok === true && !!good.body.brand?.name, `status=${good.status}`);
  record("ответ ставит cookie сессии", good.cookie.includes("auth-token"), good.cookie ? "есть" : "нет");

  const who = await me(good.cookie);
  record("cookie — сессия Айгуль", who.status === 200 && who.id === AIGUL, `status=${who.status} id=${who.id}`);

  const again = await redeem(code, crypto.randomUUID());
  record("тот же код второй раз → 400", again.status === 400, `status=${again.status}`);

  const replay = await redeem(code, requestId);
  const replayWho = replay.cookie ? await me(replay.cookie) : { status: 0, id: undefined };
  record("потерянный ответ, тот же запрос → снова вход", replay.status === 200 && replayWho.id === AIGUL, `status=${replay.status}`);

  const statusUsed = await fetch(`${APP_URL}/api/people/${AIGUL}/login-code`, { headers: { authorization: `Bearer ${director}` } });
  const used = (await statusUsed.json()) as { state?: string; device?: string };
  record("статус: вошли с iPhone", used.state === "used" && used.device === "iPhone", `state=${used.state} device=${used.device}`);

  const forDirector = await issue(null, good.cookie, DIRECTOR);
  record("сотрудник не выдаёт код директору → 403", forDirector.status === 403, `status=${forDirector.status}`);
  const own = await issue(null, good.cookie, AIGUL);
  record("сотрудник выдаёт код себе (другое устройство) → 201", own.status === 201, `status=${own.status}`);

  let failed = 0;
  for (const c of checks) {
    if (!c.ok) failed++;
    console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}  (${c.detail})`);
  }
  console.log(`\n${checks.length - failed}/${checks.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
