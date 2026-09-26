import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { createServiceSupabase } from "@/lib/supabase/service";

const TTL_SECONDS = 600;

/**
 * Signed URL for the original recording behind a row (принцип 5: the audio is reachable
 * by the person it was said to, and by whoever said it). Who may listen is decided by
 * RLS: every lookup runs as the caller, so only someone who sees a row holding this
 * recording gets one back — the service client then signs the object.
 */
export const GET = withAuth("any", async ({ req, profile }) => {
  const path = new URL(req.url).searchParams.get("path");
  if (!path) return apiError(400, "validation_error", "Неверный запрос");

  // Objects live at {company_id}/{user_id}/{uuid}.{ext} — never cross a company.
  if (!path.startsWith(`${profile.companyId}/`)) {
    return apiError(403, "forbidden", "Нет доступа");
  }

  const supabase = await userSupabase(req);
  // the rows a recording can stand behind, most common first: a task (its director and
  // participants), an announcement (Эфир is company-wide), a note — also a point or a
  // sub-point of a board — (its author only, D-75 §3, D-121), a calendar event (whoever
  // sees the event)
  const lookups = [
    () => supabase.from("tasks").select("id").eq("source_audio_path", path).limit(1).maybeSingle(),
    () => supabase.from("announcements").select("id").eq("audio_path", path).limit(1).maybeSingle(),
    () => supabase.from("notes").select("id").eq("audio_path", path).limit(1).maybeSingle(),
    () => supabase.from("events").select("id").eq("audio_path", path).limit(1).maybeSingle(),
  ];
  let seen = false;
  for (const lookup of lookups) {
    const { data, error } = await lookup();
    if (error) throw new Error(`audio-url lookup failed: ${error.message}`);
    if (data) {
      seen = true;
      break;
    }
  }
  if (!seen) return apiError(403, "forbidden", "Нет доступа");

  const service = createServiceSupabase();
  const signed = await service.storage.from("voice").createSignedUrl(path, TTL_SECONDS);
  if (signed.error || !signed.data) {
    console.error("createSignedUrl failed:", signed.error?.message);
    return apiError(502, "audio_url_failed", "Не смог открыть аудио, попробуй ещё раз");
  }

  return apiOk({ url: signed.data.signedUrl, expires_in: TTL_SECONDS });
});
