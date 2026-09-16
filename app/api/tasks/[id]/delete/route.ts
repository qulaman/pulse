import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";

/**
 * Hard delete of one order — cleanup, not a status. Revoke (D-01) is the way to take
 * an order back from an employee; delete is for wrong and test ones and leaves no trace.
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
      return apiError(404, "task_not_found", "Задача не найдена");
    }
    if (error.message.includes("forbidden")) {
      return apiError(403, "forbidden", "Нет доступа");
    }
    throw new Error(`delete_task failed: ${error.message}`);
  }

  return apiOk({ result: data ?? {} });
});
