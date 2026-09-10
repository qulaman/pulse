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
    if (error || !data) {
      console.error("signed upload url failed:", error?.message);
      return apiError(502, "upload_url_failed", "Не удалось начать загрузку, попробуй ещё раз");
    }

    if (body.context !== "director_input") {
      return apiOk({ audio_path: path, signed_url: data.signedUrl, token: data.token });
    }

    // Idempotent by client_request_id: a retried FAB tap reuses the staging row (G.11).
    const existing = await supabase
      .from("inbox_items")
      .select("id")
      .eq("company_id", profile.companyId)
      .eq("client_request_id", body.client_request_id)
      .maybeSingle();

    let inboxId = existing.data?.id;
    if (!inboxId) {
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
      if (inserted.error) throw new Error(`inbox insert failed: ${inserted.error.message}`);
      inboxId = inserted.data.id;
    }

    return apiOk({
      audio_path: path,
      signed_url: data.signedUrl,
      token: data.token,
      inbox_id: inboxId,
    });
  },
  BodySchema,
);
