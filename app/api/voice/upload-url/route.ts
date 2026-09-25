import { z } from "zod";

import { withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { createServiceSupabase } from "@/lib/supabase/service";

const BodySchema = z.strictObject({
  ext: z.enum(["webm", "m4a", "mp4"]),
  context: z.enum(["director_input", "task_message"]),
  client_request_id: z.uuid(),
});

/**
 * Signed upload URL for the client to push audio straight into Storage — the
 * 4.5 MB Vercel body limit never participates (docs/BACKEND.md §2). Audio lands
 * before any AI call (принцип 5), so a failure downstream cannot lose it.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  "any",
  async ({ profile, body }) => {
    const path = `${profile.companyId}/${profile.userId}/${body.client_request_id}.${body.ext}`;
    const supabase = createServiceSupabase();

    const { data, error } = await supabase.storage.from("voice").createSignedUploadUrl(path);
    // the object of this key is there already: an earlier upload of the same capture landed
    // and its answer was lost — a retry must go on to the next step, not fail forever (D-95)
    let slot: { audio_path: string; signed_url: string; token: string; stored?: boolean };
    if (error && /already exists/i.test(error.message)) {
      slot = { audio_path: path, signed_url: "", token: "", stored: true };
    } else if (error || !data) {
      console.error("signed upload url failed:", error?.message);
      return apiError(502, "upload_url_failed", "Не удалось начать загрузку, попробуй ещё раз");
    } else {
      slot = { audio_path: path, signed_url: data.signedUrl, token: data.token };
    }

    if (body.context !== "director_input") {
      return apiOk(slot);
    }

    // Idempotent by client_request_id: a retried FAB tap reuses the staging row (G.11). The
    // insert goes first — one round trip for a new capture — and the unique key
    // (company_id, client_request_id) turns a retry, even a concurrent one, into a conflict
    // answered with the row that is already there (D-126).
    const inserted = await supabase
      .from("inbox_items")
      .insert({
        company_id: profile.companyId,
        user_id: profile.userId,
        status: "recorded",
        audio_path: path,
        client_request_id: body.client_request_id,
      })
      .select("id")
      .single();

    let inboxId = inserted.data?.id;
    if (inserted.error?.code === "23505") {
      const existing = await supabase
        .from("inbox_items")
        .select("id")
        .eq("company_id", profile.companyId)
        .eq("client_request_id", body.client_request_id)
        .single();
      if (existing.error) throw new Error(`inbox lookup failed: ${existing.error.message}`);
      inboxId = existing.data.id;
    } else if (inserted.error || !inboxId) {
      throw new Error(`inbox insert failed: ${inserted.error?.message ?? "no row"}`);
    }

    return apiOk({ ...slot, inbox_id: inboxId });
  },
  BodySchema,
);
