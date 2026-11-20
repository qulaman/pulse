import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiOk } from "@/lib/api/respond";

const BodySchema = z.object({ crids: z.array(z.uuid()).max(500) });

/**
 * The recordings behind the lab's rows and whether each is kept «в корпус» (D-155 §3). A read,
 * not a mutation: POST only because the ids do not fit a URL.
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

    const kept = await supabase.from("voice_kept").select("path").in("path", [...pathOf.values()]);
    if (kept.error) throw new Error(`voice_kept read failed: ${kept.error.message}`);
    const keptPaths = new Set(kept.data.map((row) => row.path));

    return apiOk({
      recordings: [...pathOf].map(([crid, path]) => ({ crid, path, kept: keptPaths.has(path) })),
    });
  },
  BodySchema,
);
