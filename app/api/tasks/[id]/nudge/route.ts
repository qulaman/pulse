import { after } from "next/server";
import { z } from "zod";

import { TASK_ID, userSupabase, withAuth } from "@/lib/api/handler";
import { apiOk, NO_ACCESS, NO_TASK, rpcFailure, rpcResult } from "@/lib/api/respond";
import { kickDeliveries } from "@/lib/push/send";

const BodySchema = z.strictObject({
  client_request_id: z.uuid(),
});

/**
 * «Напомнить» (D-128): one push to the assignee and a line in the thread, not more often than
 * every half hour — a second tap answers with the time of the first (`too_soon`), not a buzz.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director"],
  async ({ req, body, params }) => {
    const taskId = params.id;
    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("nudge_task", {
      task_id: taskId,
      client_request_id: body.client_request_id,
    });

    if (error) {
      return rpcFailure(
        error,
        { task_not_found: NO_TASK, forbidden: NO_ACCESS, invalid_transition: [409, "Задача уже не в работе — напоминать не о чем"] },
        "nudge_task",
      );
    }

    const answer = rpcResult(data);
    if (!answer.result.too_soon) after(() => kickDeliveries());
    return apiOk(answer);
  },
  BodySchema,
  { id: TASK_ID },
);
