import { after } from "next/server";
import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { kickDeliveries } from "@/lib/push/send";

const BodySchema = z.strictObject({
  client_request_id: z.uuid(),
});

/**
 * «Напомнить» (D-129): one push to the assignee and a line in the thread, not more often than
 * every half hour — a second tap answers with the time of the first (`too_soon`), not a buzz.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director"],
  async ({ req, body, params }) => {
    const taskId = params.id;
    if (!z.guid().safeParse(taskId).success) {
      return apiError(404, "task_not_found", "Задача не найдена");
    }

    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("nudge_task", {
      task_id: taskId,
      client_request_id: body.client_request_id,
    });

    if (error) {
      if (error.message.includes("task_not_found")) return apiError(404, "task_not_found", "Задача не найдена");
      if (error.message.includes("forbidden")) return apiError(403, "forbidden", "Нет доступа");
      if (error.message.includes("invalid_transition")) {
        return apiError(409, "invalid_transition", "Задача уже не в работе — напоминать не о чем");
      }
      throw new Error(`nudge_task failed: ${error.message}`);
    }

    const { duplicate = false, ...result } = (data ?? {}) as Record<string, unknown>;
    if (!result.too_soon) after(() => kickDeliveries());
    return apiOk({ result, duplicate });
  },
  BodySchema,
);
