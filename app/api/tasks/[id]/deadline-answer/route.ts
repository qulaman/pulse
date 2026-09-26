import { after } from "next/server";
import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { kickDeliveries } from "@/lib/push/send";

const BodySchema = z.strictObject({
  /** true — «Согласовать», false — «Оставить прежний». Another date goes through «Срок». */
  approve: z.boolean(),
  client_request_id: z.uuid(),
});

/**
 * The director's answer to «Нужно больше времени» (D-128): one RPC — the deadline (if granted),
 * the request closed, a line in the thread, the employee's push.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director"],
  async ({ req, body, params }) => {
    const taskId = params.id;
    if (!z.guid().safeParse(taskId).success) {
      return apiError(404, "task_not_found", "Задача не найдена");
    }

    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("answer_deadline_request", {
      task_id: taskId,
      approve: body.approve,
      client_request_id: body.client_request_id,
    });

    if (error) {
      if (error.message.includes("task_not_found")) return apiError(404, "task_not_found", "Задача не найдена");
      if (error.message.includes("forbidden")) return apiError(403, "forbidden", "Нет доступа");
      if (error.message.includes("no_request")) {
        return apiError(409, "no_request", "Просьбы уже нет — задачу сдали или срок уже решён");
      }
      if (error.message.includes("invalid_transition")) {
        return apiError(409, "invalid_transition", "Задача уже не в работе");
      }
      throw new Error(`answer_deadline_request failed: ${error.message}`);
    }

    after(() => kickDeliveries());

    const { duplicate = false, ...result } = (data ?? {}) as Record<string, unknown>;
    return apiOk({ result, duplicate });
  },
  BodySchema,
);
