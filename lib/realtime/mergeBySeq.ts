/**
 * Cursor catch-up for seq-carrying tables (task_messages). Kept free of React
 * and of the Supabase client so it can be unit-tested on its own; re-exported
 * from useRealtimeQuery.ts, which is the module callers import.
 */

export type SeqRow = { id: string; seq: number };

/**
 * Folds a cursor read (`where seq > lastSeq`) into the cached page:
 * deduplicated by `id`, ordered by `seq`. Incoming wins, because a row can come
 * back changed without its seq moving — trigger 3 stamps `meta.answered_at` on
 * an existing question (docs/DATABASE.md).
 */
export function mergeBySeq<TRow extends SeqRow>(existing: TRow[], incoming: TRow[]): TRow[] {
  const byId = new Map<string, TRow>();
  for (const row of existing) byId.set(row.id, row);
  for (const row of incoming) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}

/** 0 means "nothing cached yet" — the caller then reads the whole page. */
export function lastSeqOf(rows: readonly SeqRow[]): number {
  let max = 0;
  for (const row of rows) if (row.seq > max) max = row.seq;
  return max;
}
