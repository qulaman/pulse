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
