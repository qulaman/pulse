import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";

/** «Очистить закрытые»: every done / declined / revoked order of the company, gone for good. */
export const POST = withAuth(["director"], async ({ req }) => {
  const supabase = await userSupabase(req);
  const { data, error } = await supabase.rpc("purge_closed_tasks");

  if (error) {
    if (error.message.includes("forbidden")) {
      return apiError(403, "forbidden", "Нет доступа");
    }
    throw new Error(`purge_closed_tasks failed: ${error.message}`);
  }

  const deleted = Number((data as { deleted?: number } | null)?.deleted ?? 0);
  return apiOk({ deleted });
});
