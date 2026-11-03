import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiOk } from "@/lib/api/respond";

const BodySchema = z.object({ crids: z.array(z.uuid()).max(500) });

/**
 * The recordings behind the lab's rows and whether each is kept «в корпус» (D-155 §3). A read,
 * not a mutation: POST only because the ids do not fit a URL. Asked on the server, not from the
 * browser: before migration 20261103121000 `voice_kept` is missing, and a browser request would
 * log a 404 on every lab visit — here it is just `recordings: null` (no «В корпус» chips).
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director"],
  async ({ req, body }) => {
    if (body.crids.length === 0) return apiOk({ recordings: [] });
    const supabase = await userSupabase(req);

    // ai_logs.client_request_id is the draft's (inbox_items): its audio_path is the file;
    // a purged file has no path, so nothing to keep
    const inbox = await supabase
      .from("inbox_items")
      .select("client_request_id, audio_path")
      .in("client_request_id", body.crids)
      .not("audio_path", "is", null);
    if (inbox.error) throw new Error(`inbox read failed: ${inbox.error.message}`);
    const pathOf = new Map<string, string>();
    for (const row of inbox.data) {
      if (row.client_request_id && row.audio_path) pathOf.set(row.client_request_id, row.audio_path);
    }
    if (pathOf.size === 0) return apiOk({ recordings: [] });

    // voice_kept comes with migration 20261103121000 — not in the generated types yet
    const kept = await (supabase as unknown as SupabaseClient)
      .from("voice_kept")
      .select("path")
      .in("path", [...pathOf.values()]);
    if (kept.error) return apiOk({ recordings: null });
    const keptPaths = new Set((kept.data as { path: string }[]).map((row) => row.path));

    return apiOk({
      recordings: [...pathOf].map(([crid, path]) => ({ crid, path, kept: keptPaths.has(path) })),
    });
  },
  BodySchema,
);
