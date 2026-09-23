import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

/**
 * Wipes one company's activity — tasks, messages, awards, announcements, AI logs,
 * drafts, receipts — and its uploaded audio and photos. People, company settings and
 * the phones' push subscriptions stay, so the demo starts over with the same team.
 * Takes a service-role client: the caller has already checked who is asking and
 * whether this instance allows it (DEMO_RESET_ENABLED). Shared by the reset button
 * (`/api/admin/reset-demo`) and `pnpm db:clean`.
 */

/** Children first — the FKs without cascade come before their parents. */
const ACTIVITY_TABLES = [
  "task_messages",
  "point_transactions",
  "announcements", // announcement_acks cascade
  "tasks", // notification_deliveries of tasks cascade
  "notes", // converted_* of a deleted task are nulled, the note itself goes here
  "events", // event_participants cascade with the event row
  "errands", // their outbox rows go with notification_deliveries below
  "visits", // «к вам посетитель» (D-96): its outbox rows go the same way
  "reminders",
  "recurrence_rules",
  "inbox_items",
  "ai_logs",
  "ingest_batches",
  "notification_deliveries",
] as const;

export type ActivityTable = (typeof ACTIVITY_TABLES)[number];

export type ResetReport = { rows: Record<ActivityTable, number>; files: number; warnings: string[] };

const BUCKETS = ["voice", "photos"] as const;

export async function resetCompanyDemo(admin: SupabaseClient<Database>, companyId: string): Promise<ResetReport> {
  const rows = {} as Record<ActivityTable, number>;
  const warnings: string[] = [];

  for (const table of ACTIVITY_TABLES) {
    const { count, error } = await admin.from(table).delete({ count: "exact" }).eq("company_id", companyId);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows[table] = count ?? 0;
  }

  // the wall is state, not activity: a reset sends it back to the ether, it is not deleted
  // (D-76) — the kiosk keeps its row, its heartbeat and its scene.
  const { error: wall } = await admin
    .from("tv_state")
    .update({ mode: "ether", employee_id: null, task_id: null, expires_at: null, guest: false, guest_until: null })
    .eq("company_id", companyId);
  if (wall) warnings.push(`tv_state: ${wall.message}`);

  // objects live under <company>/<user>/<file>: two levels of listing, one remove per folder
  let files = 0;
  for (const bucket of BUCKETS) {
    const { data: folders, error } = await admin.storage.from(bucket).list(companyId, { limit: 1000 });
    if (error) {
      warnings.push(`${bucket}: ${error.message}`);
      continue;
    }
    for (const folder of folders ?? []) {
      const { data: objects } = await admin.storage.from(bucket).list(`${companyId}/${folder.name}`, { limit: 1000 });
      const paths = (objects ?? []).map((object) => `${companyId}/${folder.name}/${object.name}`);
      if (paths.length === 0) continue;
      const { error: removal } = await admin.storage.from(bucket).remove(paths);
      if (removal) warnings.push(`${bucket}/${folder.name}: ${removal.message}`);
      else files += paths.length;
    }
  }

  return { rows, files, warnings };
}

/** «Стёр: 12 задач, 40 сообщений, 3 файла» — the toast after a reset. */
export function describeReset(report: ResetReport): string {
  const parts = [
    `${report.rows.tasks} задач`,
    `${report.rows.task_messages} сообщений`,
    `${report.rows.announcements} объявлений`,
    `${report.rows.point_transactions} начислений`,
  ];
  if (report.files > 0) parts.push(`${report.files} файлов`);
  return `Стёр: ${parts.join(", ")}`;
}
