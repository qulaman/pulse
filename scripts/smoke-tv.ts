/**
 * TV smoke: what the kiosk sees and what it does not.
 * The `tv` role reads no tasks, no people, no company — only `tv_events` and `tv_summary()`
 * (migrations 20260917190000 / 20260917191000, docs/DATABASE.md «tv_events»). Checked from
 * both sides: the kiosk sees the feed, an employee does not, and the guest mask is made in the base.
 *
 *   pnpm smoke:tv     — the dev project, the demo sign-ins of the seed
 */
import { demoPassword } from "./lib/login";
import { apiSession, finish, loadEnv, record, refuseWhenBusy, serviceClient } from "./lib/smoke";

loadEnv(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
const PASSWORD = demoPassword();
const signIn = (email: string) => apiSession(email, PASSWORD);

type Summary = {
  counts?: Record<string, number>;
  today?: Record<string, number>;
  week?: { day: string; done: number }[];
  rating?: { name: string; points: number | null }[];
  load?: { name: string; active: number; overdue?: number }[];
};

async function main() {
  // dev is shared with the owner: the smoke writes, so a live session is left alone
  await refuseWhenBusy();
  const service = serviceClient();

  // --- the projection: a new task must show up in the wall's feed -------------------
  const { data: people } = await service
    .from("profiles")
    .select("id, company_id, role, full_name")
    .in("role", ["director", "employee"]);
  const director = people?.find((p) => p.role === "director");
  // the task goes to a smoke employee when there is one: the smoke writes to no live person
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

  // --- the kiosk ---------------------------------------------------------------------
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

  // --- an employee: does not see the wall's feed at all ------------------------------
  const worker = await signIn("erlan.b@demo.local");
  const workerFeed = await worker.supabase.from("tv_events").select("id").limit(5);
  record(
    "сотрудник: ленты ТВ не видит",
    !workerFeed.error && workerFeed.data?.length === 0,
    workerFeed.error?.message ?? `rows=${workerFeed.data?.length}`,
  );

  const workerSummary = await worker.supabase.rpc("tv_summary", { p_guest: false });
  record("сотрудник: tv_summary запрещён", workerSummary.error !== null, workerSummary.error?.message ?? "call passed");

  // --- the director: the wall is open to him too -------------------------------------
  const boss = await signIn("director@demo.local");
  const bossFeed = await boss.supabase.from("tv_events").select("id").limit(5);
  record(
    "директор: ленту ТВ видит",
    !bossFeed.error && (bossFeed.data?.length ?? 0) > 0,
    bossFeed.error?.message ?? `rows=${bossFeed.data?.length}`,
  );

  // --- cleanup: the task goes with its events (fk on delete cascade) -----------------
  await service.from("tasks").delete().eq("id", task.id);
  const leftovers = await service.from("tv_events").select("id").eq("task_id", task.id);
  record("уборка: смоук-задача и её события удалены", leftovers.data?.length === 0, `rows=${leftovers.data?.length}`);
}

main()
  .then(() => finish())
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
