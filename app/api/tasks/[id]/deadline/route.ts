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
 * «Продлить»: the director moves (or removes) the deadline of an open task. One RPC —
 * the new date, a system line in the thread, a push to the assignee (principle 7).
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
        { task_not_found: NO_TASK, forbidden: NO_ACCESS, invalid_transition: [409, "Задача уже закрыта — срок менять нечему"] },
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
