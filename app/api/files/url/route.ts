import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { createServiceSupabase } from "@/lib/supabase/service";

const TTL_SECONDS = 600;

/**
 * Signed URL for a photo attached to a task message. Who may look is decided by
 * task_messages RLS: the lookup runs as the caller, so only the participants of
 * that task (and the director) get a row back — then the service client signs.
 */
export const GET = withAuth("any", async ({ req, profile }) => {
  const path = new URL(req.url).searchParams.get("path");
  if (!path) return apiError(400, "validation_error", "Неверный запрос");
  if (!path.startsWith(`${profile.companyId}/`)) return apiError(403, "forbidden", "Нет доступа");

  const supabase = await userSupabase(req);
  const { data: message, error } = await supabase
    .from("task_messages")
    .select("id")
    .eq("file_path", path)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`file-url lookup failed: ${error.message}`);
  if (!message) return apiError(403, "forbidden", "Нет доступа");

  const signed = await createServiceSupabase().storage.from("photos").createSignedUrl(path, TTL_SECONDS);
  if (signed.error || !signed.data) {
    console.error("photo sign failed:", signed.error?.message);
    return apiError(502, "sign_failed", "Не удалось открыть фото, попробуй ещё раз");
  }
  return apiOk({ url: signed.data.signedUrl, expires_in: TTL_SECONDS });
});
