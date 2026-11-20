"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/types";

/**
 * A task_messages row a phone kept and writes later (D-130): the words a dead network held in the
 * outbox (lib/outbox.ts, written by lib/tasks/thread-mutations.ts) and the kept files (./replay.ts).
 * The id is the tap's, so a second write of a row that did land is a duplicate key, not a copy.
 */
export type MessageRow = {
  id: string;
  task_id: string;
  company_id: string;
  sender_id: string;
  type: "text" | "voice" | "photo";
  content: string | null;
  file_path: string | null;
  meta: Json;
};

/** One kept row into task_messages under the caller's session (RLS); the error in the outbox's words. */
export async function insertMessage(row: MessageRow): Promise<{ error: { message: string } | null }> {
  const { error } = await createBrowserSupabase().from("task_messages").insert(row);
  return { error: error ? { message: error.message } : null };
}
