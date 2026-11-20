/**
 * What every smoke shares: the variables of .env.local, the app's address, the list of checks
 * with its summary and exit code, a session over the API, a typed task for a smoke to work on,
 * and the one rule for «somebody works on dev right now» (dev is shared with the owner, who
 * tests there with real phones). The browser's way in is scripts/lib/login.ts.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

/** The variables a smoke cannot run without; a missing one ends the run with exit code 1. */
export function loadEnv<K extends string>(required: readonly K[]): Record<K, string> {
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    console.error(`${missing.join(" / ")} missing in .env.local`);
    process.exit(1);
  }
  return Object.fromEntries(required.map((name) => [name, process.env[name] as string])) as Record<K, string>;
}

export type Check = { name: string; ok: boolean; detail: string };
export const checks: Check[] = [];

export function record(name: string, ok: boolean, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
}

/** A thrown error as one failed check. */
export const recordError = (name: string, error: unknown) => record(name, false, error instanceof Error ? error.message : String(error));

/** A step dev's data does not allow today: said, counted as passed — a smoke writes nothing to make it. */
export function skip(name: string, why: string) {
  checks.push({ name, ok: true, detail: `пропущено: ${why}` });
  console.log(`skip  ${name}  ${why}`);
}

/** «N/M ok» (and `note` after it), then the exit: 1 when a check failed. */
export function finish(note = ""): never {
  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} ok${note ? ` · ${note}` : ""}`);
  process.exit(failed.length > 0 ? 1 : 0);
}

export type ApiSession = { supabase: SupabaseClient; userId: string; token: string };

/** Signs in by email and password over the API, the way a phone would — RLS applies. */
export async function apiSession(email: string, password: string): Promise<ApiSession> {
  const env = loadEnv(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return { supabase, userId: data.session.user.id, token: data.session.access_token };
}

/** The service role: past RLS, for a smoke's own setup and cleanup only. */
export function serviceClient(): SupabaseClient {
  const env = loadEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** The session cookies of an answer — what a fresh browser would keep. */
export const sessionCookie = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => !c.endsWith("="))
    .join("; ");

/** An order typed by `author` and sent at once (confirm_voice_batch); its id. */
export async function issueTask(author: ApiSession, assigneeId: string, title: string, deadlineIso: string | null = null): Promise<string> {
  const confirmed = await author.supabase.rpc("confirm_voice_batch", {
    payload: {
      source: "typed",
      transcript: title,
      confirmed_entities: [{ kind: "task", assignee_id: assigneeId, group_id: null, title, body: null, deadline_iso: deadlineIso, priority: "normal", scheduled_send_at: null }],
      was_edited: false,
      edit_fields: [],
      force_now: true,
    },
    client_request_id: randomUUID(),
  });
  const taskId = ((confirmed.data as { task_ids?: string[] } | null)?.task_ids ?? [])[0];
  if (!taskId) throw new Error(`confirm_voice_batch: ${confirmed.error?.message ?? "no task"}`);
  return taskId;
}

/**
 * Who works on dev right now — the one rule every smoke that writes asks: a voice command, or a
 * task that is not a smoke's touched within `minutes`. The reason, or null (nobody; or no service
 * key to ask with).
 */
export async function devBusy({ minutes = 30 }: { minutes?: number } = {}): Promise<string | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const admin = serviceClient();
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const voice = await admin.from("ai_logs").select("id").eq("source", "voice").gt("created_at", since).limit(1);
  const touched = await admin.from("tasks").select("title").gt("updated_at", since).not("title", "ilike", "%smoke%").limit(3);
  if (!voice.data?.length && !touched.data?.length) return null;
  return `somebody is active on dev in the last ${minutes} min (${touched.data?.map((t) => t.title).join("; ") || "voice"})`;
}

/** Ends the run (exit code 2) while somebody works on dev. FORCE=1 runs anyway; LOGIN_ONLY=1 writes nothing. */
export async function refuseWhenBusy(minutes = 30) {
  if (process.env.FORCE === "1" || process.env.LOGIN_ONLY === "1") return;
  const busy = await devBusy({ minutes });
  if (!busy) return;
  console.error(`${busy}; set FORCE=1 to run anyway`);
  process.exit(2);
}
