import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { createServiceSupabase } from "@/lib/supabase/service";

const TTL_SECONDS = 600;

/** Which bucket a message's file lives in — photos and voice are separate (D-18 open). */
const BUCKET: Record<string, string> = { photo: "photos", voice: "voice" };

/**
 * Signed URL for the file of a task message — a photo or a voice message. The message
 * is the unit of access: who may look is decided by task_messages RLS, so the lookup
 * runs as the caller (only participants of that task, and the director, get a row) and
 * the service client signs whatever path that row carries. The client never names a
 * storage path, so a path can never be guessed at.
 */
export const GET = withAuth("any", async ({ req }) => {
  const messageId = new URL(req.url).searchParams.get("message_id");
  if (!messageId || !z.uuid().safeParse(messageId).success) {
    return apiError(400, "validation_error", "Неверный запрос");
  }

  const supabase = await userSupabase(req);
  const { data: message, error } = await supabase
    .from("task_messages")
    .select("id, type, file_path")
    .eq("id", messageId)
    .maybeSingle();
  if (error) throw new Error(`file-url lookup failed: ${error.message}`);
  if (!message?.file_path) return apiError(403, "forbidden", "Нет доступа");

  const bucket = BUCKET[message.type];
  if (!bucket) return apiError(403, "forbidden", "Нет доступа");

  const signed = await createServiceSupabase().storage.from(bucket).createSignedUrl(message.file_path, TTL_SECONDS);
  if (signed.error || !signed.data) {
    console.error("file sign failed:", signed.error?.message);
    return apiError(502, "sign_failed", "Не удалось открыть файл, попробуй ещё раз");
  }
  return apiOk({ url: signed.data.signedUrl, expires_in: TTL_SECONDS });
});
