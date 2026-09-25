import { after } from "next/server";
import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { kickDeliveries } from "@/lib/push/send";

const BodySchema = z.strictObject({
  proposed_iso: z.string().datetime({ offset: true }),
  /** «жду поставку» — why, in the employee's words; optional */
  words: z.string().max(500).optional(),
  client_request_id: z.uuid(),
});

/**
 * «Нужно больше времени» (D-128): the assignee asks for another deadline. On a new task it is
 * «возьму, но к …» — the RPC takes the task and leaves the time to the director. One RPC: the
 * request as a message with a flag, the director's push («Просит срок»), the receipt.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  "any",
  async ({ req, body, params }) => {
    const taskId = params.id;
    if (!z.guid().safeParse(taskId).success) {
      return apiError(404, "task_not_found", "Задача не найдена");
    }

    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("request_deadline", {
      task_id: taskId,
      proposed: body.proposed_iso,
      words: body.words?.trim() || undefined,
      client_request_id: body.client_request_id,
    });

    if (error) {
      if (error.message.includes("task_not_found")) return apiError(404, "task_not_found", "Задача не найдена");
      if (error.message.includes("forbidden")) return apiError(403, "forbidden", "Срок просит тот, у кого задача");
      if (error.message.includes("bad_deadline")) return apiError(400, "bad_deadline", "Этот срок уже прошёл — выберите время впереди");
      if (error.message.includes("invalid_transition")) {
        return apiError(409, "invalid_transition", "Задача уже не в работе — срок просить не у кого");
      }
      throw new Error(`request_deadline failed: ${error.message}`);
    }

    // the director hears «Просит срок» now, not with the next sweep
    after(() => kickDeliveries());

    const { duplicate = false, ...result } = (data ?? {}) as Record<string, unknown>;
    return apiOk({ result, duplicate });
  },
  BodySchema,
);
