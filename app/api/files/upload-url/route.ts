import { z } from "zod";

import { withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { createServiceSupabase } from "@/lib/supabase/service";

const BodySchema = z.strictObject({
  ext: z.enum(["jpg", "png", "webp"]),
  client_request_id: z.uuid(),
});

/**
 * Signed upload URL for a report photo: the phone pushes the file straight into
 * the `photos` bucket, the Vercel body limit never participates (G.8).
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  "any",
  async ({ profile, body }) => {
    const path = `${profile.companyId}/${profile.userId}/${body.client_request_id}.${body.ext}`;
    const { data, error } = await createServiceSupabase().storage.from("photos").createSignedUploadUrl(path);
    if (error || !data) {
      console.error("photo upload url failed:", error?.message);
      return apiError(502, "upload_url_failed", "Не удалось начать загрузку, попробуй ещё раз");
    }
    return apiOk({ path, signed_url: data.signedUrl, token: data.token });
  },
  BodySchema,
);
