import { after } from "next/server";
import { z } from "zod";

import { TASK_ID, userSupabase, withAuth } from "@/lib/api/handler";
import { apiOk, NO_ACCESS, NO_TASK, rpcFailure, rpcResult } from "@/lib/api/respond";
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
    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("answer_deadline_request", {
      task_id: taskId,
      approve: body.approve,
      client_request_id: body.client_request_id,
    });

    if (error) {
      return rpcFailure(
        error,
        {
          task_not_found: NO_TASK,
          forbidden: NO_ACCESS,
          no_request: [409, "Просьбы уже нет — задачу сдали или срок уже решён"],
          invalid_transition: [409, "Задача уже не в работе"],
        },
        "answer_deadline_request",
      );
    }

    after(() => kickDeliveries());

    return apiOk(rpcResult(data));
  },
  BodySchema,
  { id: TASK_ID },
);
