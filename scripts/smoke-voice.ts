/**
 * Voice pipeline smoke: /api/voice/parse + /confirm and the task RPC routes,
 * end to end against a running `pnpm dev` and the dev Supabase project.
 * One real Claude call (~$0.01); STT is not exercised — no audio fixture here.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

process.loadEnvFile(".env.local");

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = "demo1234";
const TRANSCRIPT =
  "Марат, подготовь КП по Казхрому завтра до обеда. Ерлану Б. плюс десять";

if (!SUPABASE_URL || !ANON_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are missing in .env.local");
  process.exit(1);
}

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];

function record(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
}

type Session = { supabase: SupabaseClient; token: string; userId: string };

async function signIn(email: string): Promise<Session> {
  const supabase = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return { supabase, token: data.session.access_token, userId: data.session.user.id };
}

type ApiResult = { status: number; body: Record<string, unknown> };

async function post(path: string, token: string | null, payload: unknown): Promise<ApiResult> {
  const res = await fetch(`${APP_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

type Entity = Record<string, unknown> & { kind: string; blocked?: string };

/** jsonb does not preserve key order, so the replayed answer needs a stable form. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown) => {
    if (!val || typeof val !== "object" || Array.isArray(val)) return val;
    const entries = Object.entries(val as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return Object.fromEntries(entries);
  });
}

async function main() {
  const director = await signIn("director@demo.local");
  const marat = await signIn("marat@demo.local");
  const erlan = await signIn("erlan.b@demo.local");

  // (а) parse of a two-entity phrase: a task for Марат + points for Ерлан Б.
  const parseCrid = randomUUID();
  const parsed = await post("/api/voice/parse", director.token, {
    transcript: TRANSCRIPT,
    source: "typed",
    client_request_id: parseCrid,
  });
  const entities = (parsed.body.entities ?? []) as Entity[];
  const points = entities.find((e) => e.kind === "points");
  record(
    "а) parse → 2 сущности (task + points)",
    parsed.status === 200 && entities.length === 2 && entities.some((e) => e.kind === "task") && !!points,
    `status=${parsed.status} kinds=${entities.map((e) => e.kind).join(",")}`,
  );
  // source='typed' with amount>0 is legal at parse time: D-30 blocks only amount<0,
  // D-36 only source='shared'. G.22 (points not persisted in the pilot) is enforced
  // one step later — confirm_voice_batch drops them into `skipped`, checked in (в).
  record(
    "а) points не blocked при typed +10 (D-30/D-36)",
    points?.blocked === undefined,
    `blocked=${String(points?.blocked)}`,
  );

  // (б) same client_request_id → same answer, no second model call
  const again = await post("/api/voice/parse", director.token, {
    transcript: TRANSCRIPT,
    source: "typed",
    client_request_id: parseCrid,
  });
  const sameEntities = stable(again.body.entities) === stable(parsed.body.entities);
  record(
    "б) повтор parse → те же сущности",
    again.status === 200 && sameEntities,
    `status=${again.status} identical=${sameEntities}`,
  );

  const logs = await director.supabase
    .from("ai_logs")
    .select("id")
    .eq("client_request_id", parseCrid)
    .eq("kind", "parse");
  record(
    "б) в ai_logs ровно одна строка parse",
    !logs.error && logs.data?.length === 1,
    logs.error?.message ?? `rows=${logs.data?.length}`,
  );

  // (в) confirm. postprocess leaves assignee_id null and keeps the match in
  // entity.assignee — accepting the suggested chip is what /confirm does, so the
  // smoke does it too before handing the batch to the RPC.
  const confirmedEntities = entities.map((entity) => {
    const suggestion = (entity.assignee as { user_id?: string } | undefined)?.user_id;
    return suggestion ? { ...entity, assignee_id: suggestion } : entity;
  });

  const confirmed = await post("/api/voice/confirm", director.token, {
    client_request_id: parseCrid,
    source: "typed",
    transcript: TRANSCRIPT,
    parsed_entities: entities,
    confirmed_entities: confirmedEntities,
    force_now: true,
  });
  const result = (confirmed.body.result ?? {}) as {
    task_ids?: string[];
    skipped?: { kind: string; reason: string }[];
  };
  const taskIds = result.task_ids ?? [];
  record(
    "в) confirm → одна задача создана",
    confirmed.status === 200 && taskIds.length === 1,
    `status=${confirmed.status} task_ids=${taskIds.length} ${JSON.stringify(confirmed.body.error ?? "")}`,
  );
  record(
    "в) points ушёл в skipped",
    (result.skipped ?? []).some((s) => s.kind === "points"),
    JSON.stringify(result.skipped ?? []),
  );

  const taskId = taskIds[0];
  if (!taskId) throw new Error("no task created — the checks below cannot run");

  // (г) RLS: the task belongs to Марат, Ерлан must not see it
  const foreign = await erlan.supabase.from("tasks").select("id").eq("id", taskId);
  record(
    "г) чужая задача не видна erlan.b (RLS)",
    !foreign.error && foreign.data?.length === 0,
    foreign.error?.message ?? `rows=${foreign.data?.length}`,
  );

  const own = await marat.supabase.from("tasks").select("id, status").eq("id", taskId);
  record(
    "г) своя задача видна marat",
    !own.error && own.data?.length === 1,
    own.error?.message ?? `rows=${own.data?.length}`,
  );

  const acceptCrid = randomUUID();
  const accepted = await post(`/api/tasks/${taskId}/transition`, marat.token, {
    to_status: "accepted",
    client_request_id: acceptCrid,
  });
  record(
    "г) marat: transition → accepted",
    accepted.status === 200 &&
      (accepted.body.result as { status?: string } | undefined)?.status === "accepted",
    `status=${accepted.status} ${JSON.stringify(accepted.body.result ?? accepted.body.error ?? "")}`,
  );

  const repeat = await post(`/api/tasks/${taskId}/transition`, marat.token, {
    to_status: "accepted",
    client_request_id: acceptCrid,
  });
  record(
    "г) повтор того же client_request_id → 200 duplicate",
    repeat.status === 200 && repeat.body.duplicate === true,
    `status=${repeat.status} duplicate=${String(repeat.body.duplicate)}`,
  );

  // (д) director revokes the task (D-01)
  const revoked = await post(`/api/tasks/${taskId}/revoke`, director.token, {
    client_request_id: randomUUID(),
  });
  const revokeResult = (revoked.body.result ?? {}) as { action?: string };
  record(
    "д) director: revoke → revoked",
    revoked.status === 200 && revokeResult.action === "revoked",
    `status=${revoked.status} action=${String(revokeResult.action)}`,
  );

  // (е) auth contract
  const noToken = await post("/api/voice/parse", null, {
    transcript: TRANSCRIPT,
    source: "typed",
    client_request_id: randomUUID(),
  });
  record(
    "е) без токена → 401 unauthorized",
    noToken.status === 401 && (noToken.body.error as { code?: string } | undefined)?.code === "unauthorized",
    `status=${noToken.status}`,
  );

  const asEmployee = await post("/api/voice/parse", marat.token, {
    transcript: TRANSCRIPT,
    source: "typed",
    client_request_id: randomUUID(),
  });
  record(
    "е) employee на /parse → 403 forbidden",
    asEmployee.status === 403 &&
      (asEmployee.body.error as { code?: string } | undefined)?.code === "forbidden",
    `status=${asEmployee.status}`,
  );

  await Promise.all([
    director.supabase.auth.signOut(),
    marat.supabase.auth.signOut(),
    erlan.supabase.auth.signOut(),
  ]);
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
