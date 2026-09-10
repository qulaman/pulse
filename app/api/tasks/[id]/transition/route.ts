import { after } from "next/server";
import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { kickDeliveries } from "@/lib/push/send";
import { createServiceSupabase } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/types";

type TaskStatus = Database["public"]["Enums"]["task_status"];

const STATUSES = [
  "scheduled",
  "sent",
  "accepted",
  "in_progress",
  "pending_review",
  "done",
  "rework",
  "declined",
  "revoked",
] as const satisfies readonly TaskStatus[];

const BodySchema = z.strictObject({
  to_status: z.enum(STATUSES),
  reason: z.string().optional(), // «Не могу» — becomes a visible message
  comment: z.string().optional(), // rework note from the director
  client_request_id: z.uuid(),
});

/**
 * The single door for status changes (docs/BACKEND.md §0.3): the matrix of §7
 * lives in the RPC's trigger, never in the client.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  "any",
  async ({ req, profile, body, params }) => {
    const taskId = params.id;
    if (!z.uuid().safeParse(taskId).success) {
      return apiError(404, "task_not_found", "Задача не найдена");
    }

    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("transition_task", {
      task_id: taskId,
      to_status: body.to_status,
      payload: { reason: body.reason ?? null, comment: body.comment ?? null },
      client_request_id: body.client_request_id,
    });

    if (error) {
      if (error.message.includes("invalid_transition")) {
        return apiError(409, "invalid_transition", "Так нельзя: статус уже изменился");
      }
      if (error.message.includes("task_not_found")) {
        return apiError(404, "task_not_found", "Задача не найдена");
      }
      if (error.message.includes("forbidden")) {
        return apiError(403, "forbidden", "Нет доступа");
      }
      throw new Error(`transition_task failed: ${error.message}`);
    }

    const { duplicate = false, ...result } = (data ?? {}) as Record<string, unknown>;
    after(async () => {
      if (body.to_status === "accepted") {
        // «принял» (D-32): the receipt on the director's card
        const now = new Date().toISOString();
        await createServiceSupabase()
          .from("notification_deliveries")
          .update({ acted_at: now, seen_at: now })
          .eq("task_id", taskId)
          .eq("user_id", profile.userId)
          .is("acted_at", null);
      }
      kickDeliveries();
    });
    return apiOk({ result, duplicate });
  },
  BodySchema,
);
