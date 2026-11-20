import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiOk, NO_ACCESS, rpcFailure } from "@/lib/api/respond";

/** «Очистить закрытые»: every done / declined / revoked order of the company, gone for good. */
export const POST = withAuth(["director"], async ({ req }) => {
  const supabase = await userSupabase(req);
  const { data, error } = await supabase.rpc("purge_closed_tasks");

  if (error) {
    return rpcFailure(error, { forbidden: NO_ACCESS }, "purge_closed_tasks");
  }

  const deleted = Number((data as { deleted?: number } | null)?.deleted ?? 0);
  return apiOk({ deleted });
});
