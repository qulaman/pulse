/**
 * Realtime smoke: postgres_changes on `tasks` reaches the assignee, respects RLS
 * for everybody else, and carries status updates back to the director.
 * Talks to the dev Supabase project directly (RPC), no dev server needed.
 */
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

process.loadEnvFile(".env.local");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = "demo1234";
const EVENT_TIMEOUT_MS = 10_000;
const SILENCE_MS = 3_000;
const SETTLE_MS = 2_000;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are missing in .env.local");
  process.exit(1);
}

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const record = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

type Session = { supabase: SupabaseClient; userId: string };

async function signIn(email: string): Promise<Session> {
  const supabase = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  await supabase.realtime.setAuth(data.session.access_token);
  return { supabase, userId: data.session.user.id };
}

type TaskEvent = { eventType: string; new: Record<string, unknown> };

/** Subscribes and resolves once the channel is live; events land in `sink`. */
function listen(session: Session, name: string, filter: string | undefined, sink: TaskEvent[]) {
  return new Promise<RealtimeChannel>((resolve, reject) => {
    const channel = session.supabase
      .channel(name)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", ...(filter ? { filter } : {}) },
        (payload) => sink.push({ eventType: payload.eventType, new: payload.new as Record<string, unknown> }),
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") resolve(channel);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error(`${name}: ${status} ${err?.message ?? ""}`));
      });
  });
}

function waitFor(sink: TaskEvent[], predicate: (e: TaskEvent) => boolean, timeoutMs: number) {
  return new Promise<TaskEvent | null>((resolve) => {
    const started = Date.now();
    const tick = () => {
      const hit = sink.find(predicate);
      if (hit) return resolve(hit);
      if (Date.now() - started > timeoutMs) return resolve(null);
      setTimeout(tick, 100);
    };
    tick();
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const director = await signIn("director@demo.local");
  const marat = await signIn("marat@demo.local");
  const erlan = await signIn("erlan.b@demo.local");

  const maratEvents: TaskEvent[] = [];
  const erlanEvents: TaskEvent[] = [];
  const directorEvents: TaskEvent[] = [];

  const channels = await Promise.all([
    listen(marat, "smoke:marat", `assignee_id=eq.${marat.userId}`, maratEvents),
    listen(erlan, "smoke:erlan", undefined, erlanEvents),
    listen(director, "smoke:director", undefined, directorEvents),
  ]);
  record("три канала подписаны (SUBSCRIBED)", true, "marat / erlan / director");
  // SUBSCRIBED confirms the channel join; the WAL listener attaches a moment later.
  // A change fired inside that window is lost for good — same for a PWA that just resubscribed.
  await sleep(SETTLE_MS);

  // the director sends Марат a task through the RPC — same path as /api/voice/confirm
  const crid = randomUUID();
  const confirmed = await director.supabase.rpc("confirm_voice_batch", {
    payload: {
      source: "typed",
      transcript: "smoke realtime",
      confirmed_entities: [
        {
          kind: "task",
          assignee_id: marat.userId,
          group_id: null,
          title: "Realtime smoke",
          body: null,
          deadline_iso: null,
          priority: "normal",
          scheduled_send_at: null,
        },
      ],
      was_edited: false,
      edit_fields: [],
      force_now: true,
    },
    client_request_id: crid,
  });
  const taskId = ((confirmed.data as { task_ids?: string[] } | null)?.task_ids ?? [])[0];
  record("director: confirm_voice_batch создал задачу", Boolean(taskId), confirmed.error?.message ?? `task=${taskId}`);
  if (!taskId) throw new Error("no task — cannot continue");

  const insert = await waitFor(maratEvents, (e) => e.eventType === "INSERT" && e.new.id === taskId, EVENT_TIMEOUT_MS);
  record("marat получил INSERT без F5", insert !== null, insert ? `status=${String(insert.new.status)}` : `timeout; events=${JSON.stringify(maratEvents.map((e) => e.eventType))}`);

  await sleep(SILENCE_MS);
  const leaked = erlanEvents.some((e) => e.new.id === taskId);
  record("erlan.b НЕ получил чужую задачу (RLS на realtime)", !leaked, `events=${erlanEvents.length}`);

  const accepted = await marat.supabase.rpc("transition_task", {
    task_id: taskId,
    to_status: "accepted",
    payload: {},
    client_request_id: randomUUID(),
  });
  record("marat: transition_task → accepted", !accepted.error, accepted.error?.message ?? "ok");

  const update = await waitFor(
    directorEvents,
    (e) => e.eventType === "UPDATE" && e.new.id === taskId && e.new.status === "accepted",
    EVENT_TIMEOUT_MS,
  );
  record("director получил UPDATE accepted без F5", update !== null, update ? "ok" : "timeout");

  const revoked = await director.supabase.rpc("revoke_task", { task_id: taskId, client_request_id: randomUUID() });
  record("director: revoke_task (уборка)", !revoked.error, revoked.error?.message ?? "ok");

  for (const channel of channels) await channel.unsubscribe();
  await Promise.all([director, marat, erlan].map((s) => s.supabase.auth.signOut()));
}

main()
  .catch((error: unknown) => record("smoke", false, error instanceof Error ? error.message : String(error)))
  .finally(() => {
    const width = Math.max(...checks.map((c) => c.name.length));
    for (const c of checks) console.log(`${c.ok ? "ok  " : "FAIL"}  ${c.name.padEnd(width)}  ${c.detail}`);
    process.exit(checks.some((c) => !c.ok) ? 1 : 0);
  });
