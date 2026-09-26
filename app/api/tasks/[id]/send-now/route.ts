import { after } from "next/server";
import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { kickDeliveries } from "@/lib/push/send";

const BodySchema = z.strictObject({
  client_request_id: z.uuid(),
});

/**
 * «Отправить сейчас» after the fact (D-129): a task held for the morning goes out now, and
 * whatever it queued for the morning to the team leaves with it. The RPC checks the role.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director"],
  async ({ req, body, params }) => {
    const taskId = params.id;
    if (!z.uuid().safeParse(taskId).success) {
      return apiError(404, "task_not_found", "Задача не найдена");
    }

    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("send_task_now", {
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
      throw new Error(`send_task_now failed: ${error.message}`);
    }

    const { duplicate = false, ...result } = (data ?? {}) as Record<string, unknown>;
    // the rows are due now; send them once the response is on its way
    after(() => kickDeliveries());
    return apiOk({ result, duplicate });
  },
  BodySchema,
);
