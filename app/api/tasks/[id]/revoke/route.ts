import { z } from "zod";

import { TASK_ID, userSupabase, withAuth } from "@/lib/api/handler";
import { apiOk, NO_ACCESS, NO_TASK, rpcFailure, rpcResult, STATUS_MOVED } from "@/lib/api/respond";

const BodySchema = z.strictObject({
  client_request_id: z.uuid(),
});

/**
 * D-01: editing a task = revoke + new one. A task still `scheduled` reached
 * nobody and is deleted outright — the RPC decides which of the two happens.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director"],
  async ({ req, body, params }) => {
    const taskId = params.id;
    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("revoke_task", {
      task_id: taskId,
      client_request_id: body.client_request_id,
    });

    if (error) {
      return rpcFailure(error, { task_not_found: NO_TASK, forbidden: NO_ACCESS, invalid_transition: STATUS_MOVED }, "revoke_task");
    }

    return apiOk(rpcResult(data));
  },
  BodySchema,
  { id: TASK_ID },
);
