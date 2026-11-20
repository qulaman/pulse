import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { inCompanyFolder } from "@/lib/files/folder";
import type { Database } from "@/lib/supabase/types";

import type { TvPhoto } from "./photos";
import { guestOf } from "./state";

/**
 * Which report photos go on the wall, picked on the server (D-185). The kiosk's role reads no
 * task tables and no storage, so `GET /api/tv/photos` runs this under the service role — which
 * bypasses RLS: every query below is bound to the caller's company by hand (principle 6).
 *
 *  - the round («Фото»): photos of the last 7 days sent by the task's own assignee — the report —
 *    on tasks that are done; newest first;
 *  - a person on the wall (`employeeId`): that person's reports on done tasks of the last 30 days;
 *  - one task (an order on the wall, `taskId`): that task's photos at any stage, if it is the company's.
 *
 * The kiosk (role `tv`) gets a person's or an order's photos only while that person or order is the
 * one its wall row put up — it reads no task of its own choosing (G.5); the director may ask any.
 * A path is signed only inside the company's own folder of the bucket (`{company_id}/…`): a message
 * row pointing elsewhere is dropped, whoever wrote it. A guest in the office gets nothing.
 */

type Client = SupabaseClient<Database>;

/** The round shows a week of reports. */
export const RECENT_DAYS = 7;
/** The round's photos: two minutes of «Фото» at most, one every 15 s, with room to spare. */
export const RECENT_LIMIT = 12;
/** One report with ten photos would take the whole round: three per task at most. */
export const PER_TASK = 3;
/** An order on the wall shows its last photos. */
export const TASK_LIMIT = 6;
/** A person on the wall shows a month of reports, a few of them. */
export const PERSON_DAYS = 30;
export const PERSON_LIMIT = 6;
/** Photo messages read to pick the round from: the newest ones, most of them on open tasks. */
export const SCAN_LIMIT = 120;
/** The signed links live an hour; the kiosk asks again every half hour. */
export const SIGN_SECONDS = 3600;
/** Report photos live in their own bucket (`/api/files/url`). */
const BUCKET = "photos";
const DAY_MS = 86_400_000;

type MessageRow = { id: string; task_id: string; sender_id: string; file_path: string | null; created_at: string };
type TaskRow = { id: string; title: string; assignee_id: string; completed_at: string | null };

const MESSAGE_COLUMNS = "id, task_id, sender_id, file_path, created_at";
const TASK_COLUMNS = "id, title, assignee_id, completed_at";

type Options = { taskId?: string | null; employeeId?: string | null; role?: "tv" | "director"; now?: Date };

export async function loadTvPhotos(
  client: Client,
  companyId: string,
  { taskId = null, employeeId = null, role = "director", now = new Date() }: Options = {},
): Promise<TvPhoto[]> {
  const wall = await wallRow(client, companyId);
  if (guestOf(wall, false, now)) return [];
  // the kiosk asks for the person or the order its own wall shows, nothing else
  if (role === "tv" && taskId && (wall?.mode !== "task" || wall.task_id !== taskId)) return [];
  if (role === "tv" && employeeId && (wall?.mode !== "employee" || wall.employee_id !== employeeId)) return [];
  const picked = taskId
    ? await taskPhotos(client, companyId, taskId)
    : employeeId
      ? await reportPhotos(client, companyId, { since: daysBefore(now, PERSON_DAYS), sender: employeeId, limit: PERSON_LIMIT })
      : await reportPhotos(client, companyId, { since: daysBefore(now, RECENT_DAYS), sender: null, limit: RECENT_LIMIT });
  const own = picked.filter((row) => inCompanyFolder(row.message.file_path, companyId));
  if (own.length === 0) return [];
  const named = await withNames(client, companyId, own);
  return sign(client, named);
}

/** The bucket's own shape `{company_id}/{owner_id}/{file}` — the same check as `/api/files/url`. */
export { inCompanyFolder };

const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();

/** The company's wall row: the guest rule (the kiosk's own `guestOf`) and what the wall shows. */
async function wallRow(client: Client, companyId: string) {
  const { data, error } = await client.from("tv_state").select("*").eq("company_id", companyId).maybeSingle();
  if (error) throw new Error(`tv photos: wall state read failed: ${error.message}`);
  return data;
}

type Picked = { message: MessageRow & { file_path: string }; task: TaskRow };

/** Report photos of done tasks since `since`: everyone's (the round) or one sender's (a person). */
async function reportPhotos(
  client: Client,
  companyId: string,
  { since, sender, limit }: { since: string; sender: string | null; limit: number },
): Promise<Picked[]> {
  let query = client
    .from("task_messages")
    .select(MESSAGE_COLUMNS)
    .eq("company_id", companyId)
    .eq("type", "photo")
    .not("file_path", "is", null)
    .gte("created_at", since);
  if (sender) query = query.eq("sender_id", sender);
  const { data: messages, error } = await query.order("created_at", { ascending: false }).limit(SCAN_LIMIT);
  if (error) throw new Error(`tv photos: messages read failed: ${error.message}`);
  if (!messages || messages.length === 0) return [];

  const ids = [...new Set(messages.map((message) => message.task_id))];
  const { data: tasks, error: tasksError } = await client
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("company_id", companyId)
    .eq("status", "done")
    .in("id", ids);
  if (tasksError) throw new Error(`tv photos: tasks read failed: ${tasksError.message}`);
  const done = new Map((tasks ?? []).map((task) => [task.id, task]));

  const perTask = new Map<string, number>();
  const picked: Picked[] = [];
  for (const message of messages) {
    if (picked.length >= limit) break;
    const task = done.get(message.task_id);
    // the report is the assignee's: a photo the director attached to the order is not «сдано»
    if (!task || task.assignee_id !== message.sender_id || !message.file_path) continue;
    const count = perTask.get(task.id) ?? 0;
    if (count >= PER_TASK) continue;
    perTask.set(task.id, count + 1);
    picked.push({ message: { ...message, file_path: message.file_path }, task });
  }
  return picked;
}

async function taskPhotos(client: Client, companyId: string, taskId: string): Promise<Picked[]> {
  const { data: task, error } = await client.from("tasks").select(TASK_COLUMNS).eq("company_id", companyId).eq("id", taskId).maybeSingle();
  if (error) throw new Error(`tv photos: task read failed: ${error.message}`);
  // another company's task, or none: nothing, the same answer either way
  if (!task) return [];

  const { data: messages, error: messagesError } = await client
    .from("task_messages")
    .select(MESSAGE_COLUMNS)
    .eq("company_id", companyId)
    .eq("task_id", task.id)
    .eq("type", "photo")
    .not("file_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(TASK_LIMIT);
  if (messagesError) throw new Error(`tv photos: task messages read failed: ${messagesError.message}`);
  return (messages ?? []).flatMap((message) => (message.file_path ? [{ message: { ...message, file_path: message.file_path }, task }] : []));
}

type Named = Picked & { name: string };

/** The sender's name; a sender outside the company (never expected) drops the photo. */
async function withNames(client: Client, companyId: string, picked: Picked[]): Promise<Named[]> {
  const ids = [...new Set(picked.map((row) => row.message.sender_id))];
  const { data, error } = await client.from("profiles").select("id, full_name").eq("company_id", companyId).in("id", ids);
  if (error) throw new Error(`tv photos: names read failed: ${error.message}`);
  const names = new Map((data ?? []).map((row) => [row.id, row.full_name]));
  return picked.flatMap((row) => {
    const name = names.get(row.message.sender_id);
    return name ? [{ ...row, name }] : [];
  });
}

/** One signing call for the whole list; a photo whose file is gone is left out. */
async function sign(client: Client, rows: Named[]): Promise<TvPhoto[]> {
  if (rows.length === 0) return [];
  const paths = [...new Set(rows.map((row) => row.message.file_path))];
  const { data, error } = await client.storage.from(BUCKET).createSignedUrls(paths, SIGN_SECONDS);
  if (error) throw new Error(`tv photos: sign failed: ${error.message}`);
  const urls = new Map<string, string>();
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl);
  }
  return rows.flatMap(({ message, task, name }) => {
    const url = urls.get(message.file_path);
    if (!url) return [];
    return [
      {
        id: message.id,
        url,
        task_id: task.id,
        employee_id: message.sender_id,
        name,
        title: task.title,
        at: message.created_at,
        done_at: task.completed_at,
      },
    ];
  });
}
