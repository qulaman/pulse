import { z } from "zod";

import { withAuth } from "@/lib/api/handler";
import { apiOk } from "@/lib/api/respond";
import { createServiceSupabase } from "@/lib/supabase/service";

const BodySchema = z.strictObject({
  /** From the service worker when the notification was shown; omitted when the app was opened. */
  delivery_id: z.uuid().optional(),
});

/**
 * «Увидел» (D-32): a shown notification or an opened app closes the person's
 * recent deliveries. Writes go through the service role, scoped to the caller.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  "any",
  async ({ profile, body }) => {
    const service = createServiceSupabase();
    const now = new Date().toISOString();
    let query = service
      .from("notification_deliveries")
      .update({ seen_at: now })
      .eq("user_id", profile.userId)
      .is("seen_at", null)
      .in("status", ["sent", "failed", "queued"]);
    if (body.delivery_id) query = query.eq("id", body.delivery_id);
    const { error } = await query;
    if (error) console.error("seen update failed:", error.message);
    return apiOk({ ok: true });
  },
  BodySchema,
);
