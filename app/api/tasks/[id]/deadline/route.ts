import { after } from "next/server";
import { z } from "zod";

import { TASK_ID, userSupabase, withAuth } from "@/lib/api/handler";
import { apiOk, NO_ACCESS, NO_TASK, rpcFailure, rpcResult } from "@/lib/api/respond";
import { kickDeliveries } from "@/lib/push/send";

const BodySchema = z.strictObject({
  /** null — «без срока» */
  deadline_iso: z.string().datetime({ offset: true }).nullable(),
  client_request_id: z.uuid(),
});

/**
 * The deadline capsule and «Перенести» (D-187): the director moves (or removes) the deadline of an
 * open task. One RPC — the new date, a system line in the thread, a push to the assignee (principle
 * 7); a task held for later takes it quietly, a time behind is refused, the same date writes nothing.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director"],
  async ({ req, body, params }) => {
    const taskId = params.id;
    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("extend_task_deadline", {
      task_id: taskId,
      // «без срока» is null, and the RPC takes it; the generated Args type drops the
      // nullability of a function argument, so the cast says what the SQL signature says
      new_deadline: body.deadline_iso as string,
      client_request_id: body.client_request_id,
    });

    if (error) {
      return rpcFailure(
        error,
        {
          task_not_found: NO_TASK,
          forbidden: NO_ACCESS,
          deadline_in_past: [422, "Это время уже прошло — выберите позже"],
          deadline_before_send: [422, "Задача уйдёт позже этого времени — выберите позже"],
          invalid_transition: [409, "Задача закрыта — срок уже не меняется"],
        },
        "extend_task_deadline",
      );
    }

    // the push about the new deadline goes out right away, not with the next sweep
    after(() => kickDeliveries());

    return apiOk(rpcResult(data));
  },
  BodySchema,
  { id: TASK_ID },
);
