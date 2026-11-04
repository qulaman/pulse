/**
 * Who may enter the developers' console (D-157, tasks/029).
 *   pnpm ops:grant <email> [--note "..."]   — make an operator; a new login prints its password ONCE
 *   pnpm ops:grant <email> --revoke         — take the console away, the sessions end
 *   pnpm ops:grant <email> --reset-mfa      — a lost phone: the factors go, the next sign-in sets anew
 *   pnpm ops:grant <email> --reset-password — a forgotten password: a new one, printed ONCE
 *
 * Target = the Supabase project in .env.local (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
 * An operator stands outside every company: a person with a `profiles` row is refused, in every
 * mode — the same login must never be both.
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function parseArgs(argv: string[]) {
  const noteAt = argv.indexOf("--note");
  const note = noteAt >= 0 ? (argv[noteAt + 1] ?? null) : null;
  const email = argv.find((arg, index) => !arg.startsWith("--") && (noteAt < 0 || index !== noteAt + 1));
  return { email, note, revoke: argv.includes("--revoke"), resetMfa: argv.includes("--reset-mfa"), resetPassword: argv.includes("--reset-password") };
}

async function findUserId(supabase: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const hit = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function rpc(supabase: SupabaseClient, name: string, args: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc(name, args);
  if (error) throw new Error(`${name} failed: ${error.message}`);
}

async function grant(supabase: SupabaseClient, email: string, known: string | null, note: string | null): Promise<void> {
  let userId = known;
  if (!userId) {
    const password = randomBytes(24).toString("base64url");
    const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error(`createUser failed: ${created.error?.message}`);
    userId = created.data.user.id;
    // before the grant: a failed grant is run again, and this password exists nowhere else
    console.log(`пароль (показан один раз, больше нигде не сохранён): ${password}`);
  }
  await rpc(supabase, "ops_grant_operator", { p_user: userId, p_note: note });
  console.log(`${email} — оператор. Первый вход: /ops/login, пароль, затем приложение-аутентификатор.`);
}

async function resetMfa(supabase: SupabaseClient, email: string, userId: string): Promise<void> {
  const { data, error } = await supabase.auth.admin.mfa.listFactors({ userId });
  if (error) throw new Error(`listFactors failed: ${error.message}`);
  for (const factor of data.factors) {
    const deleted = await supabase.auth.admin.mfa.deleteFactor({ id: factor.id, userId });
    if (deleted.error) throw new Error(`deleteFactor failed: ${deleted.error.message}`);
  }
  console.log(`${email}: факторов снято — ${data.factors.length}. Следующий вход подключит приложение заново.`);
}

async function newPassword(supabase: SupabaseClient, email: string, userId: string): Promise<void> {
  const password = randomBytes(24).toString("base64url");
  const updated = await supabase.auth.admin.updateUserById(userId, { password });
  if (updated.error) throw new Error(`updateUser failed: ${updated.error.message}`);
  console.log(`${email}: новый пароль (показан один раз, больше нигде не сохранён): ${password}`);
}

async function main(): Promise<void> {
  const { email, note, revoke, resetMfa: reset, resetPassword } = parseArgs(process.argv.slice(2));
  if (!email || !email.includes("@")) {
    console.error('использование: pnpm ops:grant <email> [--note "..."] [--revoke] [--reset-mfa] [--reset-password]');
    process.exit(2);
  }
  const envFile = resolve(".env.local");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY не заданы в .env.local");
    process.exit(2);
  }

  console.log(`инстанс: ${url}`);
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const userId = await findUserId(supabase, email);

  if (userId) {
    const profile = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
    if (profile.error) throw new Error(`profiles read failed: ${profile.error.message}`);
    if (profile.data) {
      console.error(`${email} — человек компании: оператор стоит вне компаний, нужна отдельная почта`);
      process.exit(2);
    }
  }

  if (revoke || reset || resetPassword) {
    if (!userId) {
      console.error(`${email}: такого пользователя нет`);
      process.exit(2);
    }
    if (reset) await resetMfa(supabase, email, userId);
    if (resetPassword) await newPassword(supabase, email, userId);
    if (revoke) {
      await rpc(supabase, "ops_revoke_operator", { p_user: userId });
      console.log(`${email}: доступ к консоли снят, сессии закрыты`);
    }
    return;
  }
  await grant(supabase, email, userId, note);
}

// exitCode, not exit(): on Windows an immediate exit trips libuv while the HTTP keep-alive closes.
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
