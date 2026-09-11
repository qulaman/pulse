import { after } from "next/server";
import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { kickDeliveries } from "@/lib/push/send";

const BodySchema = z.strictObject({
  assignee_id: z.guid(),
  client_request_id: z.uuid(),
});

/**
 * «Переназначить»: the same order goes to another person as a fresh task, the old one is
 * revoked with a pointer (D-01). One RPC does both; the outbox trigger notifies the new person.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director"],
  async ({ req, body, params }) => {
    const taskId = params.id;
    if (!z.guid().safeParse(taskId).success) {
      return apiError(404, "task_not_found", "Задача не найдена");
    }

    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("reassign_task", {
      task_id: taskId,
      new_assignee_id: body.assignee_id,
      client_request_id: body.client_request_id,
    });

    if (error) {
      if (error.message.includes("task_not_found")) return apiError(404, "task_not_found", "Задача не найдена");
      if (error.message.includes("assignee_not_found")) return apiError(404, "assignee_not_found", "Такого сотрудника нет");
      if (error.message.includes("same_assignee")) return apiError(409, "same_assignee", "Это тот же человек");
      if (error.message.includes("forbidden")) return apiError(403, "forbidden", "Нет доступа");
      if (error.message.includes("invalid_transition")) {
        return apiError(409, "invalid_transition", "Так нельзя: статус уже изменился");
      }
      throw new Error(`reassign_task failed: ${error.message}`);
    }

    after(() => kickDeliveries());

    const { duplicate = false, ...result } = (data ?? {}) as Record<string, unknown>;
    return apiOk({ result, duplicate });
  },
  BodySchema,
);
