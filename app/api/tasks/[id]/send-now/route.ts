import { after } from "next/server";
import { z } from "zod";

import { TASK_ID, userSupabase, withAuth } from "@/lib/api/handler";
import { apiOk, NO_ACCESS, NO_TASK, rpcFailure, rpcResult } from "@/lib/api/respond";
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
    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("send_task_now", {
      task_id: params.id,
      client_request_id: body.client_request_id,
    });

    if (error) return rpcFailure(error, { task_not_found: NO_TASK, forbidden: NO_ACCESS }, "send_task_now");

    // the rows are due now; send them once the response is on its way
    after(() => kickDeliveries());
    return apiOk(rpcResult(data));
  },
  BodySchema,
  { id: TASK_ID },
);
