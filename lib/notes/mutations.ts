"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";

/**
 * Notes are soft-deleted (D-75 §7): «Отменить» in the toast must bring back the very
 * same row, audio and raw transcript included. Both helpers are plain functions, not
 * hooks — the toast that calls them lives in the ingest store, outside React.
 */

export async function softDeleteNotes(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = createBrowserSupabase();
  await supabase.from("notes").update({ deleted_at: new Date().toISOString() }).in("id", ids);
}

export async function restoreNotes(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = createBrowserSupabase();
  await supabase.from("notes").update({ deleted_at: null }).in("id", ids);
}
