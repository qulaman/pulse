import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";

/**
 * Hard delete of one order — cleanup, not a status. Revoke (D-01) is the way to take
 * an order back from an employee; delete is for wrong and test ones and leaves no trace.
 *
 * Idempotent (принцип 7): the tap waits out «Отменить» and a copy waits in the phone's
 * outbox (D-139), so the same delete can arrive twice — after a page closed mid-call, or
 * from two directors at once. What is already gone answers «ok, nothing deleted».
 */
export const POST = withAuth(["director"], async ({ req, params }) => {
  const taskId = params.id;
  if (!z.uuid().safeParse(taskId).success) {
    return apiError(404, "task_not_found", "Задача не найдена");
  }

  const supabase = await userSupabase(req);
  const { data, error } = await supabase.rpc("delete_task", { task_id: taskId });

  if (error) {
    if (error.message.includes("task_not_found")) {
      return apiOk({ result: { deleted: 0 } });
    }
    if (error.message.includes("forbidden")) {
      return apiError(403, "forbidden", "Нет доступа");
    }
    throw new Error(`delete_task failed: ${error.message}`);
  }

  return apiOk({ result: data ?? {} });
});
