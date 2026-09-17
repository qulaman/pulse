import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiOk } from "@/lib/api/respond";
import { createServiceSupabase } from "@/lib/supabase/service";

const BodySchema = z.strictObject({
  /** The delivery the person tapped «Прочитал» on, from the notification shade. */
  delivery_id: z.uuid(),
});

/**
 * «Прочитал» straight from the notification (D-64): the thread is marked read up to the
 * seq that delivery carried, so the board loses its unread mark and the receipt closes —
 * without waking the app. The cursor is moved by the RPC under the person’s own token
 * (it writes their row and nobody else’s); the service client is only used to read which
 * task and which seq the delivery was about, and only among that person’s own rows.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  "any",
  async ({ req, profile, body }) => {
    const { data: delivery } = await createServiceSupabase()
      .from("notification_deliveries")
      .select("task_id, meta")
      .eq("id", body.delivery_id)
      .eq("user_id", profile.userId)
      .maybeSingle();

    const meta = (delivery?.meta ?? {}) as { last_seq?: number };
    if (!delivery?.task_id || typeof meta.last_seq !== "number") return apiOk({ ok: false });

    const supabase = await userSupabase(req);
    const { error } = await supabase.rpc("mark_thread_read", { task_id: delivery.task_id, seq: meta.last_seq });
    if (error) {
      console.error("mark_thread_read from the shade failed:", error.message);
      return apiOk({ ok: false });
    }
    return apiOk({ ok: true });
  },
  BodySchema,
);
