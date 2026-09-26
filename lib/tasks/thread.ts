import { aqtobeDay } from "@/lib/ai/time";
import type { TaskMessage, TaskMessageRow } from "./queries";

/**
 * Pure patches of a cached thread. The socket delivers a whole `task_messages` row,
 * so an UPDATE needs no refetch — and must not cause one: the answer to a question
 * arrives as an `answered_at` stamp on a message the person is looking at, and an
 * invalidate repaints the thread under their thumb (Д-2).
 */

/** Columns an UPDATE may change on a message that is already in the cache. */
type MessagePatch = Partial<TaskMessageRow> & { id: string };

/**
 * Fold an UPDATE payload into the cached thread: the row keeps its place and its
 * joined `sender` (the payload carries no names), and takes the new words, meta,
 * file and type. A row the cache does not hold changes nothing — the same array
 * comes back, so React Query keeps the reference and nothing re-renders.
 */
export function applyMessageUpdate(messages: TaskMessage[] | undefined, row: MessagePatch): TaskMessage[] | undefined {
  if (!messages) return messages;
  const index = messages.findIndex((message) => message.id === row.id);
  if (index === -1) return messages;
  const current = messages[index]!;
  const next: TaskMessage = {
    ...current,
    content: row.content !== undefined ? row.content : current.content,
    meta: row.meta !== undefined ? row.meta : current.meta,
    file_path: row.file_path !== undefined ? row.file_path : current.file_path,
    type: row.type !== undefined ? row.type : current.type,
    // the join is the client's, never the payload's
    sender: current.sender,
  };
  const copy = [...messages];
  copy[index] = next;
  return copy;
}

/* -------------------------------------------------------------------------- */
/* What a row shows: in flight, failed, or in the thread                       */
/* -------------------------------------------------------------------------- */

export type MessageState = "pending" | "failed" | "sent";

function metaOf(message: Pick<TaskMessage, "meta">): Record<string, unknown> {
  const meta = message.meta;
  return meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {};
}

/**
 * A row is `pending` while it is in flight or waiting in the outbox (принцип 7: it will
 * arrive, so it stays on screen with a clock), `failed` when the server refused it — the
 * only state that asks the person to do something — and `sent` once the thread holds it.
 */
export function messageState(message: TaskMessage): MessageState {
  const meta = metaOf(message);
  if (meta.failed === true) return "failed";
  return meta.pending === true ? "pending" : "sent";
}

/** The server refused this row: it stays where it is, marked, and a tap sends it again. */
export function markFailed(messages: TaskMessage[] | undefined, id: string): TaskMessage[] | undefined {
  if (!messages) return messages;
  const index = messages.findIndex((message) => message.id === id);
  if (index === -1) return messages;
  const current = messages[index]!;
  const copy = [...messages];
  copy[index] = { ...current, meta: { ...metaOf(current), failed: true, pending: true } as TaskMessage["meta"] };
  return copy;
}

/* -------------------------------------------------------------------------- */
/* A reassigned task says «передана», not «отозвано» (D-129)                   */
/* -------------------------------------------------------------------------- */

/**
 * reassign_task closes the old task with a status line «revoked» and, in the same moment, a
 * line «Передана: Ерлан». The thread keeps the one that tells the truth: the status line of
 * that moment goes. A revoke on its own (no handover beside it) stays as it is.
 */
export function withoutPassedRevoke(messages: TaskMessage[]): TaskMessage[] {
  const handovers = messages.filter((message) => message.type === "system" && typeof metaOf(message).reassigned_to === "string");
  if (handovers.length === 0) return messages;
  const moments = new Set(handovers.map((message) => Math.floor(new Date(message.created_at).getTime() / 1000)));
  return messages.filter(
    (message) =>
      !(
        message.type === "status_change" &&
        metaOf(message).new_status === "revoked" &&
        moments.has(Math.floor(new Date(message.created_at).getTime() / 1000))
      ),
  );
}

/* -------------------------------------------------------------------------- */
/* Days                                                                        */
/* -------------------------------------------------------------------------- */

/** «Сегодня» / «Вчера» / «14.09» — the separator between the days of a thread. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const day = aqtobeDay(new Date(iso));
  const today = aqtobeDay(now);
  if (day === today) return "Сегодня";
  if (day === today - 1) return "Вчера";
  const wall = new Date(new Date(iso).getTime() + 5 * 3_600_000);
  const date = `${String(wall.getUTCDate()).padStart(2, "0")}.${String(wall.getUTCMonth() + 1).padStart(2, "0")}`;
  const nowWall = new Date(now.getTime() + 5 * 3_600_000);
  return wall.getUTCFullYear() === nowWall.getUTCFullYear() ? date : `${date}.${wall.getUTCFullYear()}`;
}

/** True when a separator belongs above this row: the first one, or a new Aqtobe day. */
export function startsNewDay(previous: TaskMessage | undefined, current: TaskMessage): boolean {
  if (!previous) return true;
  return aqtobeDay(new Date(previous.created_at)) !== aqtobeDay(new Date(current.created_at));
}
