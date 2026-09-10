import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { createServiceSupabase } from "@/lib/supabase/service";

const TTL_SECONDS = 600;

/**
 * Signed URL for the original recording behind a task (принцип 5: the audio is
 * reachable by the person the task is addressed to). Who may listen is decided
 * by RLS: the lookup runs as the caller, so only a director or a participant of
 * that task gets a row back — the service client then signs the object.
 */
export const GET = withAuth("any", async ({ req, profile }) => {
  const path = new URL(req.url).searchParams.get("path");
  if (!path) return apiError(400, "validation_error", "Неверный запрос");

  // Objects live at {company_id}/{user_id}/{uuid}.{ext} — never cross a company.
  if (!path.startsWith(`${profile.companyId}/`)) {
    return apiError(403, "forbidden", "Нет доступа");
  }

  const supabase = await userSupabase(req);
  const { data: task, error } = await supabase
    .from("tasks")
    .select("id")
    .eq("source_audio_path", path)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`audio-url lookup failed: ${error.message}`);
  if (!task) {
    // not a task recording — maybe an announcement (Эфир is company-wide)
    const { data: announcement } = await supabase
      .from("announcements")
      .select("id")
      .eq("audio_path", path)
      .limit(1)
      .maybeSingle();
    if (!announcement) return apiError(403, "forbidden", "Нет доступа");
  }

  const service = createServiceSupabase();
  const signed = await service.storage.from("voice").createSignedUrl(path, TTL_SECONDS);
  if (signed.error || !signed.data) {
    console.error("createSignedUrl failed:", signed.error?.message);
    return apiError(502, "audio_url_failed", "Не смог открыть аудио, попробуй ещё раз");
  }

  return apiOk({ url: signed.data.signedUrl, expires_in: TTL_SECONDS });
});
