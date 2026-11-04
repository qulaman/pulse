import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseCost } from "@/lib/ai/pricing";
import type { Database, Json } from "@/lib/supabase/types";

import type { AuditRow, CompanyCard, CompanyRow, Footprint, OperatorRow, OpsAction, OpsTask, SpendRow } from "./contract";
import { OpsRpcError } from "./guard";

/** Either client: under the operator's JWT, or service role. */
export type OpsClient = SupabaseClient<Database>;

type None = Record<string, never>;
type Ticket = { p_ticket: string };
type InCompany = Ticket & { p_company: string };
type Confirmed = InCompany & { p_confirm_name: string };

/** What `ops_ticket` answers: a ticket, or the journal's result of a request already done. */
export type TicketOutcome = { ticket: string; duplicate?: false } | { duplicate: true; result: JournalResult };
/** What `ops.log` kept: the shape belongs to the action. */
export type JournalResult = Record<string, unknown>;

/** `CompanyCard` as the base gives it: the prices are the server's (lib/ai/pricing.ts). */
export type BaseCard = Omit<CompanyCard, "spend_30d"> & { spend_30d: Omit<SpendRow, "usd">[] };

export type Cleanup = { rows: Record<string, number>; files_queued: number };
export type QueuedFile = { id: number; bucket: string; name: string };
export type ExportFile = { bucket: string; name: string; bytes: number };

/** Every `ops_*` call: arguments, then answer. They reach lib/supabase/types.ts with the next `db:types`. */
type Rpcs = {
  // under the operator's JWT
  ops_login_state: [None, { operator: boolean }];
  ops_ticket: [
    { p_action: OpsAction; p_company: string | null; p_target: Json; p_reason: string; p_client_request_id: string },
    TicketOutcome,
  ];
  ops_companies: [None, CompanyRow[]];
  ops_company_card: [{ p_company: string }, BaseCard];
  ops_company_footprint: [{ p_company: string }, Footprint];
  ops_audit_list: [{ p_before: number | null; p_limit: number; p_company: string | null }, AuditRow[]];
  ops_operators: [None, OperatorRow[]];
  // service role
  ops_slug_free: [{ p_slug: string }, boolean];
  ops_prepare_company: [Ticket, { director_id: string; tv_id: string }];
  ops_create_company: [Ticket & { p_payload: Json }, JournalResult];
  ops_log_action: [Ticket & { p_action: OpsAction; p_company: string | null; p_result: Json }, null];
  ops_add_person: [
    InCompany & { p_user: string; p_full_name: string; p_role: string; p_position: string | null; p_aliases: string[] },
    null,
  ];
  ops_update_company: [
    InCompany & { p_name: string | null; p_slug: string | null; p_settings: Json | null },
    null,
  ];
  ops_update_person: [InCompany & { p_user: string; p_patch: Json }, null];
  ops_revoke_sessions: [InCompany & { p_user: string }, { sessions: number; devices: number }];
  ops_adjust_points: [InCompany & { p_user: string; p_amount: number; p_reason: string }, { balance: number }];
  ops_change_director: [InCompany & { p_old: string; p_new: string; p_old_fate: string }, JournalResult];
  ops_task_get: [Ticket & { p_company_or_null: string | null; p_task: string }, OpsTask];
  ops_update_task: [InCompany & { p_task: string; p_patch: Json }, null];
  ops_delete_task: [InCompany & { p_task: string }, null];
  ops_wipe_activity: [Confirmed, Cleanup];
  ops_purge_company: [Confirmed, Cleanup];
  ops_export_begin: [InCompany, string];
  ops_export_page: [{ p_export: string; p_table: string; p_offset: number; p_limit: number }, unknown[]];
  ops_export_files: [{ p_export: string; p_offset: number; p_limit: number }, ExportFile[]];
  ops_export_finish: [{ p_export: string; p_sha256: string; p_counts: Json }, null];
  ops_storage_next: [{ p_limit: number }, QueuedFile[]];
  ops_storage_done: [{ p_ids: number[] }, null];
  ops_storage_left: [{ p_company: string | null }, number];
  // `p_issued_by` became nullable with the console's migration (tasks/029)
  issue_login_code: [
    { p_user_id: string; p_issued_by: null; p_code_hash: string; p_ttl_seconds: number; p_request_id: string },
    { id: string; expires_at: string },
  ];
};

/** A failure throws `OpsRpcError` with the base's own words: `withOps` turns it into an answer. */
export async function opsRpc<Name extends keyof Rpcs>(
  client: OpsClient,
  name: Name,
  args: Rpcs[Name][0],
): Promise<Rpcs[Name][1]> {
  const { data, error } = await client.rpc(name as never, args as never);
  if (error) throw new OpsRpcError(error.message, error.code ?? null);
  return data as Rpcs[Name][1];
}

/**
 * The tables of a company's export, `ops.export_tables()` word for word (db.test.ts compares them):
 * `ops_export_begin` answers with the export's id only, and the browser walks this list. No notes
 * and no boards (private, D-75), no codes, attempts, subscriptions or the outbox.
 */
export const OPS_EXPORT_TABLES: readonly string[] = [
  "companies",
  "profiles",
  "tasks",
  "task_messages",
  "task_reactions",
  "task_reads",
  "announcements",
  "announcement_acks",
  "events",
  "event_participants",
  "errands",
  "visits",
  "recurrence_rules",
  "inbox_items",
  "ingest_batches",
  "ai_logs",
  "daily_reports",
  "point_transactions",
  "point_disputes",
  "ether_events",
  "shop_items",
  "orders",
  "reminders",
  "tv_state",
  "tv_events",
  "voice_kept",
  "notification_prefs",
];

/**
 * The key of a step inside one request (a person made while changing the director): stable across
 * retries of that request, different from the request's own key, so the journal counts both once.
 */
export function deriveRequestId(requestId: string, step: string): string {
  const hex = createHash("sha256").update(`${requestId}:${step}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Storage removes by the hundred. */
const DRAIN_BATCH = 100;

/**
 * The queue of removed companies' files (`ops.storage_queue`): each row goes once Storage took its
 * file away. Never throws: what stayed comes again with the next sweep, and a bucket that refuses
 * ends the round, since `ops_storage_next` would only hand the same rows back.
 */
export async function drainStorage(service: OpsClient, budgetMs: number): Promise<number> {
  const until = Date.now() + budgetMs;
  let removed = 0;
  try {
    while (Date.now() < until) {
      const rows = await opsRpc(service, "ops_storage_next", { p_limit: DRAIN_BATCH });
      if (!rows?.length) break;

      const buckets = new Map<string, QueuedFile[]>();
      for (const row of rows) buckets.set(row.bucket, [...(buckets.get(row.bucket) ?? []), row]);

      const gone: number[] = [];
      for (const [bucket, files] of buckets) {
        const { error } = await service.storage.from(bucket).remove(files.map((file) => file.name));
        if (error) console.error(`ops storage remove failed (${bucket}):`, error.message);
        else gone.push(...files.map((file) => file.id));
      }
      if (gone.length) {
        await opsRpc(service, "ops_storage_done", { p_ids: gone });
        removed += gone.length;
      }
      if (gone.length < rows.length) break;
    }
  } catch (err) {
    console.error("ops storage drain failed:", err instanceof Error ? err.message : err);
  }
  return removed;
}

/**
 * A cleanup's answer: the rows and files of its journal line and how many files still wait. The
 * action is already done, so a failed count says «all of them are still queued» instead of an error.
 */
export async function cleanupAnswer(
  service: OpsClient,
  company: string,
  result: JournalResult,
): Promise<Cleanup & { files_left: number }> {
  const { rows, files_queued } = result as Cleanup;
  const filesLeft = await opsRpc(service, "ops_storage_left", { p_company: company }).catch(() => files_queued);
  return { rows, files_queued, files_left: filesLeft };
}

/** A row of the card with its dollars; the card has no cache-write column, so those count as zero. */
export function priceSpend(row: Omit<SpendRow, "usd">): SpendRow {
  const usage = {
    input_tokens: row.input_tokens,
    output_tokens: row.output_tokens,
    cache_read_input_tokens: row.cache_read_tokens,
    cache_creation_input_tokens: 0,
  };
  return { ...row, usd: row.model ? parseCost(row.model, usage) : null };
}

/** The handover's journal keeps the ids; the screen wants how many. */
export function countMoved(result: JournalResult): { tasks: number; rules: number; events: number; errands_cancelled: number } {
  const count = (value: unknown) => (Array.isArray(value) ? value.length : 0);
  return {
    tasks: count(result.tasks),
    rules: count(result.rules),
    events: count(result.events),
    errands_cancelled: count(result.errands),
  };
}
