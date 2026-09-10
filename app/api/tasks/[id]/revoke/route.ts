import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";

const BodySchema = z.strictObject({
  client_request_id: z.uuid(),
});

/**
 * D-01: editing a task = revoke + new one. A task still `scheduled` reached
 * nobody and is deleted outright — the RPC decides which of the two happens.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director"],
  async ({ req, body, params }) => {
    const taskId = params.id;
    if (!z.uuid().safeParse(taskId).success) {
      return apiError(404, "task_not_found", "Задача не найдена");
    }

    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("revoke_task", {
      task_id: taskId,
      client_request_id: body.client_request_id,
    });

    if (error) {
      if (error.message.includes("task_not_found")) {
        return apiError(404, "task_not_found", "Задача не найдена");
      }
      if (error.message.includes("forbidden")) {
        return apiError(403, "forbidden", "Нет доступа");
      }
      if (error.message.includes("invalid_transition")) {
        return apiError(409, "invalid_transition", "Так нельзя: статус уже изменился");
      }
      throw new Error(`revoke_task failed: ${error.message}`);
    }

    const { duplicate = false, ...result } = (data ?? {}) as Record<string, unknown>;
    return apiOk({ result, duplicate });
  },
  BodySchema,
);
