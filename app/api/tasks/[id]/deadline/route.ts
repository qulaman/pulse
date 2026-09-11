import { after } from "next/server";
import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { kickDeliveries } from "@/lib/push/send";

const BodySchema = z.strictObject({
  /** null — «без срока» */
  deadline_iso: z.string().datetime({ offset: true }).nullable(),
  client_request_id: z.uuid(),
});

/**
 * «Продлить»: the director moves (or removes) the deadline of an open task. One RPC —
 * the new date, a system line in the thread, a push to the assignee (principle 7).
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director"],
  async ({ req, body, params }) => {
    const taskId = params.id;
    if (!z.guid().safeParse(taskId).success) {
      return apiError(404, "task_not_found", "Задача не найдена");
    }

    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("extend_task_deadline", {
      task_id: taskId,
      new_deadline: body.deadline_iso,
      client_request_id: body.client_request_id,
    });

    if (error) {
      if (error.message.includes("task_not_found")) return apiError(404, "task_not_found", "Задача не найдена");
      if (error.message.includes("forbidden")) return apiError(403, "forbidden", "Нет доступа");
      if (error.message.includes("invalid_transition")) {
        return apiError(409, "invalid_transition", "Задача уже закрыта — срок менять нечему");
      }
      throw new Error(`extend_task_deadline failed: ${error.message}`);
    }

    // the push about the new deadline goes out right away, not with the next sweep
    after(() => kickDeliveries());

    const { duplicate = false, ...result } = (data ?? {}) as Record<string, unknown>;
    return apiOk({ result, duplicate });
  },
  BodySchema,
);
