/**
 * ТВ-смоук: что киоску видно и что ему не видно.
 * Роль `tv` не читает ни задач, ни людей, ни компании — только `tv_events` и `tv_summary()`
 * (миграции 20260917190000 / 20260917191000, docs/DATABASE.md «tv_events»). Проверяем это
 * с обеих сторон: киоск видит ленту, сотрудник её не видит, а гостевая маска считается в БД.
 *
 *   pnpm smoke:tv     — dev-проект, демо-логины из seed
 */
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = "demo1234";
/** Владелец делит dev с нами: живую сессию скриптом не трогаем (тот же guard, что в smoke-board). */
const QUIET_MINUTES = 30;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are missing in .env.local");
  process.exit(1);
}

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const record = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

function anonClient() {
  return createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signIn(email: string) {
  const supabase = anonClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return { supabase, userId: data.session.user.id };
}

type Summary = {
  counts?: Record<string, number>;
  today?: Record<string, number>;
  week?: { day: string; done: number }[];
  rating?: { name: string; points: number | null }[];
  load?: { name: string; active: number; overdue?: number }[];
};

async function main() {
  const service = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  // dev делим с владельцем: смоук пишет в базу, поэтому живую сессию не перебиваем
  if (process.env.FORCE !== "1") {
    const since = new Date(Date.now() - QUIET_MINUTES * 60_000).toISOString();
    const { data: busy } = await service.from("ai_logs").select("id").gt("created_at", since).limit(1);
    if (busy && busy.length > 0) {
      throw new Error(`на dev кто-то работает последние ${QUIET_MINUTES} мин — запусти с FORCE=1, если это ты`);
    }
  }

  // --- проекция: новая задача обязана появиться в ленте экрана ------------------------
  const { data: people } = await service
    .from("profiles")
    .select("id, company_id, role, full_name")
    .in("role", ["director", "employee"]);
  const director = people?.find((p) => p.role === "director");
  // задача уйдёт смоук-сотруднику, если он есть: живым людям компании смоук не пишет
  const employee =
    people?.find((p) => p.role === "employee" && p.full_name.startsWith("Смоук")) ??
    people?.find((p) => p.role === "employee");
  if (!director || !employee) throw new Error("dev seed has no director/employee");

  const { data: task, error: taskError } = await service
    .from("tasks")
    .insert({
      company_id: director.company_id,
      author_id: director.id,
      assignee_id: employee.id,
      title: "смоук ТВ: проекция события",
      status: "sent",
    })
    .select("id")
    .single();
  if (taskError || !task) throw new Error(`task insert failed: ${taskError?.message}`);

  const projected = await service.from("tv_events").select("kind, payload").eq("task_id", task.id);
  record(
    "проекция: задача → событие task_sent",
    !projected.error && projected.data?.some((row) => row.kind === "task_sent") === true,
    projected.error?.message ?? `rows=${projected.data?.length}`,
  );

  const guestPayload = await service.from("tv_events").select("payload_guest").eq("task_id", task.id).limit(1).single();
  const guest = guestPayload.data?.payload_guest as { name?: string | null; title?: string | null } | undefined;
  record(
    "гостевая копия: имя без фамилии, заголовка нет (D-33)",
    !!guest && typeof guest.name === "string" && !guest.name.includes(" ") && guest.title === null,
    JSON.stringify(guest),
  );

  // --- киоск ------------------------------------------------------------------------
  const tv = await signIn("tv@demo.local");

  const feed = await tv.supabase.from("tv_events").select("id").limit(10);
  record("tv: читает свою ленту", !feed.error && (feed.data?.length ?? 0) > 0, feed.error?.message ?? `rows=${feed.data?.length}`);

  const tvTasks = await tv.supabase.from("tasks").select("id").limit(1);
  record("tv: задач не видит", !tvTasks.error && tvTasks.data?.length === 0, tvTasks.error?.message ?? `rows=${tvTasks.data?.length}`);

  const tvCompany = await tv.supabase.from("companies").select("id").limit(1);
  record("tv: компанию не видит", !tvCompany.error && tvCompany.data?.length === 0, tvCompany.error?.message ?? `rows=${tvCompany.data?.length}`);

  const tvProfiles = await tv.supabase.from("profiles").select("id");
  record(
    "tv: из людей видит только себя",
    !tvProfiles.error && tvProfiles.data?.length === 1 && tvProfiles.data[0]?.id === tv.userId,
    tvProfiles.error?.message ?? `rows=${tvProfiles.data?.length}`,
  );

  const tvWrite = await tv.supabase.from("tv_events").insert({
    company_id: director.company_id,
    kind: "task_done",
    payload: {},
    payload_guest: {},
  });
  record("tv: писать в ленту не может", tvWrite.error !== null, tvWrite.error?.message ?? "insert passed");

  const summaryCall = await tv.supabase.rpc("tv_summary", { p_guest: false });
  const summary = summaryCall.data as Summary | null;
  record(
    "tv_summary: вердикт, числа дня и неделя",
    !summaryCall.error &&
      typeof summary?.counts?.overdue === "number" &&
      typeof summary?.today?.in_work === "number" &&
      summary?.week?.length === 7,
    summaryCall.error?.message ?? `week=${summary?.week?.length}`,
  );

  record(
    "tv_summary: загрузка людей без персональных просрочек (D-45)",
    (summary?.load ?? []).every((row) => row.overdue === undefined),
    JSON.stringify(summary?.load?.[0] ?? null),
  );

  const guestCall = await tv.supabase.rpc("tv_summary", { p_guest: true });
  const guestSummary = guestCall.data as Summary | null;
  record(
    "tv_summary(guest): без фамилий и без очков",
    !guestCall.error &&
      (guestSummary?.rating ?? []).every((row) => row.points === null && !row.name.includes(" ")) &&
      (guestSummary?.load ?? []).every((row) => !row.name.includes(" ")),
    guestCall.error?.message ?? `rating=${guestSummary?.rating?.length} load=${guestSummary?.load?.length}`,
  );

  // --- сотрудник: ленту экрана не видит вовсе ----------------------------------------
  const worker = await signIn("erlan.b@demo.local");
  const workerFeed = await worker.supabase.from("tv_events").select("id").limit(5);
  record(
    "сотрудник: ленты ТВ не видит",
    !workerFeed.error && workerFeed.data?.length === 0,
    workerFeed.error?.message ?? `rows=${workerFeed.data?.length}`,
  );

  const workerSummary = await worker.supabase.rpc("tv_summary", { p_guest: false });
  record("сотрудник: tv_summary запрещён", workerSummary.error !== null, workerSummary.error?.message ?? "call passed");

  // --- директор: экран доступен и ему ------------------------------------------------
  const boss = await signIn("director@demo.local");
  const bossFeed = await boss.supabase.from("tv_events").select("id").limit(5);
  record(
    "директор: ленту ТВ видит",
    !bossFeed.error && (bossFeed.data?.length ?? 0) > 0,
    bossFeed.error?.message ?? `rows=${bossFeed.data?.length}`,
  );

  // --- уборка: задача уходит вместе со своими событиями (fk on delete cascade) -------
  await service.from("tasks").delete().eq("id", task.id);
  const leftovers = await service.from("tv_events").select("id").eq("task_id", task.id);
  record("уборка: смоук-задача и её события удалены", leftovers.data?.length === 0, `rows=${leftovers.data?.length}`);
}

main()
  .then(() => {
    for (const check of checks) console.log(`${check.ok ? "✓" : "✗"} ${check.name} — ${check.detail}`);
    const failed = checks.filter((check) => !check.ok).length;
    console.log(failed === 0 ? `\nвсе проверки прошли (${checks.length})` : `\nпровалено: ${failed} из ${checks.length}`);
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
