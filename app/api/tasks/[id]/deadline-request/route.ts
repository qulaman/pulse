import { after } from "next/server";
import { z } from "zod";

import { TASK_ID, userSupabase, withAuth } from "@/lib/api/handler";
import { apiOk, BAD_DEADLINE, NO_TASK, rpcFailure, rpcResult } from "@/lib/api/respond";
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
    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("request_deadline", {
      task_id: taskId,
      proposed: body.proposed_iso,
      words: body.words?.trim() || undefined,
      client_request_id: body.client_request_id,
    });

    if (error) {
      return rpcFailure(
        error,
        {
          task_not_found: NO_TASK,
          forbidden: [403, "Срок просит тот, у кого задача"],
          bad_deadline: BAD_DEADLINE,
          invalid_transition: [409, "Задача уже не в работе — срок просить не у кого"],
        },
        "request_deadline",
      );
    }

    // the director hears «Просит срок» now, not with the next sweep
    after(() => kickDeliveries());

    return apiOk(rpcResult(data));
  },
  BodySchema,
  { id: TASK_ID },
);
