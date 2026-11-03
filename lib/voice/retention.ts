import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

const BUCKET = "voice";
/** Storage removes by the hundred. */
const BATCH = 100;
/** Files per sweep: on Hobby the sweep runs once a day, a backlog drains over a few days. */
const LIMIT = 500;

type Due = { company_id: string; path: string };

/**
 * The sweep step of D-155 §3 (D-18): the voice files whose term ran out (`voice_purge_due` —
 * `closed_days` after all their rows are closed, `orphan_days` for a recording nothing came of,
 * never one kept «в корпус») are removed through the Storage API in batches, then their paths
 * become null everywhere (`voice_mark_purged`) — only for a batch Storage removed. Storage
 * answers a file that is already gone without an error (it is just not in the answer), so a
 * batch without an error is all gone and its paths are cleared as well.
 *
 * Never throws: an error is logged and the rest of the sweep goes on; a file that was not
 * removed keeps its path and comes again with the next sweep. Returns the number of files gone.
 */
export async function purgeVoice(
  service: SupabaseClient<Database>,
  options: { limit?: number; batch?: number } = {},
): Promise<number> {
  const batch = options.batch ?? BATCH;
  let paths: string[];
  try {
    // the functions come with migration 20261103121000 — not in the generated types yet
    const due = await service.rpc("voice_purge_due" as never, { p_limit: options.limit ?? LIMIT } as never);
    if (due.error) {
      console.error("voice_purge_due failed:", due.error.message);
      return 0;
    }
    paths = ((due.data ?? []) as unknown as Due[]).map((row) => row.path);
  } catch (err) {
    console.error("voice_purge_due failed:", err instanceof Error ? err.message : err);
    return 0;
  }

  let purged = 0;
  for (let from = 0; from < paths.length; from += batch) {
    const chunk = paths.slice(from, from + batch);
    try {
      const removed = await service.storage.from(BUCKET).remove(chunk);
      if (removed.error) {
        console.error("voice remove failed:", removed.error.message);
        continue;
      }
      purged += chunk.length;
      const marked = await service.rpc("voice_mark_purged" as never, { p_paths: chunk } as never);
      if (marked.error) console.error("voice_mark_purged failed:", marked.error.message);
    } catch (err) {
      console.error("voice purge batch failed:", err instanceof Error ? err.message : err);
    }
  }
  return purged;
}
